import { and, eq, gt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { accountCreations, users } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { randomAvatar } from '../profile/avatar.js';
import { randomNickname } from '../profile/nickname.js';
import { createSession, type UserRow } from './session.js';

const WINDOW_SECONDS = 60 * 60;

export interface NewSession {
  user: UserRow;
  token: string;
  csrfToken: string;
}

/**
 * 이 IP가 최근 한 시간에 만든 계정 수가 상한 미만이면 익명 계정과 첫 세션을 만든다.
 * 같은 IP의 동시 요청이 상한을 넘기지 않도록 IP 단위 advisory lock 안에서 센다.
 */
export async function createAnonymousAccount(db: Db, ip: string, limitPerHour: number): Promise<NewSession> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`account-create:${ip}`}))`);
    const windowStart = sql`now() - make_interval(secs => ${WINDOW_SECONDS})`;
    const recent = await tx
      .select({ createdAt: accountCreations.createdAt })
      .from(accountCreations)
      .where(and(eq(accountCreations.ip, ip), gt(accountCreations.createdAt, windowStart)))
      .orderBy(accountCreations.createdAt);
    if (recent.length >= limitPerHour) {
      const oldest = recent[recent.length - limitPerHour]!.createdAt.getTime();
      throw errors.accountRateLimited(Math.max(1, Math.ceil((oldest + WINDOW_SECONDS * 1000 - Date.now()) / 1000)));
    }
    const [user] = await tx.insert(users).values({ nickname: randomNickname(), avatar: randomAvatar() }).returning();
    await tx.insert(accountCreations).values({ ip });
    const session = await createSession(tx, user!.id);
    return { user: user!, ...session };
  });
}

/** 개발 전용 로그인: 같은 subject는 같은 계정이다. */
export async function findOrCreateDevAccount(db: Db, subject: string): Promise<UserRow> {
  await db
    .insert(users)
    .values({ nickname: randomNickname(), avatar: randomAvatar(), devSubject: subject })
    .onConflictDoNothing({ target: users.devSubject });
  const [user] = await db.select().from(users).where(eq(users.devSubject, subject));
  return user!;
}
