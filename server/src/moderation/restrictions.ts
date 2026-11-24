import { isIP } from 'node:net';
import { and, asc, eq, gt, lt } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db/client.js';
import { ipRestrictions, userRestrictions } from '../db/schema.js';

export const USER_RESTRICTION_KINDS = ['chat', 'room_create'] as const;
export const IP_RESTRICTION_KINDS = ['chat', 'room_create', 'account_create'] as const;
export type UserRestrictionKind = (typeof USER_RESTRICTION_KINDS)[number];
export type IpRestrictionKind = (typeof IP_RESTRICTION_KINDS)[number];

export interface ActiveRestriction {
  until: Date;
  reason: string;
}

/**
 * IP 표기를 하나로 맞춘다: 소문자, IPv4-mapped IPv6(`::ffff:1.2.3.4`)는 IPv4로. 형식이 IP가 아니면 null.
 * 듀얼 스택 소켓은 IPv4 접속을 mapped 형태로 주므로, 운영자가 적은 IPv4와 같은 것으로 봐야 한다.
 */
export function normalizeIp(value: string): string | null {
  const lowered = value.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lowered);
  const ip = mapped ? mapped[1]! : lowered;
  return isIP(ip) === 0 ? null : ip;
}

function requireIp(value: string): string {
  const ip = normalizeIp(value);
  if (ip === null) throw new Error(`IP 형식이 아니다: ${value}`);
  return ip;
}

export async function restrictUser(
  db: DbExecutor,
  input: { userId: string; kind: UserRestrictionKind; until: Date; reason: string },
): Promise<void> {
  await db
    .insert(userRestrictions)
    .values(input)
    .onConflictDoUpdate({
      target: [userRestrictions.userId, userRestrictions.kind],
      set: { until: input.until, reason: input.reason, createdAt: new Date() },
    });
}

export async function restrictIp(
  db: DbExecutor,
  input: { ip: string; kind: IpRestrictionKind; until: Date; reason: string },
): Promise<void> {
  const ip = requireIp(input.ip);
  await db
    .insert(ipRestrictions)
    .values({ ...input, ip })
    .onConflictDoUpdate({
      target: [ipRestrictions.ip, ipRestrictions.kind],
      set: { until: input.until, reason: input.reason, createdAt: new Date() },
    });
}

/** 풀었으면 true, 걸려 있던 정지가 없으면 false. */
export async function unrestrictUser(db: DbExecutor, userId: string, kind: UserRestrictionKind): Promise<boolean> {
  const removed = await db
    .delete(userRestrictions)
    .where(and(eq(userRestrictions.userId, userId), eq(userRestrictions.kind, kind)))
    .returning({ userId: userRestrictions.userId });
  return removed.length > 0;
}

export async function unrestrictIp(db: DbExecutor, ip: string, kind: IpRestrictionKind): Promise<boolean> {
  const removed = await db
    .delete(ipRestrictions)
    .where(and(eq(ipRestrictions.ip, requireIp(ip)), eq(ipRestrictions.kind, kind)))
    .returning({ ip: ipRestrictions.ip });
  return removed.length > 0;
}

/** 지금(`now`, 서버 시각) 걸려 있는 계정 정지. 없으면 null. L4(방 만들기)·L5(채팅)가 쓴다. */
export async function activeUserRestriction(
  db: DbExecutor,
  userId: string,
  kind: UserRestrictionKind,
  now: Date,
): Promise<ActiveRestriction | null> {
  const [row] = await db
    .select({ until: userRestrictions.until, reason: userRestrictions.reason })
    .from(userRestrictions)
    .where(and(eq(userRestrictions.userId, userId), eq(userRestrictions.kind, kind), gt(userRestrictions.until, now)));
  return row ?? null;
}

/** 지금 걸려 있는 IP 정지. IP 형식이 아니면(테스트 주입 등) 정지가 없는 것으로 본다. */
export async function activeIpRestriction(
  db: DbExecutor,
  ip: string,
  kind: IpRestrictionKind,
  now: Date,
): Promise<ActiveRestriction | null> {
  const normalized = normalizeIp(ip);
  if (normalized === null) return null;
  const [row] = await db
    .select({ until: ipRestrictions.until, reason: ipRestrictions.reason })
    .from(ipRestrictions)
    .where(and(eq(ipRestrictions.ip, normalized), eq(ipRestrictions.kind, kind), gt(ipRestrictions.until, now)));
  return row ?? null;
}

export async function listActiveRestrictions(db: Db, now: Date) {
  const users = await db
    .select()
    .from(userRestrictions)
    .where(gt(userRestrictions.until, now))
    .orderBy(asc(userRestrictions.until));
  const ips = await db.select().from(ipRestrictions).where(gt(ipRestrictions.until, now)).orderBy(asc(ipRestrictions.until));
  return { users, ips };
}

/** 기한이 지난 정지를 지운다(정리 잡). IP를 필요 이상 두지 않는다. */
export async function purgeExpiredRestrictions(db: Db, now: Date): Promise<number> {
  const [users, ips] = await Promise.all([
    db.delete(userRestrictions).where(lt(userRestrictions.until, now)).returning({ k: userRestrictions.userId }),
    db.delete(ipRestrictions).where(lt(ipRestrictions.until, now)).returning({ k: ipRestrictions.ip }),
  ]);
  return users.length + ips.length;
}
