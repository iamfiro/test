import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';
import { seedRanked } from './helpers/study.js';

let clock = 0;
const at = (value: string | number) => {
  clock = typeof value === 'number' ? value : Date.parse(value);
};

describe('스트릭 GET /study/streak', () => {
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
  });

  const streak = (timezone = 'Asia/Seoul', headers: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: `/study/streak?timezone=${encodeURIComponent(timezone)}`, headers: { cookie: me.cookie, ...headers } });

  /** [date]의 공부일 10:00(KST)부터 [minutes]분 인정 공부. */
  const studyOn = (date: string, minutes: number) =>
    seedRanked(app, me.userId, `${date}T10:00:00+09:00`, new Date(Date.parse(`${date}T10:00:00+09:00`) + minutes * 60_000).toISOString());

  it('기록이 없으면 0이고 최근 7일은 놓친 날과 아직 열린 오늘', async () => {
    const res = await streak();
    expect(res.statusCode).toBe(200);
    expectContract('/study/streak', 'get', 200, res.json());
    expect(res.json().data).toEqual({
      current: 0,
      longest: 0,
      today_seconds: 0,
      today_remaining_seconds: 600,
      recent_days: [
        { date: '2026-02-26', state: 'missed' },
        { date: '2026-02-27', state: 'missed' },
        { date: '2026-02-28', state: 'missed' },
        { date: '2026-03-01', state: 'missed' },
        { date: '2026-03-02', state: 'missed' },
        { date: '2026-03-03', state: 'missed' },
        { date: '2026-03-04', state: 'open' },
      ],
    });
  });

  it('오늘이 10분이 안 되면 어제부터 세고, 10분을 넘기면 오늘까지 센다', async () => {
    await studyOn('2026-03-02', 30);
    await studyOn('2026-03-03', 10);
    await studyOn('2026-03-04', 4);
    let data = (await streak()).json().data;
    expect(data.current).toBe(2);
    expect(data.today_seconds).toBe(240);
    expect(data.today_remaining_seconds).toBe(360);
    expect(data.recent_days.slice(-3)).toEqual([
      { date: '2026-03-02', state: 'studied' },
      { date: '2026-03-03', state: 'studied' },
      { date: '2026-03-04', state: 'open' },
    ]);
    await seedRanked(app, me.userId, '2026-03-04T11:00:00+09:00', '2026-03-04T11:06:00+09:00');
    data = (await streak()).json().data;
    expect(data.current).toBe(3);
    expect(data.today_remaining_seconds).toBe(0);
    expect(data.recent_days.at(-1)).toEqual({ date: '2026-03-04', state: 'studied' });
  });

  it('10분 미만인 날은 공부한 날이 아니고, 하루 놓치면 0으로 돌아간다(보호 없음). 최장은 남는다', async () => {
    for (const date of ['2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23']) await studyOn(date, 15);
    await studyOn('2026-03-02', 9); // 9분: 공부한 날 아님
    await studyOn('2026-03-03', 20);
    const data = (await streak()).json().data;
    expect(data.current).toBe(1);
    expect(data.longest).toBe(4);
    expect(data.recent_days.find((d: { date: string }) => d.date === '2026-03-02').state).toBe('missed');
  });

  it('공부일은 04:00 경계: 새벽 3시대 공부는 전날로 센다', async () => {
    await seedRanked(app, me.userId, '2026-03-04T03:40:00+09:00', '2026-03-04T03:55:00+09:00'); // 3일 공부일
    const data = (await streak()).json().data;
    expect(data.today_seconds).toBe(0);
    expect(data.recent_days.at(-2)).toEqual({ date: '2026-03-03', state: 'studied' });
    expect(data.current).toBe(1);
  });

  it('진행 중 세션도 서버가 본 때까지의 인정 시간이 오늘에 들어간다', async () => {
    at('2026-03-04T10:00:00+09:00');
    const started = await app.inject({
      method: 'POST',
      url: '/study/active-session/start',
      headers: withKey(me),
      payload: JSON.stringify({ subject: null, timezone: 'Asia/Seoul' }),
    });
    const id = started.json().data.session.id as string;
    for (let minute = 1; minute <= 5; minute++) {
      at(Date.parse('2026-03-04T10:00:00+09:00') + minute * 60_000);
      const res = await app.inject({
        method: 'PUT',
        url: '/study/presence',
        headers: { ...authHeaders(me), 'content-type': 'application/json' },
        payload: JSON.stringify({ session_id: id }),
      });
      expect(res.statusCode).toBe(204);
    }
    const data = (await streak()).json().data;
    expect(data.today_seconds).toBe(300);
    expect(data.today_remaining_seconds).toBe(300);
  });

  it('ETag가 같으면 304, 공부가 늘면 새 값', async () => {
    const first = await streak();
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();
    expect((await streak('Asia/Seoul', { 'if-none-match': etag })).statusCode).toBe(304);
    await studyOn('2026-03-04', 12);
    const changed = await streak('Asia/Seoul', { 'if-none-match': etag });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().data.current).toBe(1);
  });

  it('시간대가 없거나 틀리면 422, 세션이 없으면 401', async () => {
    expect((await app.inject({ method: 'GET', url: '/study/streak', headers: { cookie: me.cookie } })).statusCode).toBe(422);
    expect((await streak('+09:00')).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: '/study/streak?timezone=Asia/Seoul' })).statusCode).toBe(401);
  });
});
