import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db/client.js';
import { presenceSpans, rankedSegments, studySessions, type SegmentValue } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { intersect, totalMs, union, type Interval } from './intervals.js';
import { readStudySettings } from './settings.js';
import { splitByStudyDate, studyDateOf } from './time.js';
import { syncLeagueWeek } from '../league/scores.js';
import { weeksOverlapping } from '../league/week.js';

/**
 * 타이머 상태를 바꾸는 곳은 이 파일 하나다(시작·일시정지·재개·끝내기·presence). 모두 계정 단위 잠금을 잡은
 * 트랜잭션 안에서 서버 시각으로 처리하고, 커밋이 끝난 뒤 `onChange` 구독자에게 알린다(방 실시간 이벤트 L5가
 * 여기에 붙는다. 커밋 안 된 상태를 내보내지 않는다).
 */

/** 신호 사이가 이보다 길면 관측 구간을 닫는다(PocketTimeServer `Study.Rankings` @max_gap_ms). */
export const PRESENCE_MAX_GAP_MS = 75_000;
/** 관측 구간 앞뒤 여유(같은 곳 @grace_ms): 첫 신호는 시작 직후, 마지막 신호는 최대 한 주기 전에 온다. */
export const PRESENCE_GRACE_MS = 45_000;

export type SessionRow = typeof studySessions.$inferSelect;

export interface ActiveSessionView {
  id: string;
  subject: string | null;
  timezone: string;
  segments: SegmentValue[];
}

export interface StudyRecordView {
  id: string;
  subject: string | null;
  started_at: string;
  ended_at: string;
  focused_seconds: number;
  study_date: string;
  segments: SegmentValue[];
}

export type TimerChange =
  | { type: 'started' | 'paused' | 'resumed'; userId: string; session: ActiveSessionView }
  | { type: 'finished'; userId: string; sessionId: string; record: StudyRecordView | null }
  | { type: 'observed'; userId: string; sessionId: string };

export const toActiveView = (row: SessionRow): ActiveSessionView => ({
  id: row.id,
  subject: row.subject,
  timezone: row.timezone,
  segments: row.segments,
});

export function toRecordView(row: SessionRow): StudyRecordView | null {
  if (row.status !== 'finished') return null;
  return {
    id: row.id,
    subject: row.subject,
    started_at: row.startedAt.toISOString(),
    ended_at: row.endedAt!.toISOString(),
    focused_seconds: row.focusedSeconds!,
    study_date: row.studyDate!,
    segments: row.segments,
  };
}

const segmentIntervals = (segments: SegmentValue[], nowMs: number): Interval[] =>
  segments.map((s) => [Date.parse(s.started_at), s.ended_at === null ? nowMs : Date.parse(s.ended_at)] as const);

const isRunning = (segments: SegmentValue[]) => segments[segments.length - 1]?.ended_at === null;

