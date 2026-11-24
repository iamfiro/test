import { createHmac } from 'node:crypto';
import { and, asc, desc, eq, lte, notInArray, sql } from 'drizzle-orm';
import type { LeagueConfig } from '../config.js';
import type { Db } from '../db/client.js';
import type { AvatarValue } from '../db/schema.js';
import { leagueGroupMembers, leagueGroups, leagueMemberships, leagueResults, leagueWeeks, users } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { lockAccount } from '../study/timer.js';
import { nextLeague, outcomeOf, zoneOf, type League, type Outcome, type Zone } from './rules.js';
import { syncLeagueWeek } from './scores.js';
import { shiftWeek, weekEndOf, weekStartOf, weeksOverlapping } from './week.js';

export interface LeagueEntryView {
  id: string;
  rank: number;
  nickname: string;
  avatar: AvatarValue;
  score_seconds: number;
  zone: Zone;
  is_me: boolean;
}

export interface LeagueStandingView {
  league: League;
  week_start: string;
  week_end: string;
  status: 'open' | 'settling';
  group: { size: number; my_rank: number; gap_to_next_seconds: number | null; entries: LeagueEntryView[] } | null;
}

export interface LeagueResultView {
  week_start: string;
  week_end: string;
  league: League;
  outcome: Outcome;
  next_league: League;
  rank: number | null;
  group_size: number | null;
  score_seconds: number;
}

interface RankedMember {
  userId: string;
  scoreSeconds: number;
}

const iso = (ms: number) => new Date(ms).toISOString();
const SETTLE_LOCK = 'league-settle';

/** 그룹 멤버를 순위 순서로: 점수 높은 순, 같으면 그 점수에 먼저 닿은 사람, 그다음 먼저 들어온 사람. */
const rankOrder = [
  desc(leagueGroupMembers.scoreSeconds),
  sql`${leagueGroupMembers.lastScoredAt} asc nulls last`,
  asc(leagueGroupMembers.joinedAt),
  asc(leagueGroupMembers.userId),
];

/**
 * 리그(study-league.md §1·§4 S3). 점수는 타이머 트랜잭션이 `syncLeagueWeek`로 바꾸고, 여기서는 순위표·정산·결과를 맡는다.
 * 순위·구역은 서버만 계산한다.
 */
