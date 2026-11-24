import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { leagueGroupMembers, leagueGroups, leagueMemberships, rankedSegments } from '../db/schema.js';
import { LEAGUE_TIMEZONE } from '../league/week.js';
import { STREAK_MINIMUM_MS } from '../study/stats.js';
import { addDays, studyDayStart } from '../study/time.js';

export interface WeeklyMetrics {
  /** 주(월요일 날짜)와 리그 주 시작 시각. */
  week: string;
  league_week_start: string;
  /** 그 주(월–일 공부일)에 인정 공부 시간이 있는 사용자. 아래 비율의 분모. */
  active_users: number;
  /** 하루 10분 이상 공부한 날이 3일 이상인 사용자와 비율. */
  studied_3_days: number;
  studied_3_days_ratio: number | null;
  /** 그 주 안에 스트릭 7일·30일에 닿아 있던 사용자와 비율. */
  streak_7: number;
  streak_7_ratio: number | null;
  streak_30: number;
  streak_30_ratio: number | null;
  /** 그 리그 주에 그룹에 든 인원(리그별)과 그룹 수, 지금 리그 소속 인원(행이 없는 사람은 일반으로 치고 세지 않음). */
  league_participants: { general: number; top: number };
  league_groups: { general: number; top: number };
  league_memberships_now: { general: number; top: number };
}

const STREAK_MINIMUM_SECONDS = STREAK_MINIMUM_MS / 1000;
const ratio = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 1000);

/**
 * 주간 성공 지표(study-league.md §7). 공부일은 인정 구간의 `study_date`(세션 시간대 04:00)이고 주는 그 날짜의 월–일이다.
 * 도토리 지급 합계는 보상이 없어(launch.md M1) 내지 않는다.
 */
export async function weeklyMetrics(db: Db, monday: string): Promise<WeeklyMetrics> {
  const sunday = addDays(monday, 6);
  const leagueWeek = new Date(studyDayStart(monday, LEAGUE_TIMEZONE));

  const active = await db
    .selectDistinct({ userId: rankedSegments.userId })
    .from(rankedSegments)
    .where(and(gte(rankedSegments.studyDate, monday), lte(rankedSegments.studyDate, sunday)));
  const activeIds = active.map((r) => r.userId);

  // 그 주 활동자의 공부한 날(10분 이상) 전부(일요일까지). 스트릭은 주보다 길 수 있어 시작을 자르지 않는다.
  const studiedDays = new Map<string, string[]>();
  if (activeIds.length > 0) {
    const rows = await db
      .select({ userId: rankedSegments.userId, date: rankedSegments.studyDate })
      .from(rankedSegments)
      .where(and(inArray(rankedSegments.userId, activeIds), lte(rankedSegments.studyDate, sunday)))
      .groupBy(rankedSegments.userId, rankedSegments.studyDate)
      .having(sql`sum(extract(epoch from (${rankedSegments.endedAt} - ${rankedSegments.startedAt}))) >= ${STREAK_MINIMUM_SECONDS}`);
    for (const row of rows) studiedDays.set(row.userId, [...(studiedDays.get(row.userId) ?? []), row.date]);
  }

  let days3 = 0;
  let streak7 = 0;
  let streak30 = 0;
  for (const dates of studiedDays.values()) {
    dates.sort();
    if (dates.filter((d) => d >= monday).length >= 3) days3++;
    let run = 0;
    let previous: string | null = null;
    let best = 0;
    for (const date of dates) {
      run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
      previous = date;
      if (date >= monday) best = Math.max(best, run);
    }
    if (best >= 7) streak7++;
    if (best >= 30) streak30++;
  }

  const participants = await db
    .select({ league: leagueGroups.league, n: sql<number>`count(*)::int` })
    .from(leagueGroupMembers)
    .innerJoin(leagueGroups, eq(leagueGroupMembers.groupId, leagueGroups.id))
    .where(eq(leagueGroupMembers.weekStart, leagueWeek))
    .groupBy(leagueGroups.league);
  const groups = await db
    .select({ league: leagueGroups.league, n: sql<number>`count(*)::int` })
    .from(leagueGroups)
    .where(eq(leagueGroups.weekStart, leagueWeek))
    .groupBy(leagueGroups.league);
  const memberships = await db
    .select({ league: leagueMemberships.league, n: sql<number>`count(*)::int` })
    .from(leagueMemberships)
    .groupBy(leagueMemberships.league);
  const byLeague = (rows: { league: 'general' | 'top'; n: number }[]) => ({
    general: rows.find((r) => r.league === 'general')?.n ?? 0,
    top: rows.find((r) => r.league === 'top')?.n ?? 0,
  });

  const total = activeIds.length;
  return {
    week: monday,
    league_week_start: leagueWeek.toISOString(),
    active_users: total,
    studied_3_days: days3,
    studied_3_days_ratio: ratio(days3, total),
    streak_7: streak7,
    streak_7_ratio: ratio(streak7, total),
    streak_30: streak30,
    streak_30_ratio: ratio(streak30, total),
    league_participants: byLeague(participants),
    league_groups: byLeague(groups),
    league_memberships_now: byLeague(memberships),
  };
}
