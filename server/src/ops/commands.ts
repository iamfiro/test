import { and, asc, desc, eq, gt, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import {
  chatMessages,
  leagueGroupMembers,
  leagueGroups,
  leagueMemberships,
  leagueWeeks,
  reports,
  studyRoomMembers,
  studyRooms,
  studySessions,
  userRestrictions,
  users,
} from '../db/schema.js';
import { deleteAccount } from '../auth/accounts.js';
import type { LeagueService } from '../league/service.js';
import { LEAGUE_TIMEZONE, weekStartOf } from '../league/week.js';
import type { RoomService } from '../rooms/service.js';
import { computeStreak } from '../study/streak.js';
import { addDays, isDateString, mondayOf, studyDateOf } from '../study/time.js';
import { weeklyMetrics } from './metrics.js';
import { hideMessage, restoreMessage } from '../chat/service.js';
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
import {
  acceptSuggestionAsAlias,
  acceptSuggestionAsTag,
  addAlias,
  addTag,
  catalogWithAliases,
  listSuggestions,
  mergeTags,
  rejectSuggestion,
  seedTags,
  TAG_KINDS,
  type TagKind,
} from '../tags/catalog.js';

export interface CliContext {
  db: Db;
  /** `tags merge`가 방 태그도 옮기도록 방 모듈이 넘긴다. 없으면 사용자 태그만 옮긴다. */
  moveTagRefs?: Parameters<typeof mergeTags>[3];
  now: () => Date;
  /** 리그 정산(`league settle`)에 필요하다. 없으면 그 명령만 실패한다. */
  league?: LeagueService;
  /** 강제 탈퇴(`users delete`)가 방 정리까지 하도록 넘긴다. 없으면 그 명령만 실패한다. */
  rooms?: RoomService;
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
  reports list [--pending | --handled] [--type message|nickname|room_name] [--limit N]
  messages show <메시지 id>                   본문·작성자·숨김 여부
  messages hide <메시지 id>                   모두에게서 숨김(그 메시지의 미처리 신고는 처리됨으로)
  messages restore <메시지 id>                숨김을 되돌림
  tags seed                                  study-tags.md 2절 초기 카탈로그(이미 있는 것은 건너뜀)
  tags list
  tags add <exam|kind> <이름>
  tags alias <정규 이름> <별칭>
  tags merge <없앨 이름> <남길 이름>          없앤 이름은 남길 태그의 별칭이 된다
  suggestions list [--pending] [--limit N]
  suggestions accept <제안 id> <exam|kind>   제안 이름으로 새 태그
  suggestions alias <제안 id> <정규 이름>     제안 이름을 기존 태그의 별칭으로
  suggestions reject <제안 id>
  league settle                              마감 + 지연이 지난 주를 오래된 것부터 정산(이미 한 주는 건너뜀)
  league weeks [--limit N]                   최근 리그 주 상태·그룹 수·인원
  metrics week [--week YYYY-MM-DD]           주간 지표(기본: 지난 주). 날짜가 든 주(월–일)
  users find <id 앞부분(4자 이상)>             id로 찾기(최대 20명)
  users find --nickname <닉네임>              닉네임이 같은 사람(최대 20명)
  users show <user_id>                       계정 요약(방·정지·리그·스트릭·신고)
  users delete <user_id> --yes               강제 탈퇴(내 데이터 지우기와 같음, 되돌릴 수 없음)`;

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

function tagKind(raw: string | undefined): TagKind {
  if (!(TAG_KINDS as readonly string[]).includes(raw ?? '')) throw new UsageError(`태그 종류는 ${TAG_KINDS.join(', ')} 중 하나: ${raw}`);
  return raw as TagKind;
}

function exactly(args: string[], n: number, usage: string): void {
  if (args.length !== n) throw new UsageError(usage);
}

async function tagsCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, ...rest] = args;
  switch (action) {
    case 'seed': {
      exactly(rest, 0, 'tags seed');
      const added = await seedTags(ctx.db);
      ctx.out(`seeded tags: ${added.tags} aliases: ${added.aliases}`);
      return;
    }
    case 'list':
      exactly(rest, 0, 'tags list');
      for (const tag of await catalogWithAliases(ctx.db)) ctx.out(JSON.stringify(tag));
      return;
    case 'add': {
      exactly(rest, 2, 'tags add <exam|kind> <이름>');
      const tag = await addTag(ctx.db, tagKind(rest[0]), rest[1]!);
      ctx.out(`added tag ${tag.name} (${tag.kind}) ${tag.id}`);
      return;
    }
    case 'alias': {
      exactly(rest, 2, 'tags alias <정규 이름> <별칭>');
      const tag = await addAlias(ctx.db, rest[0]!, rest[1]!);
      ctx.out(`added alias ${rest[1]} -> ${tag.name}`);
      return;
    }
    case 'merge': {
      exactly(rest, 2, 'tags merge <없앨 이름> <남길 이름>');
      const merged = await mergeTags(ctx.db, rest[0]!, rest[1]!, ctx.moveTagRefs);
      ctx.out(`merged ${merged.from} -> ${merged.into}`);
      return;
    }
    default:
      throw new UsageError('tags seed|list|add|alias|merge');
  }
}

async function suggestionsCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, ...rest] = args;
  if (action === 'list') {
    const { flags, rest: extra } = parseFlags(rest, ['pending', 'limit']);
    if (extra.length > 0) throw new UsageError(`남는 인자: ${extra.join(' ')}`);
    const limitRaw = stringFlag(flags, 'limit');
    const limit = limitRaw === undefined ? 100 : Math.floor(positiveNumber(limitRaw, 'limit'));
    for (const row of await listSuggestions(ctx.db, { pending: flags.has('pending'), limit })) {
      ctx.out(
        JSON.stringify({
          id: row.id,
          created_at: row.createdAt.toISOString(),
          name: row.name,
          user_id: row.userId,
          status: row.status,
          resolution: row.resolution,
          reviewed_at: row.reviewedAt?.toISOString() ?? null,
        }),
      );
    }
    return;
  }
  const id = rest[0];
  if (!id || !UUID.test(id)) throw new UsageError(`제안 id는 UUID여야 한다: ${id}`);
  if (action === 'accept') {
    exactly(rest, 2, 'suggestions accept <제안 id> <exam|kind>');
    const tag = await acceptSuggestionAsTag(ctx.db, id.toLowerCase(), tagKind(rest[1]));
    ctx.out(`accepted as tag ${tag.name} (${tag.kind})`);
    return;
  }
  if (action === 'alias') {
    exactly(rest, 2, 'suggestions alias <제안 id> <정규 이름>');
    const tag = await acceptSuggestionAsAlias(ctx.db, id.toLowerCase(), rest[1]!);
    ctx.out(`accepted as alias of ${tag.name}`);
    return;
  }
  if (action === 'reject') {
    exactly(rest, 1, 'suggestions reject <제안 id>');
    await rejectSuggestion(ctx.db, id.toLowerCase());
    ctx.out(`rejected ${id}`);
    return;
  }
  throw new UsageError('suggestions list|accept|alias|reject');
}

/**
 * 메시지 확인·숨김·복구. CLI는 서버와 다른 프로세스라 열려 있는 소켓에 바로 알리지 못한다: 숨김은 그 토픽에
 * 다시 들어올 때(`joined`)부터 빠진다. 바로 지워야 하면 신고 기준 도달(서버가 `message_hidden`을 보냄)을 쓴다.
 */
async function messagesCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, id, ...extra] = args;
  if (extra.length > 0) throw new UsageError(`남는 인자: ${extra.join(' ')}`);
  if (!id || !UUID.test(id)) throw new UsageError(`메시지 id는 UUID여야 한다: ${id}`);
  const messageId = id.toLowerCase();
  const [row] = await ctx.db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
  if (!row) throw new Error(`없는 메시지: ${messageId}`);
  if (action === 'show') {
    ctx.out(
      JSON.stringify({
        id: row.id,
        topic: row.topic,
        author_user_id: row.authorUserId,
        body: row.body,
        sent_at: row.createdAt.toISOString(),
        hidden_at: row.hiddenAt?.toISOString() ?? null,
      }),
    );
    return;
  }
  if (action === 'hide') {
    const now = ctx.now();
    const hidden = await ctx.db.transaction(async (tx) => {
      const changed = await hideMessage(tx, messageId, now);
      await tx
        .update(reports)
        .set({ handledAt: now, action: 'message_hidden' })
        .where(and(eq(reports.targetType, 'message'), eq(reports.targetId, messageId), isNull(reports.handledAt)));
      return changed;
    });
    ctx.out(hidden ? `hidden ${messageId}` : `already hidden ${messageId}`);
    return;
  }
  if (action === 'restore') {
    ctx.out((await restoreMessage(ctx.db, messageId)) ? `restored ${messageId}` : `not hidden ${messageId}`);
    return;
  }
  throw new UsageError('messages show|hide|restore <메시지 id>');
}

async function leagueCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, ...rest] = args;
  if (action === 'settle') {
    exactly(rest, 0, 'league settle');
    if (!ctx.league) throw new Error('league settle에는 리그 서비스가 필요하다');
    const weeks = await ctx.league.settleDue();
    if (weeks.length === 0) ctx.out('nothing due');
    for (const week of weeks) ctx.out(`settled week_start: ${new Date(week).toISOString()}`);
    return;
  }
  if (action === 'weeks') {
    const { flags, rest: extra } = parseFlags(rest, ['limit']);
    if (extra.length > 0) throw new UsageError(`남는 인자: ${extra.join(' ')}`);
    const limitRaw = stringFlag(flags, 'limit');
    const limit = limitRaw === undefined ? 8 : Math.floor(positiveNumber(limitRaw, 'limit'));
    const weeks = await ctx.db.select().from(leagueWeeks).orderBy(desc(leagueWeeks.weekStart)).limit(limit);
    for (const week of weeks) {
      const groups = await ctx.db
        .select({ league: leagueGroups.league, groups: sql<number>`count(distinct ${leagueGroups.id})::int`, members: sql<number>`count(${leagueGroupMembers.userId})::int` })
        .from(leagueGroups)
        .leftJoin(leagueGroupMembers, eq(leagueGroupMembers.groupId, leagueGroups.id))
        .where(eq(leagueGroups.weekStart, week.weekStart))
        .groupBy(leagueGroups.league)
        .orderBy(asc(leagueGroups.league));
      ctx.out(
        JSON.stringify({
          week_start: week.weekStart.toISOString(),
          status: week.status,
          settled_at: week.settledAt?.toISOString() ?? null,
          leagues: groups,
        }),
      );
    }
    return;
  }
  throw new UsageError('league settle|weeks');
}

async function metricsCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, ...rest] = args;
  if (action !== 'week') throw new UsageError('metrics week [--week YYYY-MM-DD]');
  const { flags, rest: extra } = parseFlags(rest, ['week']);
  if (extra.length > 0) throw new UsageError(`남는 인자: ${extra.join(' ')}`);
  const raw = stringFlag(flags, 'week');
  if (raw !== undefined && !isDateString(raw)) throw new UsageError(`--week는 YYYY-MM-DD: ${raw}`);
  // 기본은 끝난 지난 주(리그 시간대 기준 이번 주 월요일의 7일 전).
  const monday = raw !== undefined ? mondayOf(raw) : addDays(mondayOf(studyDateOf(weekStartOf(ctx.now().getTime()), LEAGUE_TIMEZONE)), -7);
  ctx.out(JSON.stringify(await weeklyMetrics(ctx.db, monday)));
}

const userSummary = (row: typeof users.$inferSelect) => ({ id: row.id, nickname: row.nickname, created_at: row.createdAt.toISOString() });

/**
 * 사용자 조회·강제 탈퇴. 계정은 익명이라 이메일이 없다(로그인을 붙이면 마스킹해서 보인다). CLI는 운영자가 다음 명령
 * (`restrict user` 등)에 쓸 수 있게 전체 id를 표준 출력에 낸다(서버 로그의 앞 4자 규칙은 로그에만 적용).
 */
async function usersCommand(ctx: CliContext, args: string[]): Promise<void> {
  const [action, ...rest] = args;
  if (action === 'find') {
    const { flags, rest: positional } = parseFlags(rest, ['nickname']);
    const nickname = stringFlag(flags, 'nickname');
    let rows: (typeof users.$inferSelect)[];
    if (nickname !== undefined) {
      if (positional.length > 0) throw new UsageError(`남는 인자: ${positional.join(' ')}`);
      rows = await ctx.db.select().from(users).where(eq(users.nickname, nickname)).orderBy(asc(users.createdAt)).limit(20);
    } else {
      exactly(positional, 1, 'users find <id 앞부분(4자 이상)> | users find --nickname <닉네임>');
      const prefix = positional[0]!.toLowerCase();
      if (!/^[0-9a-f-]{4,36}$/.test(prefix)) throw new UsageError(`id 앞부분은 16진수 4자 이상: ${prefix}`);
      rows = await ctx.db
        .select()
        .from(users)
        .where(sql`${users.id}::text like ${`${prefix}%`}`)
        .orderBy(asc(users.createdAt))
        .limit(20);
    }
    if (rows.length === 0) ctx.out('no users');
    for (const row of rows) ctx.out(JSON.stringify(userSummary(row)));
    return;
  }
  if (action === 'show') {
    exactly(rest, 1, 'users show <user_id>');
    const id = userId(rest[0]);
    const [row] = await ctx.db.select().from(users).where(eq(users.id, id));
    if (!row) throw new Error(`없는 사용자: ${id}`);
    const now = ctx.now();
    const [room] = await ctx.db
      .select({ roomId: studyRoomMembers.roomId, hostUserId: studyRooms.hostUserId })
      .from(studyRoomMembers)
      .innerJoin(studyRooms, eq(studyRoomMembers.roomId, studyRooms.id))
      .where(eq(studyRoomMembers.userId, id));
    const restrictions = await ctx.db
      .select({ kind: userRestrictions.kind, until: userRestrictions.until, reason: userRestrictions.reason })
      .from(userRestrictions)
      .where(and(eq(userRestrictions.userId, id), gt(userRestrictions.until, now)));
    const [membership] = await ctx.db.select().from(leagueMemberships).where(eq(leagueMemberships.userId, id));
    const [sessions] = await ctx.db
      .select({
        finished: sql<number>`count(*) filter (where ${studySessions.status} = 'finished')::int`,
        active: sql<number>`count(*) filter (where ${studySessions.status} = 'active')::int`,
      })
      .from(studySessions)
      .where(eq(studySessions.userId, id));
    const [received] = await ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${reports.handledAt} is null)::int`,
      })
      .from(reports)
      .where(eq(reports.targetUserId, id));
    const [filed] = await ctx.db.select({ total: sql<number>`count(*)::int` }).from(reports).where(eq(reports.reporterUserId, id));
    const streak = await computeStreak(ctx.db, id, LEAGUE_TIMEZONE, now);
    ctx.out(
      JSON.stringify({
        ...userSummary(row),
        email: null,
        onboarding_completed_at: row.onboardingCompletedAt?.toISOString() ?? null,
        room: room ? { room_id: room.roomId, is_host: room.hostUserId === id } : null,
        restrictions: restrictions.map((r) => ({ kind: r.kind, until: r.until.toISOString(), reason: r.reason })),
        league: membership?.league ?? 'general',
        streak_current: streak.current,
        sessions: sessions ?? { finished: 0, active: 0 },
        reports_received: received ?? { total: 0, pending: 0 },
        reports_filed: filed?.total ?? 0,
      }),
    );
    return;
  }
  if (action === 'delete') {
    const { flags, rest: positional } = parseFlags(rest, ['yes']);
    exactly(positional, 1, 'users delete <user_id> --yes');
    const id = userId(positional[0]);
    if (flags.get('yes') !== true) throw new UsageError('강제 탈퇴는 되돌릴 수 없다. 확인하려면 --yes를 붙인다');
    const [row] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, id));
    if (!row) throw new Error(`없는 사용자: ${id}`);
    if (!ctx.rooms) throw new Error('users delete에는 방 서비스가 필요하다');
    await deleteAccount(ctx.rooms, id);
    ctx.out(`deleted user ${id}`);
    return;
  }
  throw new UsageError('users find|show|delete');
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
      case 'messages':
        await messagesCommand(ctx, args);
        break;
      case 'tags':
        await tagsCommand(ctx, args);
        break;
      case 'suggestions':
        await suggestionsCommand(ctx, args);
        break;
      case 'league':
        await leagueCommand(ctx, args);
        break;
      case 'metrics':
        await metricsCommand(ctx, args);
        break;
      case 'users':
        await usersCommand(ctx, args);
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