export class LeagueService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
    private readonly config: LeagueConfig,
    private readonly entryIdSecret: string,
  ) {}

  /** 순위표 항목 id: 주마다 다른 HMAC(사용자 id를 내보내지 않고, 주를 넘어 같은 사람을 이어 붙일 수 없게). */
  private entryId(weekStart: number, userId: string): string {
    return createHmac('sha256', this.entryIdSecret).update(`league-entry:${weekStart}:${userId}`).digest('base64url').slice(0, 22);
  }

  /** 인정 구간 [from, to)가 걸친 주의 점수를 다시 계산한다(계정 잠금을 잡는다). 테스트·운영 도구용. */
  async syncUser(userId: string, from: number, to: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockAccount(tx, userId);
      for (const week of weeksOverlapping(from, to)) await syncLeagueWeek(tx, userId, week);
    });
  }

  /** 화면에 보일 주: 지난 주 정산이 아직이면 지난 주(`settling`), 아니면 이번 주. */
  private async shownWeek(): Promise<{ weekStart: number; status: 'open' | 'settling' }> {
    const current = weekStartOf(this.now().getTime());
    const previous = shiftWeek(current, -1);
    const [row] = await this.db.select({ status: leagueWeeks.status }).from(leagueWeeks).where(eq(leagueWeeks.weekStart, new Date(previous)));
    if (row?.status === 'open') return { weekStart: previous, status: 'settling' };
    return { weekStart: current, status: 'open' };
  }

  async standing(userId: string): Promise<LeagueStandingView> {
    const { weekStart, status } = await this.shownWeek();
    const week = new Date(weekStart);
    const base = { week_start: iso(weekStart), week_end: iso(weekEndOf(weekStart)), status };
    const [mine] = await this.db
      .select({ groupId: leagueGroups.id, league: leagueGroups.league, size: leagueGroups.memberCount })
      .from(leagueGroupMembers)
      .innerJoin(leagueGroups, eq(leagueGroupMembers.groupId, leagueGroups.id))
      .where(and(eq(leagueGroupMembers.weekStart, week), eq(leagueGroupMembers.userId, userId)));
    if (!mine) {
      const [membership] = await this.db.select().from(leagueMemberships).where(eq(leagueMemberships.userId, userId));
      return { league: membership?.league ?? 'general', ...base, group: null };
    }
    const members = await this.db
      .select({
        userId: leagueGroupMembers.userId,
        scoreSeconds: leagueGroupMembers.scoreSeconds,
        nickname: users.nickname,
        avatar: users.avatar,
      })
      .from(leagueGroupMembers)
      .innerJoin(users, eq(leagueGroupMembers.userId, users.id))
      .where(eq(leagueGroupMembers.groupId, mine.groupId))
      .orderBy(...rankOrder);
    const entries = members.map((m, i) => ({
      id: this.entryId(weekStart, m.userId),
      rank: i + 1,
      nickname: m.nickname,
      avatar: m.avatar,
      score_seconds: m.scoreSeconds,
      zone: zoneOf(mine.league, i + 1, mine.size, m.scoreSeconds, this.config),
      is_me: m.userId === userId,
    }));
    const myIndex = entries.findIndex((e) => e.is_me);
    const above = myIndex > 0 ? entries[myIndex - 1]! : null;
    return {
      league: mine.league,
      ...base,
      group: {
        size: mine.size,
        my_rank: myIndex + 1,
        // 같은 점수면 먼저 닿은 사람이 위라서 앞지르려면 1초 더 필요하다.
        gap_to_next_seconds: above ? above.score_seconds - entries[myIndex]!.score_seconds + 1 : null,
        entries,
      },
    };
  }

  /** 가장 최근 결과가 아직 안 본 것이면 그것. */
  async latestResult(userId: string): Promise<LeagueResultView | null> {
    const [row] = await this.db
      .select()
      .from(leagueResults)
      .where(eq(leagueResults.userId, userId))
      .orderBy(desc(leagueResults.weekStart))
      .limit(1);
    if (!row || row.seenAt !== null) return null;
    const weekStart = row.weekStart.getTime();
    return {
      week_start: iso(weekStart),
      week_end: iso(weekEndOf(weekStart)),
      league: row.league,
      outcome: row.outcome,
      next_league: row.nextLeague,
      rank: row.rank,
      group_size: row.groupSize,
      score_seconds: row.scoreSeconds,
    };
  }

  /** 결과를 봤다고 기록. 이미 봤으면 그대로. 내 결과가 없으면 404. */
  async markSeen(userId: string, weekStart: number): Promise<void> {
    const found = await this.db
      .update(leagueResults)
      .set({ seenAt: sql`coalesce(${leagueResults.seenAt}, ${this.now()})` })
      .where(and(eq(leagueResults.userId, userId), eq(leagueResults.weekStart, new Date(weekStart))))
      .returning({ userId: leagueResults.userId });
    if (found.length === 0) throw errors.notFound('이 주의 리그 결과가 없어요');
  }

  /**
   * 마감 + `LEAGUE_SETTLE_DELAY`가 지난 주를 오래된 것부터 정산한다(서버가 꺼져 있던 동안 밀린 주 포함). 정산한 주
   * 시작 시각을 돌려준다. 여러 프로세스(서버·CLI)가 함께 불러도 정산 잠금과 주 상태로 한 번만 반영된다.
   */
  async settleDue(): Promise<number[]> {
    const settled: number[] = [];
    for (;;) {
      const outcome = await this.settleNext();
      if (outcome === null) return settled;
      if (outcome.settled) settled.push(outcome.weekStart);
      // 정산 뒤 리그가 바뀐 사람이 이미 다음 주 그룹에 들어가 있으면 바뀐 리그의 그룹으로 옮긴다(다음 주를 정산하기 전에).
      for (const userId of outcome.moved) await this.resyncWeek(userId, shiftWeek(outcome.weekStart, 1));
    }
  }

  private async resyncWeek(userId: string, weekStart: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      await lockAccount(tx, userId);
      await syncLeagueWeek(tx, userId, weekStart);
    });
  }

  /** 정산할 다음 주 하나. 없거나 아직 때가 아니면 null. */
  private async settleNext(): Promise<{ weekStart: number; settled: boolean; moved: string[] } | null> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${SETTLE_LOCK}, 0))`);
      const [last] = await tx
        .select({ weekStart: leagueWeeks.weekStart })
        .from(leagueWeeks)
        .where(eq(leagueWeeks.status, 'settled'))
        .orderBy(desc(leagueWeeks.weekStart))
        .limit(1);
      let weekStart: number;
      if (last) weekStart = shiftWeek(last.weekStart.getTime(), 1);
      else {
        const [first] = await tx.select({ weekStart: leagueWeeks.weekStart }).from(leagueWeeks).orderBy(asc(leagueWeeks.weekStart)).limit(1);
        if (!first) return null;
        weekStart = first.weekStart.getTime();
      }
      if (this.now().getTime() < weekEndOf(weekStart) + this.config.settleDelayMs) return null;

      const week = new Date(weekStart);
      await tx.insert(leagueWeeks).values({ weekStart: week, status: 'open' }).onConflictDoNothing();
      const [row] = await tx.execute<{ status: string }>(sql`select status from league_weeks where week_start = ${week} for update`).then((r) => r.rows);
      if (row?.status === 'settled') return { weekStart, settled: false, moved: [] };

      const nextWeek = new Date(shiftWeek(weekStart, 1));
      const moved: { userId: string; league: League }[] = [];
      const results: (typeof leagueResults.$inferInsert)[] = [];

      const groups = await tx.select().from(leagueGroups).where(eq(leagueGroups.weekStart, week));
      for (const group of groups) {
        const members: RankedMember[] = await tx
          .select({ userId: leagueGroupMembers.userId, scoreSeconds: leagueGroupMembers.scoreSeconds })
          .from(leagueGroupMembers)
          .where(eq(leagueGroupMembers.groupId, group.id))
          .orderBy(...rankOrder);
        members.forEach((m, i) => {
          const outcome = outcomeOf(zoneOf(group.league, i + 1, group.memberCount, m.scoreSeconds, this.config));
          const next = nextLeague(group.league, outcome);
          results.push({
            weekStart: week,
            userId: m.userId,
            league: group.league,
            groupId: group.id,
            rank: i + 1,
            groupSize: group.memberCount,
            scoreSeconds: m.scoreSeconds,
            outcome,
            nextLeague: next,
          });
          if (next !== group.league) moved.push({ userId: m.userId, league: next });
        });
      }

      // 카페인 리그 소속인데 이 주 그룹에 없음(공부 0) → 강등.
      const absent = await tx
        .select({ userId: leagueMemberships.userId })
        .from(leagueMemberships)
        .where(
          and(
            eq(leagueMemberships.league, 'top'),
            lte(leagueMemberships.sinceWeek, week),
            notInArray(
              leagueMemberships.userId,
              tx.select({ userId: leagueGroupMembers.userId }).from(leagueGroupMembers).where(eq(leagueGroupMembers.weekStart, week)),
            ),
          ),
        );
      for (const { userId } of absent) {
        results.push({
          weekStart: week,
          userId,
          league: 'top',
          groupId: null,
          rank: null,
          groupSize: null,
          scoreSeconds: 0,
          outcome: 'relegated',
          nextLeague: 'general',
        });
        moved.push({ userId, league: 'general' });
      }

      if (results.length > 0) await tx.insert(leagueResults).values(results).onConflictDoNothing();
      for (const league of ['general', 'top'] as const) {
        const ids = moved.filter((m) => m.league === league).map((m) => m.userId);
        if (ids.length === 0) continue;
        await tx
          .insert(leagueMemberships)
          .values(ids.map((userId) => ({ userId, league, sinceWeek: nextWeek })))
          .onConflictDoUpdate({
            target: leagueMemberships.userId,
            set: { league, sinceWeek: nextWeek, updatedAt: sql`now()` },
          });
      }
      await tx.update(leagueWeeks).set({ status: 'settled', settledAt: this.now() }).where(eq(leagueWeeks.weekStart, week));
      return { weekStart, settled: true, moved: moved.map((m) => m.userId) };
    });
  }
}
