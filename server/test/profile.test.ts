import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

const AVATAR = { shape: 'star', color: 'mint', eyes: 'happy', mouth: 'grin', accessory: 'crown' };

describe('프로필·온보딩', () => {
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

  const patch = (payload: unknown, headers = withKey(me)) =>
    app.inject({ method: 'PATCH', url: '/users/me/profile', headers, payload: JSON.stringify(payload) });

  it('GET /users/me/profile은 내 프로필을 준다', async () => {
    const res = await app.inject({ method: 'GET', url: '/users/me/profile', headers: { cookie: me.cookie } });
    expect(res.statusCode).toBe(200);
    expectContract('/users/me/profile', 'get', 200, res.json());
    expect(res.json().data.profile.nickname).toBe(me.res.json().data.user.profile.nickname);
  });

  it('닉네임은 앞뒤 공백을 지우고 저장한다', async () => {
    const res = await patch({ nickname: '  밤새는 올빼미  ' });
    expect(res.statusCode).toBe(200);
    expectContract('/users/me/profile', 'patch', 200, res.json());
    expect(res.json().data.profile.nickname).toBe('밤새는 올빼미');
    const again = await app.inject({ method: 'GET', url: '/users/me/profile', headers: { cookie: me.cookie } });
    expect(again.json().data.profile.nickname).toBe('밤새는 올빼미');
  });

  it.each([
    ['빈 닉네임', { nickname: '   ' }, 'nickname'],
    ['13자', { nickname: '가'.repeat(13) }, 'nickname'],
    ['제어 문자', { nickname: '나\n비' }, 'nickname'],
    ['48바이트 초과(결합 문자)', { nickname: '가' + '́'.repeat(40) }, 'nickname'],
    ['빈 요청', {}, undefined],
    ['모르는 필드', { nickname: '가나', extra: 1 }, undefined],
    ['없는 캐릭터 값', { avatar: { ...AVATAR, shape: 'square' } }, 'avatar'],
    ['캐릭터 일부 빠짐', { avatar: { shape: 'star' } }, 'avatar'],
    ['없는 성별', { gender: 'other' }, 'gender'],
  ])('규칙에 맞지 않으면 422: %s', async (_name, payload, field) => {
    const before = (await app.inject({ method: 'GET', url: '/users/me/profile', headers: { cookie: me.cookie } })).json();
    const res = await patch(payload);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    if (field) expect(res.json().error.details.field).toBe(field);
    expectContract('/users/me/profile', 'patch', 422, res.json());
    const after = (await app.inject({ method: 'GET', url: '/users/me/profile', headers: { cookie: me.cookie } })).json();
    expect(after.data).toEqual(before.data);
  });

  it('캐릭터와 성별을 바꾼다', async () => {
    const res = await patch({ avatar: AVATAR, gender: 'female' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.profile.avatar).toEqual(AVATAR);
    expect(res.json().data.profile.gender).toBe('female');
  });

  it('보낸 항목만 바꾼다', async () => {
    await patch({ nickname: '하나', gender: 'male' });
    const res = await patch({ avatar: AVATAR });
    expect(res.json().data.profile.nickname).toBe('하나');
    expect(res.json().data.profile.gender).toBe('male');
  });

  it('쓰기는 Idempotency-Key가 없으면 400, CSRF가 없으면 403', async () => {
    const noKey = await patch({ nickname: '가나' }, { ...authHeaders(me), 'content-type': 'application/json' } as never);
    expect(noKey.statusCode).toBe(400);
    const noCsrf = await patch({ nickname: '가나' }, { cookie: me.cookie, 'content-type': 'application/json', 'idempotency-key': randomUUID() } as never);
    expect(noCsrf.statusCode).toBe(403);
  });

  it('같은 키 재전송은 같은 응답을 준다', async () => {
    const headers = withKey(me);
    const first = await patch({ nickname: '다시' }, headers);
    const second = await patch({ nickname: '다시' }, headers);
    expect(second.statusCode).toBe(200);
    expect(second.json().data).toEqual(first.json().data);
    expect(second.headers['idempotent-replayed']).toBe('true');
  });

  describe('PUT /users/me/onboarding', () => {
    const put = (headers = withKey(me)) => app.inject({ method: 'PUT', url: '/users/me/onboarding', headers });

    it('끝냈다고 남기고 Me를 돌려준다', async () => {
      const res = await put();
      expect(res.statusCode).toBe(200);
      expectContract('/users/me/onboarding', 'put', 200, res.json());
      expect(res.json().data.onboarding_completed_at).not.toBeNull();
      expect(res.json().data.id).toBe(me.userId);
    });

    it('이미 남겼으면 처음 시각을 덮어쓰지 않는다', async () => {
      const first = await put();
      const second = await put();
      expect(second.statusCode).toBe(200);
      expect(second.json().data.onboarding_completed_at).toBe(first.json().data.onboarding_completed_at);
    });

    it('세션에도 반영된다', async () => {
      await put();
      const res = await app.inject({ method: 'GET', url: '/auth/session', headers: { cookie: me.cookie } });
      expect(res.json().data.user.onboarding_completed_at).not.toBeNull();
    });
  });
});