/** 같은 계정의 타이머 요청을 한 줄로 세운다(두 탭 동시 시작·끝내기). 트랜잭션이 끝나면 풀린다. */
export async function lockAccount(tx: DbExecutor, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`study-timer:${userId}`}, 0))`);
}

async function findActive(tx: DbExecutor, userId: string): Promise<SessionRow | undefined> {
  const [row] = await tx
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.status, 'active')));
  return row;
}

/**
 * 서버가 이 세션의 화면을 본 시각 하나를 관측 구간에 넣는다. 마지막 구간 끝에서 75초 안이면 늘리고, 아니면
 * 타이머가 돌고 있을 때만 새 구간을 연다(일시정지 중 신호는 이어 주기만 한다. PocketTimeServer의 running/paused 규칙).
 */
async function observe(tx: DbExecutor, session: SessionRow, nowMs: number, mayOpen: boolean): Promise<void> {
  const [last] = await tx
    .select()
    .from(presenceSpans)
    .where(eq(presenceSpans.sessionId, session.id))
    .orderBy(desc(presenceSpans.endedAt))
    .limit(1);
  if (last) {
    const end = last.endedAt.getTime();
    if (nowMs <= end) return; // 이미 덮인 시각(같은 때 온 다른 탭)
    if (nowMs - end <= PRESENCE_MAX_GAP_MS) {
      await tx.update(presenceSpans).set({ endedAt: new Date(nowMs) }).where(eq(presenceSpans.id, last.id));
      return;
    }
  }
  if (mayOpen) {
    await tx.insert(presenceSpans).values({ sessionId: session.id, userId: session.userId, startedAt: new Date(nowMs), endedAt: new Date(nowMs) });
  }
}

/**
 * 세션의 인정 구간을 처음부터 다시 계산해 바꾼다: 공부 구간(열린 구간은 지금까지) ∩ (관측 구간 ± 45초).
 * 더하지 않고 다시 계산하므로 같은 신호를 여러 번 받아도 늘지 않는다. 같은 트랜잭션에서 이 세션이 걸친 리그 주의
 * 점수도 다시 계산한다(첫 인정 시간이면 그 주 그룹에 들어간다, study-league.md §4).
 */
async function recomputeRanked(tx: DbExecutor, session: SessionRow, nowMs: number): Promise<void> {
  const spans = await tx.select().from(presenceSpans).where(eq(presenceSpans.sessionId, session.id));
  const windows = spans.map((s) => [s.startedAt.getTime() - PRESENCE_GRACE_MS, s.endedAt.getTime() + PRESENCE_GRACE_MS] as const);
  const ranked = intersect(segmentIntervals(session.segments, nowMs), windows);
  const previous = await tx
    .delete(rankedSegments)
    .where(eq(rankedSegments.sessionId, session.id))
    .returning({ startedAt: rankedSegments.startedAt, endedAt: rankedSegments.endedAt });
  const pieces = splitByStudyDate(ranked, session.timezone).filter((p) => p.end > p.start);
  if (pieces.length > 0) {
    await tx.insert(rankedSegments).values(
      pieces.map((p) => ({
        userId: session.userId,
        sessionId: session.id,
        startedAt: new Date(p.start),
        endedAt: new Date(p.end),
        studyDate: p.date,
        timezone: session.timezone,
      })),
    );
  }
  const weeks = new Set<number>();
  for (const [start, end] of [...ranked, ...previous.map((p) => [p.startedAt.getTime(), p.endedAt.getTime()] as const)]) {
    if (end > start) for (const week of weeksOverlapping(start, end)) weeks.add(week);
  }
  for (const week of [...weeks].sort((a, b) => a - b)) await syncLeagueWeek(tx, session.userId, week);
}

/** 서버 시계가 뒤로 가도 구간이 뒤집히지 않게 세션의 마지막 경계보다 앞서지 않는 시각을 쓴다. */
function sessionNow(session: SessionRow, now: Date): number {
  let latest = 0;
  for (const s of session.segments) latest = Math.max(latest, Date.parse(s.started_at), s.ended_at ? Date.parse(s.ended_at) : 0);
  return Math.max(now.getTime(), latest);
}

export class TimerService {
  private readonly listeners = new Set<(change: TimerChange) => void>();

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
    private readonly onListenerError: (error: unknown) => void,
  ) {}

  /** 커밋된 타이머 변경을 받는다. 반환 함수로 구독을 끊는다. */
  onChange(listener: (change: TimerChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(change: TimerChange | null): void {
    if (!change) return;
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }

  async active(userId: string): Promise<ActiveSessionView | null> {
    const row = await findActive(this.db, userId);
    return row ? toActiveView(row) : null;
  }

  /** 진행 중 세션이 있으면 그대로(created false), 없으면 새로 연다. */
  async start(userId: string, input: { subject: string | null; timezone: string }): Promise<{ session: ActiveSessionView; created: boolean }> {
    const result = await this.db.transaction(async (tx) => {
      await lockAccount(tx, userId);
      const existing = await findActive(tx, userId);
      if (existing) return { session: toActiveView(existing), created: false };

      if (input.subject !== null) {
        const settings = await readStudySettings(tx, userId);
        if (!settings.subjects.includes(input.subject)) throw errors.validation('설정에 없는 과목이에요', 'subject');
      }
      const nowMs = this.now().getTime();
      const startedAt = new Date(nowMs);
      const [row] = await tx
        .insert(studySessions)
        .values({
          userId,
          status: 'active',
          subject: input.subject,
          timezone: input.timezone,
          segments: [{ started_at: startedAt.toISOString(), ended_at: null }],
          startedAt,
        })
        .returning();
      await observe(tx, row!, nowMs, true);
      return { session: toActiveView(row!), created: true };
    });
    if (result.created) this.emit({ type: 'started', userId, session: result.session });
    return result;
  }

  async pause(userId: string, sessionId: string): Promise<ActiveSessionView> {
    return this.changeActive(userId, sessionId, 'paused', (segments, nowMs) => {
      if (!isRunning(segments)) return null;
      const next = segments.map((s) => ({ ...s }));
      next[next.length - 1]!.ended_at = new Date(nowMs).toISOString();
      return next;
    });
  }

  async resume(userId: string, sessionId: string): Promise<ActiveSessionView> {
    return this.changeActive(userId, sessionId, 'resumed', (segments, nowMs) => {
      if (isRunning(segments)) return null;
      return [...segments, { started_at: new Date(nowMs).toISOString(), ended_at: null }];
    });
  }

  /** 일시정지·재개 공통. `change`가 null이면 이미 그 상태(그대로 200). */
  private async changeActive(
    userId: string,
    sessionId: string,
    type: 'paused' | 'resumed',
    change: (segments: SegmentValue[], nowMs: number) => SegmentValue[] | null,
  ): Promise<ActiveSessionView> {
    const result = await this.db.transaction(async (tx) => {
      await lockAccount(tx, userId);
      const row = await findActive(tx, userId);
      if (!row || row.id !== sessionId) throw errors.sessionNotActive();
      const nowMs = sessionNow(row, this.now());
      const segments = change(row.segments, nowMs);
      if (!segments) return { session: toActiveView(row), changed: false };
      const [updated] = await tx.update(studySessions).set({ segments }).where(eq(studySessions.id, row.id)).returning();
      await observe(tx, updated!, nowMs, isRunning(segments));
      await recomputeRanked(tx, updated!, nowMs);
      return { session: toActiveView(updated!), changed: true };
    });
    if (result.changed) this.emit({ type, userId, session: result.session });
    return result.session;
  }

  /**
   * 끝내기. 열린 구간을 닫고 기록으로 확정한다. 0초면 기록 없이 `discarded`. 이미 끝낸 세션이면 같은 결과를
   * 돌려준다(두 탭이 함께 끝내거나 응답 유실 재시도). 이 계정의 세션이 아니면 409.
   */
  async finish(userId: string, sessionId: string): Promise<StudyRecordView | null> {
    const result = await this.db.transaction(async (tx) => {
      await lockAccount(tx, userId);
      const [row] = await tx
        .select()
        .from(studySessions)
        .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)));
      if (!row) throw errors.sessionNotActive();
      if (row.status !== 'active') return { record: toRecordView(row), changed: false };

      const nowMs = sessionNow(row, this.now());
      const segments = row.segments.map((s) => (s.ended_at === null ? { ...s, ended_at: new Date(nowMs).toISOString() } : s));
      const focusedSeconds = Math.floor(totalMs(union(segmentIntervals(segments, nowMs))) / 1000);
      const closed = { ...row, segments };
      await observe(tx, closed, nowMs, false);
      await recomputeRanked(tx, closed, nowMs);
      const [updated] = await tx
        .update(studySessions)
        .set(
          focusedSeconds > 0
            ? {
                status: 'finished',
                segments,
                endedAt: new Date(nowMs),
                focusedSeconds,
                studyDate: studyDateOf(row.startedAt.getTime(), row.timezone),
              }
            : { status: 'discarded', segments, endedAt: new Date(nowMs), focusedSeconds: 0 },
        )
        .where(eq(studySessions.id, row.id))
        .returning();
      return { record: toRecordView(updated!), changed: true };
    });
    if (result.changed) this.emit({ type: 'finished', userId, sessionId, record: result.record });
    return result.record;
  }

  /** 화면이 열려 있다는 신호. 진행 중 세션이 이 id가 아니면 409. */
  async presence(userId: string, sessionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockAccount(tx, userId);
      const row = await findActive(tx, userId);
      if (!row || row.id !== sessionId) throw errors.sessionNotActive();
      const nowMs = sessionNow(row, this.now());
      await observe(tx, row, nowMs, isRunning(row.segments));
      await recomputeRanked(tx, row, nowMs);
    });
    this.emit({ type: 'observed', userId, sessionId });
  }
}
