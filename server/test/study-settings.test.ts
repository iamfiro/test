import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

const EMPTY = { daily_goal_minutes: null, subjects: [], subject: null, subject_colors: {} };

describe('공부 설정 /users/me/study-settings', () => {
  let app: FastifyInstance;
  let me: TestSession;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    me = await startAnonymous(app);
  });

  const get = (session = me) => app.inject({ method: 'GET', url: '/users/me/study-settings', headers: { cookie: session.cookie } });
  const put = (payload: unknown, headers: Record<string, string> = withKey(me)) =>
    app.inject({ method: 'PUT', url: '/users/me/study-settings', headers, payload: JSON.stringify(payload) });

  it('처음에는 목표 없음·과목 없음이다', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expectContract('/users/me/study-settings', 'get', 200, res.json());
    expect(res.json().data).toEqual(EMPTY);
  });

  it('바꾼 설정을 다시 읽으면 그대로다(과목 이름은 앞뒤 공백을 지우고, 목록에 없는 과목 색은 지운다)', async () => {
    const res = await put({
      daily_goal_minutes: 180,
      subjects: ['  수학 ', '영어'],
      subject: '수학',
      subject_colors: { 수학: 2, 영어: 0, 국어: 5 },
    });
    expect(res.statusCode).toBe(200);
    expectContract('/users/me/study-settings', 'put', 200, res.json());
    const expected = { daily_goal_minutes: 180, subjects: ['수학', '영어'], subject: '수학', subject_colors: { 수학: 2, 영어: 0 } };
    expect(res.json().data).toEqual(expected);
    expect((await get()).json().data).toEqual(expected);
  });

  it('다른 사람의 설정에 영향을 주지 않는다', async () => {
    const other = await startAnonymous(app);
    await put({ daily_goal_minutes: 60, subjects: ['수학'], subject: null, subject_colors: {} });
    expect((await get(other)).json().data).toEqual(EMPTY);
  });

  it.each([
    ['목표가 60의 배수가 아님', { ...EMPTY, daily_goal_minutes: 90 }, 'daily_goal_minutes'],
    ['목표가 24시간 초과', { ...EMPTY, daily_goal_minutes: 1500 }, 'daily_goal_minutes'],
    ['과목 이름이 공백뿐', { ...EMPTY, subjects: ['  '] }, 'subjects'],
    ['과목 이름이 20자 초과', { ...EMPTY, subjects: ['가'.repeat(21)] }, 'subjects'],
    ['공백을 지우면 같은 과목', { ...EMPTY, subjects: ['수학', ' 수학'] }, 'subjects'],
    ['과목이 50개 초과', { ...EMPTY, subjects: Array.from({ length: 51 }, (_, i) => `과목${i}`) }, 'subjects'],
    ['고른 과목이 목록에 없음', { ...EMPTY, subjects: ['수학'], subject: '영어' }, 'subject'],
    ['색 번호가 0–7 밖', { ...EMPTY, subjects: ['수학'], subject_colors: { 수학: 8 } }, 'subject_colors'],
    ['모르는 항목', { ...EMPTY, theme: 'dark' }, 'theme'],
    ['빠진 항목', { daily_goal_minutes: null, subjects: [], subject: null }, 'subject_colors'],
  ])('%s이면 422이고 저장하지 않는다', async (_name, payload, field) => {
    const res = await put(payload);
    expect(res.statusCode).toBe(422);
    expectContract('/users/me/study-settings', 'put', 422, res.json());
    expect(res.json().error.details.field).toBe(field);
    expect((await get()).json().data).toEqual(EMPTY);
  });

  it('Idempotency-Key가 없으면 거절한다', async () => {
    const res = await put(EMPTY, { ...authHeaders(me), 'content-type': 'application/json' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('CSRF 토큰이 없으면 거절한다', async () => {
    const headers = withKey(me);
    delete (headers as Record<string, string>)['x-csrf-token'];
    const res = await put(EMPTY, headers);
    expect(res.statusCode).toBe(403);
  });

  it('세션이 없으면 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/study-settings' });
    expect(res.statusCode).toBe(401);
    expectContract('/users/me/study-settings', 'get', 401, res.json());
  });
});
