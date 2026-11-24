import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { rankedSegments } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { replyWithEtag } from '../http/etag.js';
import { STREAK_MINIMUM_MS } from './stats.js';
import { addDays, isTimezone, studyDateOf } from './time.js';

const STREAK_MINIMUM_SECONDS = STREAK_MINIMUM_MS / 1000;
const RECENT_DAYS = 7;

export interface StudyStreakView {
  current: number;
  longest: number;
  today_seconds: number;
  today_remaining_seconds: number;
  recent_days: { date: string; state: 'studied' | 'missed' | 'open' }[];
}

/**
 * 스트릭(study-league.md §2). 원천은 인정 구간(`ranked_segments`)이고 공부일은 그 행의 `study_date`(세션 시간대
 * 04:00 경계)다. 진행 중 세션도 서버가 마지막으로 본 때까지 들어간다. "오늘"은 요청 시간대로 정한다. 하루 10분 이상이면
 * 공부한 날이고, 현재 스트릭은 오늘(10분 미만이면 어제)까지 이어진 날 수다(앱 `study_stats.dart`와 같은 정의, 기준만
 * 인정 시간). 보호(얼리기)는 없다(보류).
 */
export async function computeStreak(db: DbExecutor, userId: string, timezone: string, now: Date): Promise<StudyStreakView> {
  const rows = await db
    .select({
      date: rankedSegments.studyDate,
      ms: sql<string>`sum(extract(epoch from (${rankedSegments.endedAt} - ${rankedSegments.startedAt})) * 1000)`,
    })
    .from(rankedSegments)
    .where(eq(rankedSegments.userId, userId))
    .groupBy(rankedSegments.studyDate);
  const secondsByDate = new Map(rows.map((r) => [r.date, Math.floor(Math.round(Number(r.ms)) / 1000)]));
  const studied = (date: string) => (secondsByDate.get(date) ?? 0) >= STREAK_MINIMUM_SECONDS;

  const today = studyDateOf(now.getTime(), timezone);
  let cursor = studied(today) ? today : addDays(today, -1);
  let current = 0;
  while (studied(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of [...secondsByDate.keys()].filter(studied).sort()) {
    run = previous !== null && addDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  const todaySeconds = secondsByDate.get(today) ?? 0;
  return {
    current,
    longest: Math.max(longest, current),
    today_seconds: todaySeconds,
    today_remaining_seconds: Math.max(0, STREAK_MINIMUM_SECONDS - todaySeconds),
    recent_days: Array.from({ length: RECENT_DAYS }, (_, i) => {
      const date = addDays(today, i - (RECENT_DAYS - 1));
      return { date, state: studied(date) ? 'studied' : date === today ? 'open' : 'missed' };
    }),
  };
}

export function registerStreakRoutes(app: FastifyInstance): void {
  app.get('/study/streak', async (request, reply) => {
    const { timezone } = request.query as { timezone?: unknown };
    if (!isTimezone(timezone)) throw errors.validation('시간대(IANA 이름)가 필요해요', 'timezone');
    return replyWithEtag(request, reply, await computeStreak(app.db, request.auth!.user.id, timezone, app.now()));
  });
}
