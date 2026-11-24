import type { FastifyInstance } from 'fastify';
import { and, eq, gt } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { rankedSegments, studySessions } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { addDays, isTimezone, mondayOf, splitByStudyDate, studyDateOf, studyDayStart, totalsByStudyDate } from './time.js';

/** 연속일로 세는 하루 최소 인정 시간(앱 `studyStreakMinimum`). */
export const STREAK_MINIMUM_MS = 10 * 60 * 1000;
/** 이번 주 과목 비중에 넣는 최소 시간(앱 통계 화면: 1분 미만은 "0분 0%"라 뺀다). */
const SUBJECT_WEEK_MINIMUM_SECONDS = 60;
const RECENT_WEEKS = 16;

interface DayTotal {
  date: string;
  seconds: number;
}

interface SubjectTotal {
  subject: string | null;
  seconds: number;
}

const toSeconds = (ms: number) => Math.floor(ms / 1000);

/** 많은 순, 같으면 이름 순(과목 없음은 뒤). */
function sortSubjects(totals: Map<string | null, number>, minimumSeconds: number): SubjectTotal[] {
  return [...totals]
    .map(([subject, ms]) => ({ subject, seconds: toSeconds(ms) }))
    .filter((row) => row.seconds >= minimumSeconds)
    .sort((a, b) => b.seconds - a.seconds || (a.subject === null ? 1 : b.subject === null ? -1 : a.subject.localeCompare(b.subject)));
}

const addTo = <K>(map: Map<K, number>, key: K, value: number) => map.set(key, (map.get(key) ?? 0) + value);

/**
 * 통계 한 벌. 규칙은 PocketTime `study_stats.dart`(공부일 04:00 경계·월요일 시작·연속일 10분)와 같고, 끝낸 기록만
 * 센다(진행 중 세션은 화면이 더한다). 연속일만은 기록 시간이 아니라 **인정 시간**(`ranked_segments`) 기준이다
 * (study-league.md L2, launch.md L3).
 */
export async function computeStudyStats(db: DbExecutor, userId: string, timezone: string, now: Date) {
  const today = studyDateOf(now.getTime(), timezone);
  const yesterday = addDays(today, -1);
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const firstDay = addDays(monday, -7 * (RECENT_WEEKS - 1));
  const rangeStart = studyDayStart(firstDay, timezone);

  const sessions = await db
    .select({ subject: studySessions.subject, segments: studySessions.segments })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.status, 'finished'), gt(studySessions.endedAt, new Date(rangeStart))));

  const byDate = new Map<string, number>();
  const todayBySubject = new Map<string | null, number>();
  const weekBySubject = new Map<string | null, number>();
  for (const session of sessions) {
    const intervals = session.segments.map((s) => [Date.parse(s.started_at), Date.parse(s.ended_at!)] as const);
    for (const piece of splitByStudyDate(intervals, timezone)) {
      const ms = piece.end - piece.start;
      addTo(byDate, piece.date, ms);
      if (piece.date === today) addTo(todayBySubject, session.subject, ms);
      if (piece.date >= monday && piece.date <= sunday) addTo(weekBySubject, session.subject, ms);
    }
  }
  const day = (date: string): DayTotal => ({ date, seconds: toSeconds(byDate.get(date) ?? 0) });
  const recentWeeks = Array.from({ length: RECENT_WEEKS * 7 }, (_, i) => day(addDays(firstDay, i)));
  const weekDays = recentWeeks.slice(-7);

  // 연속일: 끝낸 세션의 인정 구간을 요청 시간대의 공부일로 나눠 센다. 연속은 16주보다 길 수 있어 기간을 자르지 않는다.
  const ranked = await db
    .select({ startedAt: rankedSegments.startedAt, endedAt: rankedSegments.endedAt })
    .from(rankedSegments)
    .innerJoin(studySessions, eq(rankedSegments.sessionId, studySessions.id))
    .where(and(eq(rankedSegments.userId, userId), eq(studySessions.status, 'finished')));
  const rankedByDate = totalsByStudyDate(
    ranked.map((r) => [r.startedAt.getTime(), r.endedAt.getTime()] as const),
    timezone,
  );
  const studied = (date: string) => (rankedByDate.get(date) ?? 0) >= STREAK_MINIMUM_MS;
  let cursor = studied(today) ? today : yesterday;
  let streakDays = 0;
  while (studied(cursor)) {
    streakDays++;
    cursor = addDays(cursor, -1);
  }

  return {
    today: day(today),
    today_by_subject: sortSubjects(todayBySubject, 1),
    yesterday_seconds: day(yesterday).seconds,
    week: { days: weekDays, total_seconds: weekDays.reduce((sum, d) => sum + d.seconds, 0) },
    streak_days: streakDays,
    subjects_week: sortSubjects(weekBySubject, SUBJECT_WEEK_MINIMUM_SECONDS),
    recent_weeks: recentWeeks,
  };
}

export function registerStatsRoutes(app: FastifyInstance): void {
  app.get('/study/stats', async (request, reply) => {
    const { timezone } = request.query as { timezone?: unknown };
    if (!isTimezone(timezone)) throw errors.validation('시간대(IANA 이름)가 필요해요', 'timezone');
    return reply.ok(await computeStudyStats(app.db, request.auth!.user.id, timezone, app.now()));
  });
}
