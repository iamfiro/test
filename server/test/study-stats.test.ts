import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

let clock = 0;
const at = (value: string | number) => {
  clock = typeof value === 'number' ? value : Date.parse(value);
};

describe('통계 GET /study/stats', () => {
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
    at('2026-03-04T12:00:00+09:00'); // 수요일
    me = await startAnonymous(app);
    await app.inject({
      method: 'PUT',
      url: '/users/me/study-settings',
      headers: withKey(me),
      payload: JSON.stringify({ daily_goal_minutes: null, subjects: ['수학', '영어'], subject: null, subject_colors: {} }),
    });
  });

  const stats = (timezone = 'Asia/Seoul') =>
    app.inject({ method: 'GET', url: `/study/stats?timezone=${encodeURIComponent(timezone)}`, headers: { cookie: me.cookie } });

  /**
   * [from, to] 동안 공부한 세션 하나를 남긴다. `heartbeat`면 60초마다(75초 안이라 관측 구간이 이어진다) presence를
   * 보내 인정 시간이 되게 한다. 요청 수를 줄이는 것은 앱 전체 rate limit(IP당 분당 300) 때문이다.
   * 끝나면 시계를 `restore`로 돌린다.
   */
  async function study(from: string, to: string, options: { subject?: string | null; heartbeat?: boolean; finish?: boolean } = {}) {
    const restore = clock;
    at(from);
    const started = await app.inject({
      method: 'POST',
      url: '/study/active-session/start',
      headers: withKey(me),
      payload: JSON.stringify({ subject: options.subject ?? null, timezone: 'Asia/Seoul' }),
    });
    const id = started.json().data.session.id as string;
    const end = Date.parse(to);
    if (options.heartbeat) {
      for (let t = Date.parse(from) + 60_000; t <= end; t += 60_000) {
        at(t);
        await app.inject({
          method: 'PUT',
          url: '/study/presence',
          headers: { ...authHeaders(me), 'content-type': 'application/json' },
          payload: JSON.stringify({ session_id: id }),
        });
      }
    }
    at(to);
    if (options.finish !== false) {
      await app.inject({ method: 'POST', url: `/study/active-session/${id}/finish`, headers: withKey(me) });
    }
    at(restore);
    return id;
  }

  const seconds = (days: { date: string; seconds: number }[], date: string) => days.find((d) => d.date === date)?.seconds;

  it('기록이 없으면 0으로 채운 한 벌을 준다(주는 월요일부터, 최근 16주)', async () => {
    const res = await stats();
    expect(res.statusCode).toBe(200);
    expectContract('/study/stats', 'get', 200, res.json());
    const data = res.json().data;
    expect(data.today).toEqual({ date: '2026-03-04', seconds: 0 });
    expect(data.yesterday_seconds).toBe(0);
    expect(data.week.days.map((d: { date: string }) => d.date)).toEqual([
      '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08',
    ]);
    expect(data.week.total_seconds).toBe(0);
    expect(data.streak_days).toBe(0);
    expect(data.today_by_subject).toEqual([]);
    expect(data.subjects_week).toEqual([]);
    expect(data.recent_weeks).toHaveLength(112);
    expect(data.recent_weeks[0].date).toBe('2025-11-17');
    expect(data.recent_weeks[111].date).toBe('2026-03-08');
  });

  it('04:00을 넘는 공부는 공부일 경계에서 나눈다', async () => {
    await study('2026-03-04T03:30:00+09:00', '2026-03-04T04:30:00+09:00');
    const data = (await stats()).json().data;
    expect(data.today.seconds).toBe(1800);
    expect(data.yesterday_seconds).toBe(1800);
    expect(seconds(data.week.days, '2026-03-03')).toBe(1800);
    expect(seconds(data.week.days, '2026-03-04')).toBe(1800);
    expect(data.week.total_seconds).toBe(3600);
  });

  it('새벽 3시 59분은 아직 어제다', async () => {
    await study('2026-03-04T03:00:00+09:00', '2026-03-04T03:20:00+09:00');
    at('2026-03-04T03:59:00+09:00');
    const data = (await stats()).json().data;
    expect(data.today).toEqual({ date: '2026-03-03', seconds: 1200 });
  });

  it('과목별 합: 오늘은 0초 초과, 이번 주는 1분 이상, 많은 순', async () => {
    await study('2026-03-02T10:00:00+09:00', '2026-03-02T10:30:00+09:00', { subject: '수학' });
    await study('2026-03-04T09:00:00+09:00', '2026-03-04T09:20:00+09:00', { subject: '영어' });
    await study('2026-03-04T09:30:00+09:00', '2026-03-04T09:30:30+09:00', { subject: null });
    await study('2026-03-04T10:00:00+09:00', '2026-03-04T10:05:00+09:00', { subject: '수학' });
    await study('2026-03-01T10:00:00+09:00', '2026-03-01T11:00:00+09:00', { subject: '수학' }); // 지난주 일요일
    const res = await stats();
    expectContract('/study/stats', 'get', 200, res.json());
    const data = res.json().data;
    expect(data.today_by_subject).toEqual([
      { subject: '영어', seconds: 1200 },
      { subject: '수학', seconds: 300 },
      { subject: null, seconds: 30 },
    ]);
    expect(data.subjects_week).toEqual([
      { subject: '수학', seconds: 2100 },
      { subject: '영어', seconds: 1200 },
    ]);
    expect(data.week.total_seconds).toBe(1800 + 1200 + 30 + 300);
    expect(seconds(data.recent_weeks, '2026-03-01')).toBe(3600);
  });

  it('진행 중 세션은 넣지 않는다', async () => {
    await study('2026-03-04T10:00:00+09:00', '2026-03-04T10:15:00+09:00', { heartbeat: true, finish: false });
    const data = (await stats()).json().data;
    expect(data.today.seconds).toBe(0);
    expect(data.streak_days).toBe(0);
  });

  it('같은 기록도 요청한 시간대의 공부일로 나눈다', async () => {
    await study('2026-03-04T10:00:00+09:00', '2026-03-04T11:00:00+09:00'); // 뉴욕 3일 20:00–21:00
    const seoul = (await stats('Asia/Seoul')).json().data;
    const newYork = await stats('America/New_York');
    expectContract('/study/stats', 'get', 200, newYork.json());
    expect(seconds(seoul.recent_weeks, '2026-03-04')).toBe(3600);
    expect(seconds(newYork.json().data.recent_weeks, '2026-03-03')).toBe(3600);
    expect(seconds(newYork.json().data.recent_weeks, '2026-03-04')).toBe(0);
  });

  describe('연속일(인정 시간 10분 이상인 날)', () => {
    it('presence로 인정되지 않은 날은 기록이 있어도 연속이 끊긴다', async () => {
      await study('2026-03-02T10:00:00+09:00', '2026-03-02T10:15:00+09:00', { heartbeat: true });
      await study('2026-03-03T10:00:00+09:00', '2026-03-03T10:15:00+09:00'); // 신호 없음
      await study('2026-03-04T10:00:00+09:00', '2026-03-04T10:15:00+09:00', { heartbeat: true });
      const data = (await stats()).json().data;
      expect(data.yesterday_seconds).toBe(900);
      expect(data.streak_days).toBe(1);
    });

    it('오늘이 아직 10분이 안 되면 어제부터 센다', async () => {
      await study('2026-03-02T10:00:00+09:00', '2026-03-02T10:11:00+09:00', { heartbeat: true });
      await study('2026-03-03T10:00:00+09:00', '2026-03-03T10:11:00+09:00', { heartbeat: true });
      await study('2026-03-04T10:00:00+09:00', '2026-03-04T10:05:00+09:00', { heartbeat: true });
      expect((await stats()).json().data.streak_days).toBe(2);
    });

    it('10분이 안 되는 날은 공부한 날이 아니다', async () => {
      await study('2026-03-03T10:00:00+09:00', '2026-03-03T10:09:00+09:00', { heartbeat: true });
      await study('2026-03-04T10:00:00+09:00', '2026-03-04T10:15:00+09:00', { heartbeat: true });
      expect((await stats()).json().data.streak_days).toBe(1);
    });
  });

  it.each([[''], ['timezone=Mars%2FOlympus'], ['timezone=%2B09%3A00']])('시간대 %s는 422', async (query) => {
    const res = await app.inject({ method: 'GET', url: `/study/stats?${query}`, headers: { cookie: me.cookie } });
    expect(res.statusCode).toBe(422);
    expectContract('/study/stats', 'get', 422, res.json());
    expect(res.json().error.details.field).toBe('timezone');
  });

  it('세션이 없으면 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/study/stats?timezone=Asia%2FSeoul' });
    expect(res.statusCode).toBe(401);
  });
});
