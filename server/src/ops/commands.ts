import { and, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { reports, users } from '../db/schema.js';
import { readSettings, writeSetting, SETTING_KEYS, isSettingKey } from '../moderation/settings.js';
import {
  IP_RESTRICTION_KINDS,
  listActiveRestrictions,
  normalizeIp,
  restrictIp,
  restrictUser,
  unrestrictIp,
  unrestrictUser,
  USER_RESTRICTION_KINDS,
  type IpRestrictionKind,
  type UserRestrictionKind,
} from '../moderation/restrictions.js';

export interface CliContext {
  db: Db;
  now: () => Date;
  /** 명령 결과(표준 출력). */
  out: (line: string) => void;
  /** 오류·사용법(표준 오류). */
  err: (line: string) => void;
}

export const USAGE = `사용법: npm run cli -- <명령>
  settings get [키]
  settings set <키> <true|false>        키: ${SETTING_KEYS.join(', ')}
  restrict user <user_id> <${USER_RESTRICTION_KINDS.join('|')}> (--hours N | --days N | --until ISO시각) --reason "사유"
  restrict ip <ip> <${IP_RESTRICTION_KINDS.join('|')}> (--hours N | --days N | --until ISO시각) --reason "사유"
  unrestrict user <user_id> <종류>
  unrestrict ip <ip> <종류>
  restrictions list
  reports list [--pending | --handled] [--type message|nickname|room_name] [--limit N]`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR_MS = 60 * 60 * 1000;
const REPORT_TYPES = ['message', 'nickname', 'room_name'] as const;

class UsageError extends Error {}

function parseFlags(args: string[], allowed: string[]): { flags: Map<string, string | true>; rest: string[] } {
  const flags = new Map<string, string | true>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (!allowed.includes(name)) throw new UsageError(`모르는 옵션: ${arg}`);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(name, next);
      i += 1;
    } else flags.set(name, true);
  }
  return { flags, rest };
}

function stringFlag(flags: Map<string, string | true>, name: string): string | undefined {
  const value = flags.get(name);
  if (value === true) throw new UsageError(`--${name}에 값이 없다`);
  return value;
}

function positiveNumber(raw: string, name: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new UsageError(`--${name}는 양수여야 한다: ${raw}`);
  return value;
}

/** 기한(정확히 하나)과 사유(필수)를 읽는다. */
function parseRestriction(flags: Map<string, string | true>, now: Date): { until: Date; reason: string } {
  const hours = stringFlag(flags, 'hours');
  const days = stringFlag(flags, 'days');
  const untilRaw = stringFlag(flags, 'until');
  const given = [hours, days, untilRaw].filter((value) => value !== undefined);
  if (given.length !== 1) throw new UsageError('기한은 --hours, --days, --until 중 하나만 준다');
  let until: Date;
  if (hours !== undefined) until = new Date(now.getTime() + positiveNumber(hours, 'hours') * HOUR_MS);
  else if (days !== undefined) until = new Date(now.getTime() + positiveNumber(days, 'days') * 24 * HOUR_MS);
  else {
    until = new Date(untilRaw!);
    if (Number.isNaN(until.getTime()) || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(untilRaw!)) {
      throw new UsageError(`--until은 시간대가 있는 ISO 시각이어야 한다: ${untilRaw}`);
    }
    if (until <= now) throw new UsageError('--until이 이미 지났다');
  }
  const reason = stringFlag(flags, 'reason')?.trim();
  if (!reason) throw new UsageError('--reason(사유)이 필요하다');
  return { until, reason };
}

function userKind(raw: string | undefined): UserRestrictionKind {
  if (!(USER_RESTRICTION_KINDS as readonly string[]).includes(raw ?? '')) {
    throw new UsageError(`계정 정지 종류는 ${USER_RESTRICTION_KINDS.join(', ')} 중 하나: ${raw}`);
  }
  return raw as UserRestrictionKind;
}

function ipKind(raw: string | undefined): IpRestrictionKind {
  if (!(IP_RESTRICTION_KINDS as readonly string[]).includes(raw ?? '')) {
    throw new UsageError(`IP 정지 종류는 ${IP_RESTRICTION_KINDS.join(', ')} 중 하나: ${raw}`);
  }
  return raw as IpRestrictionKind;
}

function userId(raw: string | undefined): string {
  if (!raw || !UUID.test(raw)) throw new UsageError(`user_id는 UUID여야 한다: ${raw}`);
  return raw.toLowerCase();
}

function ip(raw: string | undefined): string {
  const normalized = raw ? normalizeIp(raw) : null;
  if (normalized === null) throw new UsageError(`IP 형식이 아니다: ${raw}`);
  return normalized;
}

async function settingsCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, key, value] = args;
  if (action === 'get' && args.length <= 2) {
    const settings = await readSettings(ctx.db);
    if (key !== undefined && !isSettingKey(key)) throw new UsageError(`모르는 설정 키: ${key}`);
    for (const name of key ? [key as keyof typeof settings] : SETTING_KEYS) ctx.out(`${name}\t${settings[name]}`);
    return;
  }
  if (action === 'set' && args.length === 3) {
    if (!isSettingKey(key!)) throw new UsageError(`모르는 설정 키: ${key}`);
    if (value !== 'true' && value !== 'false') throw new UsageError(`값은 true 또는 false: ${value}`);
    const saved = await writeSetting(ctx.db, key!, value);
    ctx.out(`${saved.key}\t${saved.value}`);
    return;
  }
  throw new UsageError('settings 명령 형식이 틀렸다');
}

