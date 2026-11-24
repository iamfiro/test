import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'sv_session';
export const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;
/** 이 간격 안에서는 만료를 다시 밀지 않는다(쓸 때마다 쓰기를 하지 않으려고). `/auth/session`은 늘 민다. */
export const TOUCH_INTERVAL_SECONDS = 60 * 60;

export type UserRow = typeof users.$inferSelect;

export interface AuthContext {
  user: UserRow;
  sessionHash: string;
  csrfToken: string;
  /** 이번 요청에서 만료를 밀었으면 true(쿠키 수명도 함께 밀어야 한다). */
  touched: boolean;
}

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
const randomToken = (): string => randomBytes(32).toString('base64url');

export async function createSession(db: DbExecutor, userId: string): Promise<{ token: string; csrfToken: string }> {
  const token = randomToken();
  const csrfToken = randomToken();
  await db.insert(sessions).values({
    idHash: hashToken(token),
    userId,
    csrfToken,
    expiresAt: sql`now() + make_interval(secs => ${SESSION_TTL_SECONDS})`,
  });
  return { token, csrfToken };
}

/** 쿠키 값으로 살아 있는 세션과 사용자를 찾는다. 없거나 만료면 null. */
export async function findSession(db: DbExecutor, token: string, options: { touch: 'always' | 'throttled' }): Promise<AuthContext | null> {
  const idHash = hashToken(token);
  const [found] = await db
    .select({ user: users, csrfToken: sessions.csrfToken, lastUsedAt: sessions.lastUsedAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.idHash, idHash), sql`${sessions.expiresAt} > now()`));
  if (!found) return null;
  const stale = Date.now() - found.lastUsedAt.getTime() > TOUCH_INTERVAL_SECONDS * 1000;
  const touched = options.touch === 'always' || stale;
  if (touched) {
    await db
      .update(sessions)
      .set({ lastUsedAt: sql`now()`, expiresAt: sql`now() + make_interval(secs => ${SESSION_TTL_SECONDS})` })
      .where(eq(sessions.idHash, idHash));
  }
  return { user: found.user, sessionHash: idHash, csrfToken: found.csrfToken, touched };
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}
