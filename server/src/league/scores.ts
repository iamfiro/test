import { and, asc, eq, lt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { leagueGroupMembers, leagueGroups, leagueMemberships, leagueWeeks } from '../db/schema.js';
import { GROUP_SIZE, type League } from './rules.js';
import { weekEndOf } from './week.js';

/**
 * 리그 점수 갱신. 타이머가 세션의 인정 구간(`ranked_segments`)을 다시 계산하는 **같은 트랜잭션**에서, 그 세션이 걸친
 * 리그 주마다 부른다(호출자가 계정 잠금을 잡고 있다). 점수는 더하지 않고 그 주 인정 구간 합으로 다시 계산하므로
 * 같은 신호를 여러 번 받아도 늘지 않는다.
 *
 * 잠금 순서(교착 방지): 계정 잠금 → 리그 주 행 FOR SHARE → 배정 잠금. 정산은 정산 잠금 → 리그 주 행 FOR UPDATE만
 * 잡고 계정 잠금은 잡지 않는다(정산 뒤 리그를 옮긴 사람의 다음 주 그룹 정리는 커밋 뒤 따로 한다).
 */

const weekDate = (ms: number) => new Date(ms);

/** 그 주 이 사람의 인정 공부 초와 그 점수에 닿은 시각(주 안으로 자른 마지막 구간 끝). */
async function weekScore(tx: DbExecutor, userId: string, weekStart: number): Promise<{ seconds: number; reachedAt: Date | null }> {
  const start = weekDate(weekStart);
  const end = weekDate(weekEndOf(weekStart));
  const result = await tx.execute<{ ms: string | null; reached: Date | string | null }>(sql`
    select
      sum(extract(epoch from (least(ended_at, ${end}) - greatest(started_at, ${start}))) * 1000) as ms,
      max(least(ended_at, ${end})) as reached
    from ranked_segments
    where user_id = ${userId} and started_at < ${end} and ended_at > ${start}
  `);
  const row = result.rows[0];
  const ms = row?.ms === null || row?.ms === undefined ? 0 : Number(row.ms);
  const reached = row?.reached ? new Date(row.reached) : null;
  return { seconds: Math.floor(Math.round(ms) / 1000), reachedAt: ms > 0 ? reached : null };
}

/** 이 주에 적용되는 리그: 소속 행이 없으면 일반. */
async function leagueFor(tx: DbExecutor, userId: string, weekStart: number): Promise<League> {
  const [membership] = await tx.select().from(leagueMemberships).where(eq(leagueMemberships.userId, userId));
  if (membership) return membership.league;
  await tx.insert(leagueMemberships).values({ userId, league: 'general', sinceWeek: weekDate(weekStart) }).onConflictDoNothing();
  return 'general';
}

/**
 * 그 리그의 열린 그룹(30명 미만, 가장 먼저 만든 것)에 넣는다. 없으면 새로 만든다. (주, 리그)마다 배정 잠금을 잡아
 * 동시에 처음 공부한 사람들이 같은 자리를 두고 다투지 않게 한다. 한 사람 한 주 한 행은 PK가 지킨다.
 */
async function assign(tx: DbExecutor, userId: string, weekStart: number, league: League, score: { seconds: number; reachedAt: Date | null }) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`league-assign:${weekStart}:${league}`}, 0))`);
  const [open] = await tx
    .select({ id: leagueGroups.id })
    .from(leagueGroups)
    .where(and(eq(leagueGroups.weekStart, weekDate(weekStart)), eq(leagueGroups.league, league), lt(leagueGroups.memberCount, GROUP_SIZE)))
    .orderBy(asc(leagueGroups.createdAt), asc(leagueGroups.id))
    .limit(1);
  let groupId = open?.id;
  if (!groupId) {
    const [created] = await tx.insert(leagueGroups).values({ weekStart: weekDate(weekStart), league }).returning({ id: leagueGroups.id });
    groupId = created!.id;
  }
  await tx
    .update(leagueGroups)
    .set({ memberCount: sql`${leagueGroups.memberCount} + 1` })
    .where(eq(leagueGroups.id, groupId));
  await tx.insert(leagueGroupMembers).values({
    weekStart: weekDate(weekStart),
    userId,
    groupId,
    scoreSeconds: score.seconds,
    lastScoredAt: score.reachedAt,
  });
}

/**
 * 한 주의 점수를 다시 계산해 바꾼다. 정산이 끝난 주는 건드리지 않는다(늦게 온 presence는 버린다). 그룹이 그 주 리그와
 * 다르면(정산 전에 새 주를 시작한 승급·강등자) 그 리그의 그룹으로 옮긴다.
 */
export async function syncLeagueWeek(tx: DbExecutor, userId: string, weekStart: number): Promise<void> {
  const score = await weekScore(tx, userId, weekStart);
  const [current] = await tx
    .select({ groupId: leagueGroupMembers.groupId, league: leagueGroups.league })
    .from(leagueGroupMembers)
    .innerJoin(leagueGroups, eq(leagueGroupMembers.groupId, leagueGroups.id))
    .where(and(eq(leagueGroupMembers.weekStart, weekDate(weekStart)), eq(leagueGroupMembers.userId, userId)));
  if (!current && score.reachedAt === null) return; // 이 주 인정 시간이 없고 그룹에도 없다

  await tx.insert(leagueWeeks).values({ weekStart: weekDate(weekStart), status: 'open' }).onConflictDoNothing();
  const [week] = await tx.execute<{ status: string }>(
    sql`select status from league_weeks where week_start = ${weekDate(weekStart)} for share`,
  ).then((r) => r.rows);
  if (week?.status !== 'open') return;

  const league = await leagueFor(tx, userId, weekStart);
  if (!current) {
    await assign(tx, userId, weekStart, league, score);
    return;
  }
  if (league !== current.league) {
    // 정산이 끝나기 전에 들어간 그룹: 그 주 리그가 정해졌으니 옮긴다(이 자리는 탈퇴가 아니라 바로잡기라 인원을 줄인다).
    await tx
      .delete(leagueGroupMembers)
      .where(and(eq(leagueGroupMembers.weekStart, weekDate(weekStart)), eq(leagueGroupMembers.userId, userId)));
    await tx
      .update(leagueGroups)
      .set({ memberCount: sql`${leagueGroups.memberCount} - 1` })
      .where(eq(leagueGroups.id, current.groupId));
    await assign(tx, userId, weekStart, league, score);
    return;
  }
  await tx
    .update(leagueGroupMembers)
    .set({ scoreSeconds: score.seconds, lastScoredAt: score.reachedAt })
    .where(and(eq(leagueGroupMembers.weekStart, weekDate(weekStart)), eq(leagueGroupMembers.userId, userId)));
}
