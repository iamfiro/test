import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

// 2026-03-02는 월요일. 서버 시각은 테스트가 정한다(임의 sleep 없음).
const T0 = Date.parse('2026-03-02T10:00:00+09:00');
let clock = T0;
const at = (msOrIso: number | string) => {
  clock = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso);
};
const after = (seconds: number) => at(T0 + seconds * 1000);
const iso = (ms: number) => new Date(ms).toISOString();

describe('타이머·기록·presence', () => {
  let app: FastifyInstance;
  let me: TestSession;

  beforeAll(async () => {
    app = await createTestApp({ now: () => new Date(clock) });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    at(T0);
    me = await startAnonymous(app);
  });

  const post = (path: string, payload?: unknown, headers: Record<string, string> = withKey(me)) =>
    app.inject({ method: 'POST', url: path, headers, ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }) });
  const start = (payload: unknown = { subject: null, timezone: 'Asia/Seoul' }, session = me) =>
    post('/study/active-session/start', payload, withKey(session));
  const act = (id: string, action: 'pause' | 'resume' | 'finish', session = me) =>
    post(`/study/active-session/${id}/${action}`, undefined, withKey(session));
  const active = (session = me) => app.inject({ method: 'GET', url: '/study/active-session', headers: { cookie: session.cookie } });
  const presence = (id: string, session = me) =>
    app.inject({
      method: 'PUT',
      url: '/study/presence',
      headers: { ...authHeaders(session), 'content-type': 'application/json' },
      payload: JSON.stringify({ session_id: id }),
    });
  const records = (query: string, session = me) =>
    app.inject({ method: 'GET', url: `/study/records?${query}`, headers: { cookie: session.cookie } });
  const startedId = async (payload?: unknown, session = me) => {
    const res = await start(payload, session);
    expect(res.statusCode).toBe(201);
    return res.json().data.session.id as string;
  };

  /** 이 사용자의 인정 구간(초 단위 합과 날짜별 합). */
  async function ranked(session = me) {
    const rows = (
      await app.db.execute(
        sql`select started_at, ended_at, study_date::text as study_date from ranked_segments where user_id = ${session.userId} order by started_at`,
      )
    ).rows as { started_at: Date | string; ended_at: Date | string; study_date: string }[];
    const byDate: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const seconds = (new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000;
      total += seconds;
      byDate[row.study_date] = (byDate[row.study_date] ?? 0) + seconds;
    }
    return { total, byDate, rows };
  }

  describe('시작', () => {
    it('서버 시각으로 새 세션을 열고 201, 모든 탭이 같은 세션을 본다', async () => {
      const res = await start({ subject: null, timezone: 'Asia/Seoul' });
      expect(res.statusCode).toBe(201);
      expectContract('/study/active-session/start', 'post', 201, res.json());
      const session = res.json().data.session;
      expect(session).toMatchObject({ subject: null, timezone: 'Asia/Seoul', segments: [{ started_at: iso(T0), ended_at: null }] });

      const read = await active();
      expect(read.statusCode).toBe(200);
      expectContract('/study/active-session', 'get', 200, read.json());
      expect(read.json().data.session).toEqual(session);
    });

    it('진행 중 세션이 없으면 null', async () => {
      const res = await active();
      expectContract('/study/active-session', 'get', 200, res.json());
      expect(res.json().data.session).toBeNull();
    });

    it('이미 진행 중이면 새로 만들지 않고 그 세션을 200으로 준다(다른 탭)', async () => {
      const id = await startedId();
      after(60);
      const again = await start({ subject: null, timezone: 'America/New_York' });
      expect(again.statusCode).toBe(200);
      expectContract('/study/active-session/start', 'post', 200, again.json());
      expect(again.json().data.session.id).toBe(id);
      expect(again.json().data.session.timezone).toBe('Asia/Seoul');
    });

    it('두 탭이 동시에 시작해도 세션은 하나다', async () => {
      const results = await Promise.all([start(), start(), start()]);
      const ids = new Set(results.map((r) => r.json().data.session.id));
      expect(ids.size).toBe(1);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 201]);
      const rows = (await app.db.execute(sql`select count(*)::int as n from study_sessions where user_id = ${me.userId}`)).rows as { n: number }[];
      expect(rows[0]!.n).toBe(1);
    });

    it('같은 키로 다시 보내면 처음 응답을 그대로 돌려준다', async () => {
      const headers = withKey(me);
      const first = await post('/study/active-session/start', { subject: null, timezone: 'Asia/Seoul' }, headers);
      const replay = await post('/study/active-session/start', { subject: null, timezone: 'Asia/Seoul' }, headers);
      expect(replay.statusCode).toBe(201);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.json().data).toEqual(first.json().data);
    });

    it('과목은 설정의 과목 이름만 쓸 수 있다', async () => {
      const unknown = await start({ subject: '수학', timezone: 'Asia/Seoul' });
      expect(unknown.statusCode).toBe(422);
      expectContract('/study/active-session/start', 'post', 422, unknown.json());
      expect(unknown.json().error.details.field).toBe('subject');

      await app.inject({
        method: 'PUT',
        url: '/users/me/study-settings',
        headers: withKey(me),
        payload: JSON.stringify({ daily_goal_minutes: null, subjects: ['수학'], subject: '수학', subject_colors: {} }),
      });
      const ok = await start({ subject: '수학', timezone: 'Asia/Seoul' });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().data.session.subject).toBe('수학');
    });

    it.each([
      [{ subject: null, timezone: 'Mars/Olympus' }, 'timezone'],
      [{ subject: null }, 'timezone'],
      [{ timezone: 'Asia/Seoul' }, 'subject'],
      [{ subject: 3, timezone: 'Asia/Seoul' }, 'subject'],
      [{ subject: null, timezone: 'Asia/Seoul', extra: 1 }, 'extra'],
    ])('잘못된 본문 %j는 422', async (payload, field) => {
      const res = await start(payload);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.details.field).toBe(field);
      expect((await active()).json().data.session).toBeNull();
    });

    it('Idempotency-Key가 없으면 거절한다', async () => {
      const res = await post('/study/active-session/start', { subject: null, timezone: 'Asia/Seoul' }, { ...authHeaders(me), 'content-type': 'application/json' });
      expect(res.statusCode).toBe(400);
    });

    it('세션이 없으면 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/study/active-session' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('일시정지·재개', () => {
    it('서버 시각으로 구간을 닫고 열며, 같은 동작을 다시 해도 그대로다', async () => {
      const id = await startedId();
      after(600);
      const paused = await act(id, 'pause');
      expect(paused.statusCode).toBe(200);
      expectContract('/study/active-session/{session_id}/pause', 'post', 200, paused.json());
      expect(paused.json().data.session.segments).toEqual([{ started_at: iso(T0), ended_at: iso(T0 + 600_000) }]);

      after(700);
      const pausedAgain = await act(id, 'pause');
      expect(pausedAgain.statusCode).toBe(200);
      expect(pausedAgain.json().data.session.segments).toEqual(paused.json().data.session.segments);

      after(900);
      const resumed = await act(id, 'resume');
      expect(resumed.statusCode).toBe(200);
      expectContract('/study/active-session/{session_id}/resume', 'post', 200, resumed.json());
      expect(resumed.json().data.session.segments).toEqual([
        { started_at: iso(T0), ended_at: iso(T0 + 600_000) },
        { started_at: iso(T0 + 900_000), ended_at: null },
      ]);

      after(950);
      const resumedAgain = await act(id, 'resume');
      expect(resumedAgain.json().data.session.segments).toEqual(resumed.json().data.session.segments);
    });

    it('진행 중 세션이 이 id가 아니면 409 SESSION_NOT_ACTIVE', async () => {
      const none = await act(randomUUID(), 'pause');
      expect(none.statusCode).toBe(409);
      expectContract('/study/active-session/{session_id}/pause', 'post', 409, none.json());
      expect(none.json().error.code).toBe('SESSION_NOT_ACTIVE');

      await startedId();
      const wrong = await act(randomUUID(), 'resume');
      expect(wrong.statusCode).toBe(409);
      expectContract('/study/active-session/{session_id}/resume', 'post', 409, wrong.json());
    });

    it('다른 사람의 세션은 건드릴 수 없다', async () => {
      const other = await startAnonymous(app);
      const theirs = await startedId(undefined, other);
      const res = await act(theirs, 'pause');
      expect(res.statusCode).toBe(409);
      expect((await active(other)).json().data.session.segments[0].ended_at).toBeNull();
    });

    it('session_id가 UUID가 아니면 422', async () => {
      const res = await act('not-a-uuid', 'pause');
      expect(res.statusCode).toBe(422);
    });
  });

  describe('끝내기·기록', () => {
    it('구간 합을 기록으로 확정하고 진행 중 세션을 비운다', async () => {
      const id = await startedId();
      after(1500);
      await act(id, 'pause');
      after(1800);
      await act(id, 'resume');
      after(2400);
      const res = await act(id, 'finish');
      expect(res.statusCode).toBe(200);
      expectContract('/study/active-session/{session_id}/finish', 'post', 200, res.json());
      expect(res.json().data.record).toEqual({
        id,
        subject: null,
        started_at: iso(T0),
        ended_at: iso(T0 + 2_400_000),
        focused_seconds: 2100,
        study_date: '2026-03-02',
        segments: [
          { started_at: iso(T0), ended_at: iso(T0 + 1_500_000) },
          { started_at: iso(T0 + 1_800_000), ended_at: iso(T0 + 2_400_000) },
        ],
      });
      expect((await active()).json().data.session).toBeNull();

      const list = await records('from=2026-03-02&to=2026-03-02');
      expect(list.statusCode).toBe(200);
      expectContract('/study/records', 'get', 200, list.json());
      expect(list.json().data.items).toEqual([res.json().data.record]);
    });

    it('응답을 못 받아 다시 끝내도 같은 결과다(같은 키는 재생, 다른 키도 같은 기록)', async () => {
      const id = await startedId();
      after(300);
      const headers = withKey(me);
      const first = await post(`/study/active-session/${id}/finish`, undefined, headers);
      after(400);
      const replay = await post(`/study/active-session/${id}/finish`, undefined, headers);
      expect(replay.headers['idempotent-replayed']).toBe('true');
      expect(replay.json().data).toEqual(first.json().data);
      const otherKey = await act(id, 'finish');
      expect(otherKey.statusCode).toBe(200);
      expect(otherKey.json().data).toEqual(first.json().data);
      expect((await records('from=2026-03-02&to=2026-03-02')).json().data.items).toHaveLength(1);
    });

    it('두 탭이 동시에 끝내도 기록은 하나다', async () => {
      const id = await startedId();
      after(300);
      const [a, b] = await Promise.all([act(id, 'finish'), act(id, 'finish')]);
      expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
      expect(a.json().data.record).toEqual(b.json().data.record);
      expect(a.json().data.record.focused_seconds).toBe(300);
      expect((await records('from=2026-03-02&to=2026-03-02')).json().data.items).toHaveLength(1);
    });

    it('한쪽 탭이 끝내는 동안 다른 탭이 일시정지하면 기록 하나와 409', async () => {
      const id = await startedId();
      after(300);
      const [finish, pause] = await Promise.all([act(id, 'finish'), act(id, 'pause')]);
      expect(finish.statusCode).toBe(200);
      expect([200, 409]).toContain(pause.statusCode);
      expect(finish.json().data.record.focused_seconds).toBe(300);
      expect((await active()).json().data.session).toBeNull();
    });

    it('공부한 시간이 0초면 기록 없이 지우고 record는 null', async () => {
      const id = await startedId();
      const res = await act(id, 'finish');
      expect(res.statusCode).toBe(200);
      expectContract('/study/active-session/{session_id}/finish', 'post', 200, res.json());
      expect(res.json().data.record).toBeNull();
      expect((await act(id, 'finish')).json().data.record).toBeNull();
      expect((await records('from=2026-03-01&to=2026-03-03')).json().data.items).toEqual([]);
      expect((await active()).json().data.session).toBeNull();
    });

    it('끝낸 뒤 다시 시작하면 새 세션이다', async () => {
      const id = await startedId();
      after(60);
      await act(id, 'finish');
      after(120);
      const next = await start();
      expect(next.statusCode).toBe(201);
      expect(next.json().data.session.id).not.toBe(id);
    });

    it('끝낸 세션은 일시정지·재개할 수 없다', async () => {
      const id = await startedId();
      after(60);
      await act(id, 'finish');
      expect((await act(id, 'pause')).statusCode).toBe(409);
      expect((await act(id, 'resume')).statusCode).toBe(409);
    });

    it('공부일은 세션 시간대의 04:00 경계다(03:59 시작은 전날)', async () => {
      at('2026-03-03T03:59:00+09:00');
      const id = await startedId();
      at('2026-03-03T04:30:00+09:00');
      const res = await act(id, 'finish');
      expect(res.json().data.record.study_date).toBe('2026-03-02');

      at('2026-03-03T04:00:00+09:00');
      const id2 = await startedId();
      at('2026-03-03T04:10:00+09:00');
      expect((await act(id2, 'finish')).json().data.record.study_date).toBe('2026-03-03');
    });

    it('시간대가 다른 사용자는 같은 순간도 자기 시간대의 공부일이다', async () => {
      const ny = await startAnonymous(app);
      at('2026-03-03T03:00:00Z'); // 서울 12:00(3일), 뉴욕 전날 22:00(2일)
      const seoulId = await startedId({ subject: null, timezone: 'Asia/Seoul' });
      const nyId = await startedId({ subject: null, timezone: 'America/New_York' }, ny);
      at('2026-03-03T03:30:00Z');
      expect((await act(seoulId, 'finish')).json().data.record.study_date).toBe('2026-03-03');
      expect((await act(nyId, 'finish', ny)).json().data.record.study_date).toBe('2026-03-02');
    });

    it('기록은 공부일 범위로 고르고 시작 순이며 다른 사람 것은 없다', async () => {
      const other = await startAnonymous(app);
      for (const [day, session] of [['2026-03-05', me], ['2026-03-01', me], ['2026-03-03', me], ['2026-03-03', other]] as const) {
        at(`${day}T09:00:00+09:00`);
        const id = await startedId(undefined, session);
        at(`${day}T09:10:00+09:00`);
        await act(id, 'finish', session);
      }
      const res = await records('from=2026-03-01&to=2026-03-03');
      expect(res.json().data.items.map((r: { study_date: string }) => r.study_date)).toEqual(['2026-03-01', '2026-03-03']);
    });

    it.each([
      ['from=2026-03-01', 'to'],
      ['from=2026-03-01&to=2026-05-02', 'to'], // 63일
      ['from=2026-03-05&to=2026-03-01', 'to'],
      ['from=2026-02-30&to=2026-03-01', 'from'],
      ['from=yesterday&to=2026-03-01', 'from'],
    ])('기록 범위 %s는 422', async (query, field) => {
      const res = await records(query);
      expect(res.statusCode).toBe(422);
      expectContract('/study/records', 'get', 422, res.json());
      expect(res.json().error.details.field).toBe(field);
    });

    it('62일 범위는 받는다', async () => {
      expect((await records('from=2026-03-01&to=2026-05-01')).statusCode).toBe(200);
    });
  });

  describe('presence와 인정 구간', () => {
    async function heartbeats(id: string, fromSecond: number, toSecond: number) {
      for (let s = fromSecond; s <= toSecond; s += 30) {
        after(s);
        expect((await presence(id)).statusCode).toBe(204);
      }
    }

    it('진행 중 세션이 이 id가 아니면 409, 본문이 틀리면 422', async () => {
      const none = await presence(randomUUID());
      expect(none.statusCode).toBe(409);
      expectContract('/study/presence', 'put', 409, none.json());
      expect(none.json().error.code).toBe('SESSION_NOT_ACTIVE');

      await startedId();
      expect((await presence(randomUUID())).statusCode).toBe(409);
      const bad = await app.inject({
        method: 'PUT',
        url: '/study/presence',
        headers: { ...authHeaders(me), 'content-type': 'application/json' },
        payload: JSON.stringify({ session_id: 'x' }),
      });
      expect(bad.statusCode).toBe(422);
    });

    it('CSRF 토큰이 없으면 거절한다', async () => {
      const id = await startedId();
      const res = await app.inject({
        method: 'PUT',
        url: '/study/presence',
        headers: { cookie: me.cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ session_id: id }),
      });
      expect(res.statusCode).toBe(403);
    });

    it('30초마다 신호가 오면 공부 시간 전부를 인정한다', async () => {
      const id = await startedId();
      await heartbeats(id, 30, 600);
      after(610);
      await act(id, 'finish');
      expect((await ranked()).total).toBe(610);
    });

    it('인정 시간은 지금을 넘지 않는다(뒤 여유 45초를 미리 넣지 않음)', async () => {
      const id = await startedId();
      await heartbeats(id, 30, 30);
      expect((await ranked()).total).toBe(30);
    });

    it('75초 넘게 끊기면 마지막 신호 뒤 45초까지만 인정한다', async () => {
      const id = await startedId();
      await heartbeats(id, 30, 60);
      after(600);
      await act(id, 'finish');
      expect((await ranked()).total).toBe(105);
    });

    it('끊겼다 다시 오면 새 관측 구간을 열고 앞 45초 여유를 준다', async () => {
      const id = await startedId();
      await heartbeats(id, 30, 60);
      await heartbeats(id, 300, 330);
      after(330);
      await act(id, 'finish');
      // [0, 60+45] + [300-45, 330]
      expect((await ranked()).total).toBe(105 + 75);
    });

    it('일시정지 중 신호는 인정 시간을 늘리지 않고, 재개 뒤에는 다시 센다', async () => {
      const id = await startedId();
      await heartbeats(id, 30, 30);
      after(60);
      await act(id, 'pause');
      await heartbeats(id, 90, 300);
      expect((await ranked()).total).toBe(60);
      after(330);
      await act(id, 'resume');
      await heartbeats(id, 360, 360);
      after(390);
      await act(id, 'finish');
      expect((await ranked()).total).toBe(60 + 60);
    });

    it('일시정지 중 신호만으로는 끊긴 관측 구간을 새로 열지 않는다', async () => {
      const id = await startedId();
      after(10);
      await act(id, 'pause');
      await heartbeats(id, 200, 200);
      after(400);
      await act(id, 'resume');
      after(500);
      await act(id, 'finish');
      // [0,10]은 시작 관측 여유 안, [400,500]은 재개 관측 [400]의 여유 45초까지
      expect((await ranked()).total).toBe(10 + 45);
    });

    it('여러 탭이 같은 때 보내도 한 구간으로 합친다', async () => {
      const id = await startedId();
      after(30);
      const results = await Promise.all([presence(id), presence(id), presence(id)]);
      expect(results.map((r) => r.statusCode)).toEqual([204, 204, 204]);
      after(60);
      await Promise.all([presence(id), presence(id)]);
      const spans = (await app.db.execute(sql`select count(*)::int as n from presence_spans where session_id = ${id}`)).rows as { n: number }[];
      expect(spans[0]!.n).toBe(1);
      expect((await ranked()).total).toBe(60);
    });

    it('인정 구간은 세션 시간대의 04:00에서 공부일이 나뉜다', async () => {
      at('2026-03-03T03:50:00+09:00');
      const startMs = clock;
      const id = await startedId();
      for (let s = 30; s <= 1200; s += 30) {
        at(startMs + s * 1000);
        await presence(id);
      }
      await act(id, 'finish');
      expect((await ranked()).byDate).toEqual({ '2026-03-02': 600, '2026-03-03': 600 });
    });

    it('신호를 보내지 않은 세션은 시작·끝 관측 여유만 인정한다', async () => {
      const id = await startedId();
      after(3600);
      await act(id, 'finish');
      expect((await ranked()).total).toBe(45);
    });
  });

  it('내 데이터를 지우면 설정·세션·기록·관측·인정 구간이 모두 사라진다', async () => {
    await app.inject({
      method: 'PUT',
      url: '/users/me/study-settings',
      headers: withKey(me),
      payload: JSON.stringify({ daily_goal_minutes: 60, subjects: ['수학'], subject: null, subject_colors: {} }),
    });
    const done = await startedId();
    after(30);
    await presence(done);
    after(60);
    await act(done, 'finish');
    const running = await startedId();
    after(90);
    await presence(running);

    expect((await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(me) })).statusCode).toBe(204);
    for (const table of ['study_settings', 'study_sessions', 'presence_spans', 'ranked_segments']) {
      const rows = (await app.db.execute(sql.raw(`select count(*)::int as n from "${table}"`))).rows as { n: number }[];
      expect(rows[0]!.n, table).toBe(0);
    }
  });
});
