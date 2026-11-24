import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { containsBannedWord, normalizeForMatch } from '../src/moderation/banned-words.js';
import { ADJECTIVES, ANIMALS } from '../src/profile/nickname.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { startAnonymous, withKey, type TestSession } from './helpers/session.js';

describe('금칙어', () => {
  it('공백·기호·대소문자·전각을 지우고 비교한다', () => {
    expect(normalizeForMatch(' F.u-C k ')).toBe('fuck');
    expect(normalizeForMatch('ＦＵＣＫ')).toBe('fuck');
    expect(containsBannedWord('씨 발')).toBe(true);
    expect(containsBannedWord('씨.발.공부')).toBe(true);
    expect(containsBannedWord('ＳＨＩＴ')).toBe(true);
    expect(containsBannedWord('I love f_u_c_k')).toBe(true);
  });

  it('평범한 말은 걸리지 않는다', () => {
    for (const text of ['밤새는 올빼미', '공부하는 사람', '수학 1등', 'study hard', '시험 끝!']) {
      expect(containsBannedWord(text), text).toBe(false);
    }
  });

  it('무작위 닉네임 조합은 하나도 걸리지 않는다', () => {
    const hits: string[] = [];
    for (const adjective of ADJECTIVES) {
      for (const animal of ANIMALS) {
        const nickname = `${adjective} ${animal}`;
        if (containsBannedWord(nickname)) hits.push(nickname);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('닉네임 금칙어', () => {
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

  it('금칙어가 든 닉네임은 422로 거절하고 무엇이 걸렸는지 말하지 않는다', async () => {
    const before = await app.inject({ method: 'GET', url: '/users/me/profile', headers: { cookie: me.cookie } });
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/profile',
      headers: withKey(me),
      payload: JSON.stringify({ nickname: '씨 발 공부' }),
    });
    expect(res.statusCode).toBe(422);
    expectContract('/users/me/profile', 'patch', 422, res.json());
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    expect(res.json().error.details.field).toBe('nickname');
    expect(res.json().error.message).not.toMatch(/씨|발/);
    const after = await app.inject({ method: 'GET', url: '/users/me/profile', headers: { cookie: me.cookie } });
    expect(after.json().data.profile.nickname).toBe(before.json().data.profile.nickname);
  });

  it('금칙어가 없으면 그대로 바꾼다', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/users/me/profile',
      headers: withKey(me),
      payload: JSON.stringify({ nickname: '시험 끝!' }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.profile.nickname).toBe('시험 끝!');
  });
});
