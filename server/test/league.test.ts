import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { leagueGroupMembers, leagueGroups, leagueMemberships, leagueResults } from '../src/db/schema.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';
import { seedRanked } from './helpers/study.js';

let clock = 0;
const at = (value: string | number) => {
  clock = typeof value === 'number' ? value : Date.parse(value);
};

// 리그 주: 2026-03-02(월) 04:00 KST ~ 2026-03-09(월) 04:00 KST.
const W1 = '2026-03-01T19:00:00.000Z';
const W1_END = '2026-03-08T19:00:00.000Z';
const W2_END = '2026-03-15T19:00:00.000Z';
const HOUR = 3600;
/** 마감 + 정산 지연(기본 10분) 뒤. */
const afterSettle = (end: string) => Date.parse(end) + 10 * 60_000 + 1000;

describe('리그', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({ now: () => new Date(clock) });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    at('2026-03-04T12:00:00+09:00'); // W1 수요일
  });

  const league = (session: TestSession, headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: '/study/league', headers: { cookie: session.cookie, ...headers } });

  /** [from]부터 [hours]시간 인정 공부를 넣고 리그 점수에 반영한다(타이머가 인정 구간을 다시 계산할 때와 같은 함수). */
  async function studied(session: TestSession, from: string, hours: number) {
    const end = new Date(Date.parse(from) + hours * HOUR * 1000).toISOString();
    await seedRanked(app, session.userId, from, end);
    await app.league.syncUser(session.userId, Date.parse(from), Date.parse(end));
  }

  async function people(n: number): Promise<TestSession[]> {
    const list: TestSession[] = [];
    for (let i = 0; i < n; i++) list.push(await startAnonymous(app, { remoteAddress: `10.0.${Math.floor(i / 200)}.${i % 200}` }));
    return list;
  }

  describe('GET /study/league', () => {
    it('이번 주에 공부하지 않았으면 일반 리그, 그룹 없음, 주는 월요일 04:00 KST', async () => {
      const me = await startAnonymous(app);
      const res = await league(me);
      expect(res.statusCode).toBe(200);
      expectContract('/study/league', 'get', 200, res.json());
      expect(res.json().data).toEqual({ league: 'general', week_start: W1, week_end: W1_END, status: 'open', group: null });
    });

    it('타이머와 presence로 인정된 시간이 점수가 되고 그 순간 그룹에 들어간다(서울 밖 시간대도 같은 마감)', async () => {
      const me = await startAnonymous(app);
      at('2026-03-04T10:00:00+09:00');
      const started = await app.inject({
        method: 'POST',
        url: '/study/active-session/start',
        headers: withKey(me),
        payload: JSON.stringify({ subject: null, timezone: 'America/New_York' }),
      });
      const id = started.json().data.session.id as string;
      for (let minute = 1; minute <= 3; minute++) {
        at(Date.parse('2026-03-04T10:00:00+09:00') + minute * 60_000);
        await app.inject({
          method: 'PUT',
          url: '/study/presence',
          headers: { ...authHeaders(me), 'content-type': 'application/json' },
          payload: JSON.stringify({ session_id: id }),
        });
      }
      const res = await league(me);
      expectContract('/study/league', 'get', 200, res.json());
      const data = res.json().data;
      expect(data.week_end).toBe(W1_END);
      expect(data.group).toMatchObject({ size: 1, my_rank: 1, gap_to_next_seconds: null });
      expect(data.group.entries).toHaveLength(1);
      expect(data.group.entries[0]).toMatchObject({ rank: 1, score_seconds: 180, zone: 'stay', is_me: true });
      expect(data.group.entries[0].id).not.toContain(me.userId);
    });

    it('주 경계(월요일 04:00 KST)를 걸친 인정 구간은 경계에서 잘라 두 주에 나눠 센다', async () => {
      const me = await startAnonymous(app);
      await studied(me, '2026-03-09T03:00:00+09:00', 2); // W1 1시간 + W2 1시간
      at('2026-03-08T12:00:00+09:00');
      expect((await league(me)).json().data.group.entries[0].score_seconds).toBe(HOUR);
      at(afterSettle(W1_END));
      await app.league.settleDue();
      const next = (await league(me)).json().data;
      expect(next.week_start).toBe(W1_END);
      expect(next.group.entries[0].score_seconds).toBe(HOUR);
    });

    it('같은 점수면 먼저 닿은 사람이 위, 위 순위까지 남은 초는 점수 차 + 1, 구역은 서버 판정', async () => {
      const [a, b, c] = await people(3);
      await studied(a!, '2026-03-02T10:00:00+09:00', 8); // 8시간, 3일 18:00에 닿음
      await studied(b!, '2026-03-03T10:00:00+09:00', 2); // 2시간, 12:00에 닿음
      await studied(c!, '2026-03-03T09:00:00+09:00', 2); // 2시간, 11:00에 닿음(먼저)
      const data = (await league(b!)).json().data;
      expectContract('/study/league', 'get', 200, { data, error: null, meta: { requestId: 'x', timestamp: new Date().toISOString() } });
      expect(data.group.size).toBe(3);
      expect(data.group.entries.map((e: { score_seconds: number; is_me: boolean; zone: string }) => [e.score_seconds, e.is_me, e.zone])).toEqual([
        [8 * HOUR, false, 'promote'],
        [2 * HOUR, false, 'stay'],
        [2 * HOUR, true, 'stay'],
      ]);
      expect(data.group.my_rank).toBe(3);
      expect(data.group.gap_to_next_seconds).toBe(1);
      // 같은 그룹 사람의 항목 id는 사용자 id가 아니고 보는 사람과 상관없이 같다.
      const fromA = (await league(a!)).json().data.group.entries.map((e: { id: string }) => e.id);
      expect(fromA).toEqual(data.group.entries.map((e: { id: string }) => e.id));
      for (const id of fromA) expect([a!.userId, b!.userId, c!.userId]).not.toContain(id);
    });

    it('승급 최소 점수(7시간) 미달이면 상위 20%여도 잔류 구역', async () => {
      const [a] = await people(1);
      await studied(a!, '2026-03-02T10:00:00+09:00', 6);
      expect((await league(a!)).json().data.group.entries[0].zone).toBe('stay');
      await studied(a!, '2026-03-03T10:00:00+09:00', 1);
      expect((await league(a!)).json().data.group.entries[0].zone).toBe('promote');
    });

    it('ETag가 같으면 304, 점수가 바뀌면 200', async () => {
      const me = await startAnonymous(app);
      await studied(me, '2026-03-02T10:00:00+09:00', 1);
      const etag = (await league(me)).headers.etag as string;
      expect(etag).toBeTruthy();
      expect((await league(me, { 'if-none-match': etag })).statusCode).toBe(304);
      await studied(me, '2026-03-03T10:00:00+09:00', 1);
      expect((await league(me, { 'if-none-match': etag })).statusCode).toBe(200);
    });

    it('세션이 없으면 401', async () => {
      expect((await app.inject({ method: 'GET', url: '/study/league' })).statusCode).toBe(401);
    });
  });

  describe('그룹 배정', () => {
    it('30명이 차면 31번째는 새 그룹에 들어간다', async () => {
      const list = await people(31);
      for (const [i, s] of list.entries()) await studied(s, new Date(Date.parse('2026-03-02T10:00:00+09:00') + i * 60_000).toISOString(), 1);
      const groups = await app.db.select().from(leagueGroups).orderBy(leagueGroups.createdAt);
      expect(groups.map((g) => g.memberCount)).toEqual([30, 1]);
      const last = (await league(list[30]!)).json().data.group;
      expect(last.size).toBe(1);
      expect((await league(list[0]!)).json().data.group.entries).toHaveLength(30);
    });

    it('두 사람이 동시에 처음 공부해도 한 그룹에 정확히 한 번씩 들어간다', async () => {
      const list = await people(6);
      for (const s of list) await seedRanked(app, s.userId, '2026-03-02T10:00:00+09:00', '2026-03-02T11:00:00+09:00');
      await Promise.all(list.map((s) => app.league.syncUser(s.userId, Date.parse('2026-03-02T10:00:00+09:00'), Date.parse('2026-03-02T11:00:00+09:00'))));
      const groups = await app.db.select().from(leagueGroups);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.memberCount).toBe(6);
      expect(await app.db.select().from(leagueGroupMembers)).toHaveLength(6);
    });
  });

  describe('정산', () => {
    it('마감 + 지연 전에는 지난 주를 "집계 중"으로 보이고 정산하지 않는다', async () => {
      const me = await startAnonymous(app);
      await studied(me, '2026-03-02T10:00:00+09:00', 1);
      at(Date.parse(W1_END) + 5 * 60_000);
      expect(await app.league.settleDue()).toEqual([]);
      const data = (await league(me)).json().data;
      expect(data).toMatchObject({ week_start: W1, status: 'settling' });
      expectContract('/study/league', 'get', 200, (await league(me)).json());
      at(afterSettle(W1_END));
      expect(await app.league.settleDue()).toEqual([Date.parse(W1)]);
      expect((await league(me)).json().data).toEqual({ league: 'general', week_start: W1_END, week_end: W2_END, status: 'open', group: null });
    });

    it('일반: 상위 20%·최소 점수면 승급, 결과는 한 번 보이고 seen 뒤 204', async () => {
      const list = await people(6); // 20% 올림 = 2명
      const hours = [9, 8, 6, 3, 2, 1];
      for (const [i, s] of list.entries()) await studied(s, '2026-03-03T09:00:00+09:00', hours[i]!);
      at(afterSettle(W1_END));
      await app.league.settleDue();

      const memberships = await app.db.select().from(leagueMemberships);
      const leagueOf = (s: TestSession) => memberships.find((m) => m.userId === s.userId)?.league;
      expect(list.map(leagueOf)).toEqual(['top', 'top', 'general', 'general', 'general', 'general']);

      const res = await app.inject({ method: 'GET', url: '/study/league/results/latest', headers: { cookie: list[0]!.cookie } });
      expect(res.statusCode).toBe(200);
      expectContract('/study/league/results/latest', 'get', 200, res.json());
      expect(res.json().data).toEqual({
        week_start: W1,
        week_end: W1_END,
        league: 'general',
        outcome: 'promoted',
        next_league: 'top',
        rank: 1,
        group_size: 6,
        score_seconds: 9 * HOUR,
      });
      const third = (await app.inject({ method: 'GET', url: '/study/league/results/latest', headers: { cookie: list[2]!.cookie } })).json().data;
      expect(third).toMatchObject({ outcome: 'stayed', next_league: 'general', rank: 3 });

      const seen = (key = randomUUID()) =>
        app.inject({
          method: 'POST',
          url: `/study/league/results/${encodeURIComponent(W1)}/seen`,
          headers: { ...authHeaders(list[0]!), 'idempotency-key': key },
        });
      expect((await seen()).statusCode).toBe(204);
      expect((await seen()).statusCode).toBe(204); // 이미 봤어도 204
      const after = await app.inject({ method: 'GET', url: '/study/league/results/latest', headers: { cookie: list[0]!.cookie } });
      expect(after.statusCode).toBe(204);
      // 다음 주 화면은 카페인 리그
      expect((await league(list[0]!)).json().data.league).toBe('top');
    });

    it('seen: 키 없으면 400, 내 결과 없는 주는 404, 형식이 틀리면 422', async () => {
      const me = await startAnonymous(app);
      const post = (week: string, headers: Record<string, string>) =>
        app.inject({ method: 'POST', url: `/study/league/results/${encodeURIComponent(week)}/seen`, headers });
      expect((await post(W1, authHeaders(me))).statusCode).toBe(400);
      expect((await post(W1, { ...authHeaders(me), 'idempotency-key': randomUUID() })).statusCode).toBe(404);
      expect((await post('nope', { ...authHeaders(me), 'idempotency-key': randomUUID() })).statusCode).toBe(422);
      expect((await app.inject({ method: 'GET', url: '/study/league/results/latest', headers: { cookie: me.cookie } })).statusCode).toBe(204);
    });

    it('카페인 리그: 하위 20%·잔류 최소 미달·공부 0이면 강등, 밀린 주는 순서대로 정산한다', async () => {
      const list = await people(7);
      // W1: 7명 모두 7시간 이상 → 20% 올림 = 2명 승급(위 두 명)
      for (const [i, s] of list.entries()) await studied(s, '2026-03-03T09:00:00+09:00', 14 - i);
      // W2: 승급한 두 명 중 하나만 공부(2시간 < 3시간 30분), 다른 하나는 공부 0
      const promoted = [list[0]!, list[1]!];
      at('2026-03-10T12:00:00+09:00');
      await studied(promoted[0]!, '2026-03-10T09:00:00+09:00', 2);
      // 서버가 꺼져 있다가 W2 마감 뒤에 켜졌다: 두 주를 한 번에 순서대로
      at(afterSettle(W2_END));
      expect(await app.league.settleDue()).toEqual([Date.parse(W1), Date.parse(W1_END)]);
      const results = await app.db.select().from(leagueResults).where(eq(leagueResults.weekStart, new Date(W1_END)));
      const byUser = new Map(results.map((r) => [r.userId, r]));
      expect(byUser.get(promoted[0]!.userId)).toMatchObject({ league: 'top', outcome: 'relegated', nextLeague: 'general', rank: 1, groupSize: 1 });
      expect(byUser.get(promoted[1]!.userId)).toMatchObject({ league: 'top', outcome: 'relegated', rank: null, groupSize: null, scoreSeconds: 0 });
      const absent = await app.inject({ method: 'GET', url: '/study/league/results/latest', headers: { cookie: promoted[1]!.cookie } });
      expectContract('/study/league/results/latest', 'get', 200, absent.json());
      expect(absent.json().data).toMatchObject({ week_start: W1_END, outcome: 'relegated', rank: null, group_size: null });
      const memberships = await app.db.select().from(leagueMemberships);
      expect(memberships.every((m) => m.league === 'general')).toBe(true);
    });

    it('정산 전에 새 주를 시작한 승급자는 정산 뒤 카페인 리그 그룹으로 옮겨진다', async () => {
      const [a, b] = await people(2);
      await studied(a!, '2026-03-03T09:00:00+09:00', 8);
      await studied(b!, '2026-03-03T09:00:00+09:00', 1);
      at(Date.parse(W1_END) + 60_000); // 새 주 04:01, 아직 정산 전
      await studied(a!, '2026-03-09T04:00:00+09:00', 0.01);
      await studied(b!, '2026-03-09T04:00:00+09:00', 0.01);
      at(afterSettle(W1_END));
      await app.league.settleDue();
      const rows = await app.db
        .select({ userId: leagueGroupMembers.userId, league: leagueGroups.league, count: leagueGroups.memberCount })
        .from(leagueGroupMembers)
        .innerJoin(leagueGroups, eq(leagueGroupMembers.groupId, leagueGroups.id))
        .where(eq(leagueGroupMembers.weekStart, new Date(W1_END)));
      expect(rows.find((r) => r.userId === a!.userId)).toMatchObject({ league: 'top', count: 1 });
      expect(rows.find((r) => r.userId === b!.userId)).toMatchObject({ league: 'general', count: 1 });
      expect((await league(a!)).json().data).toMatchObject({ league: 'top', week_start: W1_END });
    });

    it('두 번·동시에 돌려도 결과와 리그 이동은 한 번만', async () => {
      const list = await people(3);
      for (const [i, s] of list.entries()) await studied(s, '2026-03-03T09:00:00+09:00', 8 - i);
      at(afterSettle(W1_END));
      const runs = await Promise.all([app.league.settleDue(), app.league.settleDue(), app.league.settleDue()]);
      expect(runs.flat()).toEqual([Date.parse(W1)]);
      expect(await app.league.settleDue()).toEqual([]);
      expect(await app.db.select().from(leagueResults)).toHaveLength(3);
      const tops = (await app.db.select().from(leagueMemberships)).filter((m) => m.league === 'top');
      expect(tops).toHaveLength(1);
    });

    it('정산한 주의 점수는 늦게 온 presence로 바뀌지 않는다', async () => {
      const me = await startAnonymous(app);
      await studied(me, '2026-03-03T09:00:00+09:00', 1);
      at(afterSettle(W1_END));
      await app.league.settleDue();
      await studied(me, '2026-03-08T20:00:00+09:00', 2); // 마감 전 시각의 인정 구간이 늦게 도착
      const [row] = await app.db.select().from(leagueGroupMembers).where(eq(leagueGroupMembers.userId, me.userId));
      expect(row!.scoreSeconds).toBe(HOUR);
      expect(await app.db.select().from(leagueGroupMembers)).toHaveLength(1); // 다음 주로 넘어가지 않는다
    });
  });

  describe('탈퇴', () => {
    it('탈퇴하면 순위표에서 빠지고 아래가 당겨지지만 그룹 인원은 그대로, 리그 테이블에 흔적이 없다', async () => {
      const [a, b, c] = await people(3);
      await studied(a!, '2026-03-03T09:00:00+09:00', 3);
      await studied(b!, '2026-03-03T09:00:00+09:00', 2);
      await studied(c!, '2026-03-03T09:00:00+09:00', 1);
      at(afterSettle(W1_END));
      await app.league.settleDue();
      at('2026-03-10T12:00:00+09:00');
      await studied(a!, '2026-03-10T09:00:00+09:00', 3);
      await studied(b!, '2026-03-10T09:00:00+09:00', 2);
      await studied(c!, '2026-03-10T09:00:00+09:00', 1);
      expect((await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(a!) })).statusCode).toBe(204);
      const data = (await league(c!)).json().data;
      expect(data.group.size).toBe(3);
      expect(data.group.entries.map((e: { rank: number; is_me: boolean }) => [e.rank, e.is_me])).toEqual([
        [1, false],
        [2, true],
      ]);
      for (const table of ['league_memberships', 'league_group_members', 'league_results']) {
        const left = await app.db.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where user_id = ${a!.userId}`);
        expect(left.rows[0]).toEqual({ n: 0 });
      }
    });
  });
});