async function restrictCommand(ctx: CliContext, args: string[]): Promise<void> {
  const { flags, rest } = parseFlags(args, ['hours', 'days', 'until', 'reason']);
  const [scope, target, kindRaw, ...extra] = rest;
  if (extra.length > 0) throw new UsageError(`남는 인자: ${extra.join(' ')}`);
  const now = ctx.now();
  if (scope === 'user') {
    const id = userId(target);
    const kind = userKind(kindRaw);
    const { until, reason } = parseRestriction(flags, now);
    const [exists] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, id));
    if (!exists) throw new Error(`없는 사용자: ${id}`);
    await restrictUser(ctx.db, { userId: id, kind, until, reason });
    ctx.out(`restricted user ${id} ${kind} until ${until.toISOString()}`);
    return;
  }
  if (scope === 'ip') {
    const address = ip(target);
    const kind = ipKind(kindRaw);
    const { until, reason } = parseRestriction(flags, now);
    await restrictIp(ctx.db, { ip: address, kind, until, reason });
    ctx.out(`restricted ip ${address} ${kind} until ${until.toISOString()}`);
    return;
  }
  throw new UsageError('restrict 다음에는 user 또는 ip');
}

async function unrestrictCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [scope, target, kindRaw, ...extra] = args;
  if (extra.length > 0) throw new UsageError(`남는 인자: ${extra.join(' ')}`);
  let removed: boolean;
  if (scope === 'user') removed = await unrestrictUser(ctx.db, userId(target), userKind(kindRaw));
  else if (scope === 'ip') removed = await unrestrictIp(ctx.db, ip(target), ipKind(kindRaw));
  else throw new UsageError('unrestrict 다음에는 user 또는 ip');
  ctx.out(removed ? `unrestricted ${scope} ${target} ${kindRaw}` : `no restriction: ${scope} ${target} ${kindRaw}`);
}

async function restrictionsCommand(ctx: CliContext, args: string[]): Promise<void> {
  if (args.length !== 1 || args[0] !== 'list') throw new UsageError('restrictions list');
  const { users: userRows, ips } = await listActiveRestrictions(ctx.db, ctx.now());
  for (const row of userRows) {
    ctx.out(JSON.stringify({ scope: 'user', target: row.userId, kind: row.kind, until: row.until.toISOString(), reason: row.reason }));
  }
  for (const row of ips) {
    ctx.out(JSON.stringify({ scope: 'ip', target: row.ip, kind: row.kind, until: row.until.toISOString(), reason: row.reason }));
  }
}

async function reportsCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, ...rest] = args;
  if (action !== 'list') throw new UsageError('reports list');
  const { flags, rest: extra } = parseFlags(rest, ['pending', 'handled', 'type', 'limit']);
  if (extra.length > 0) throw new UsageError(`남는 인자: ${extra.join(' ')}`);
  if (flags.has('pending') && flags.has('handled')) throw new UsageError('--pending과 --handled는 함께 쓸 수 없다');
  const conditions: SQL[] = [];
  if (flags.has('pending')) conditions.push(isNull(reports.handledAt));
  if (flags.has('handled')) conditions.push(isNotNull(reports.handledAt));
  const type = stringFlag(flags, 'type');
  if (type !== undefined) {
    if (!(REPORT_TYPES as readonly string[]).includes(type)) throw new UsageError(`--type은 ${REPORT_TYPES.join(', ')} 중 하나`);
    conditions.push(eq(reports.targetType, type as (typeof REPORT_TYPES)[number]));
  }
  const limitRaw = stringFlag(flags, 'limit');
  const limit = limitRaw === undefined ? 50 : Math.floor(positiveNumber(limitRaw, 'limit'));
  const rows = await ctx.db
    .select()
    .from(reports)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(reports.createdAt))
    .limit(limit);
  for (const row of rows) {
    ctx.out(
      JSON.stringify({
        id: row.id,
        created_at: row.createdAt.toISOString(),
        target_type: row.targetType,
        target_id: row.targetId,
        target_user_id: row.targetUserId,
        content: row.content,
        reason: row.reason,
        detail: row.detail,
        reporter_user_id: row.reporterUserId,
        handled_at: row.handledAt?.toISOString() ?? null,
        action: row.action,
      }),
    );
  }
}

/** 운영 CLI 진입점(테스트가 직접 부른다). 종료 코드: 0 성공, 1 실행 오류, 2 사용법 오류. */
export async function runCli(argv: string[], ctx: CliContext): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case 'settings':
        await settingsCommand(ctx, args);
        break;
      case 'restrict':
        await restrictCommand(ctx, args);
        break;
      case 'unrestrict':
        await unrestrictCommand(ctx, args);
        break;
      case 'restrictions':
        await restrictionsCommand(ctx, args);
        break;
      case 'reports':
        await reportsCommand(ctx, args);
        break;
      default:
        throw new UsageError(command ? `모르는 명령: ${command}` : '명령이 없다');
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      ctx.err(`${error.message}\n${USAGE}`);
      return 2;
    }
    ctx.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
