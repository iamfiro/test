import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reports, users } from '../src/db/schema.js';
import { fileReport } from '../src/moderation/reports.js';
import { ADJECTIVES, ANIMALS } from '../src/profile/nickname.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

async function nicknameOf(app: FastifyInstance, userId: string): Promise<string> {
  const [row] = await app.db.select({ nickname: users.nickname }).from(users).where(eq(users.id, userId));
  return row!.nickname;
}

async function reportCount(app: FastifyInstance): Promise<number> {
  const result = await app.db.execute(sql`select count(*)::int as n from reports`);
  return Number((result.rows[0] as { n: number }).n);
}

const isRandomNickname = (nickname: string) => {
  const [adjective, animal] = nickname.split(' ');
  return ADJECTIVES.includes(adjective!) && ANIMALS.includes(animal!);
};

describe('신고', () => {
  let app: FastifyInstance;
  let target: TestSession;
  let reporters: TestSession[];

  const report = (from: TestSession, payload: unknown, headers = withKey(from)) =>
    app.inject({ method: 'POST', url: '/reports', headers, payload: JSON.stringify(payload) });

  const nicknameReport = (from: TestSession, extra: Record<string, unknown> = {}) =>
    report(from, { target_type: 'nickname', target_id: target.userId, reason: 'profanity', ...extra });

  const rename = (who: TestSession, nickname: string) =>
    app.inject({ method: 'PATCH', url: '/users/me/profile', headers: withKey(who), payload: JSON.stringify({ nickname }) });

  beforeAll(async () => {
    app = await createTestApp({ env: { REPORT_HIDE_THRESHOLD: '3' } });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    target = await startAnonymous(app);
    reporters = [];
    for (let i = 0; i < 4; i += 1) reporters.push(await startAnonymous(app, { remoteAddress: `198.51.100.${i + 1}` }));
    expect((await rename(target, '나쁜 이름')).statusCode).toBe(200);
  });

  describe('POST /reports (닉네임)', () => {
    it('신고를 받아 저장하고 계약 모양으로 답한다', async () => {
      const res = await nicknameReport(reporters[0]!);
      expect(res.statusCode).toBe(200);
      expectContract('/reports', 'post', 200, res.json());
      expect(res.json().data.report).toMatchObject({ target_type: 'nickname', target_id: target.userId, reason: 'profanity' });
      expect(await reportCount(app)).toBe(1);
    });

    it('같은 사람이 같은 닉네임을 다시 신고해도(다른 키) 한 건이다', async () => {
      const first = await nicknameReport(reporters[0]!);
      const second = await nicknameReport(reporters[0]!, { reason: 'sexual' });
      expect(second.statusCode).toBe(200);
      expectContract('/reports', 'post', 200, second.json());
      expect(second.json().data.report).toEqual(first.json().data.report);
      expect(await reportCount(app)).toBe(1);
    });

    it('같은 Idempotency-Key 재전송은 처음 응답을 그대로 주고 더 세지 않는다', async () => {
      const headers = withKey(reporters[0]!);
      const payload = { target_type: 'nickname', target_id: target.userId, reason: 'spam' };
      const first = await report(reporters[0]!, payload, headers);
      const again = await report(reporters[0]!, payload, headers);
      expect(again.statusCode).toBe(200);
      expect(again.json().data).toEqual(first.json().data);
      expect(await reportCount(app)).toBe(1);
    });

    it.each([
      ['모르는 대상 종류', { target_type: 'room', target_id: 'x', reason: 'spam' }, 'target_type'],
      ['메시지는 소켓으로만', { target_type: 'message', target_id: randomUUID(), reason: 'spam' }, 'target_type'],
      ['id 형식', { target_type: 'nickname', target_id: 'abc', reason: 'spam' }, 'target_id'],
      ['모르는 사유', { target_type: 'nickname', target_id: '__target__', reason: 'ugly' }, 'reason'],
      ['그 밖의 문제는 설명 필요', { target_type: 'nickname', target_id: '__target__', reason: 'other' }, 'detail'],
      ['설명 1000자 초과', { target_type: 'nickname', target_id: '__target__', reason: 'other', detail: '가'.repeat(1001) }, 'detail'],
      ['모르는 항목', { target_type: 'nickname', target_id: '__target__', reason: 'spam', extra: 1 }, 'extra'],
    ])('규칙에 맞지 않으면 422: %s', async (_name, payload, field) => {
      const body = { ...payload, target_id: payload.target_id === '__target__' ? target.userId : payload.target_id };
      const res = await report(reporters[0]!, body);
      expect(res.statusCode).toBe(422);
      expectContract('/reports', 'post', 422, res.json());
      expect(res.json().error.details.field).toBe(field);
      expect(await reportCount(app)).toBe(0);
    });

    it('내 닉네임은 신고할 수 없다', async () => {
      const res = await report(target, { target_type: 'nickname', target_id: target.userId, reason: 'spam' });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.details.field).toBe('target_id');
    });

    it('없는 사용자는 404', async () => {
      const res = await report(reporters[0]!, { target_type: 'nickname', target_id: randomUUID(), reason: 'spam' });
      expect(res.statusCode).toBe(404);
      expectContract('/reports', 'post', 404, res.json());
    });

    it('설명이 있는 신고는 설명을 저장한다', async () => {
      const res = await nicknameReport(reporters[0]!, { reason: 'other', detail: '  다른 사람 이름을 흉내 내요  ' });
      expect(res.statusCode).toBe(200);
      const [row] = await app.db.select().from(reports);
      expect(row!.detail).toBe('다른 사람 이름을 흉내 내요');
      expect(row!.content).toBe('나쁜 이름');
    });

    it('세션·CSRF·키가 없으면 거절', async () => {
      const payload = JSON.stringify({ target_type: 'nickname', target_id: target.userId, reason: 'spam' });
      expect((await app.inject({ method: 'POST', url: '/reports', payload })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url: '/reports', headers: { ...authHeaders(reporters[0]!), 'content-type': 'application/json' }, payload }))
          .statusCode,
      ).toBe(400);
    });
  });

  describe('기준 도달', () => {
    it('서로 다른 2명까지는 그대로, 3명째에 닉네임을 무작위 이름으로 되돌리고 신고를 처리됨으로 남긴다', async () => {
      await nicknameReport(reporters[0]!);
      await nicknameReport(reporters[1]!);
      await nicknameReport(reporters[1]!); // 중복은 세지 않는다
      expect(await nicknameOf(app, target.userId)).toBe('나쁜 이름');

      await nicknameReport(reporters[2]!);
      const after = await nicknameOf(app, target.userId);
      expect(after).not.toBe('나쁜 이름');
      expect(isRandomNickname(after)).toBe(true);
      const rows = await app.db.select().from(reports);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.handledAt).not.toBeNull();
        expect(row.action).toBe('nickname_reset');
      }
    });

    it('동시에 3건이 와도 한 번만 되돌린다', async () => {
      const results = await Promise.all(reporters.slice(0, 3).map((r) => nicknameReport(r)));
      expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
      const rows = await app.db.select().from(reports);
      expect(rows.filter((row) => row.action === 'nickname_reset')).toHaveLength(3);
      expect(isRandomNickname(await nicknameOf(app, target.userId))).toBe(true);
    });

    it('되돌린 뒤의 새 닉네임은 처음부터 다시 센다', async () => {
      for (const r of reporters.slice(0, 3)) await nicknameReport(r);
      expect((await rename(target, '또 나쁜 이름')).statusCode).toBe(200);
      await nicknameReport(reporters[0]!);
      await nicknameReport(reporters[1]!);
      expect(await nicknameOf(app, target.userId)).toBe('또 나쁜 이름');
      await nicknameReport(reporters[3]!);
      expect(isRandomNickname(await nicknameOf(app, target.userId))).toBe(true);
    });

    it('스스로 닉네임을 바꾸면 옛 닉네임 신고는 새 닉네임에 세지 않는다', async () => {
      await nicknameReport(reporters[0]!);
      await nicknameReport(reporters[1]!);
      expect((await rename(target, '착한 이름')).statusCode).toBe(200);
      await nicknameReport(reporters[2]!);
      expect(await nicknameOf(app, target.userId)).toBe('착한 이름');
    });

    it('저장 함수는 다른 대상 종류(메시지)에도 기준 도달 때 한 번만 처리 함수를 부른다(L5)', async () => {
      const messageId = randomUUID();
      let calls = 0;
      const file = (reporter: TestSession) =>
        fileReport(app.db, {
          reporterUserId: reporter.userId,
          targetType: 'message',
          targetId: messageId,
          reason: 'spam',
          detail: null,
          threshold: 2,
          loadTarget: async () => ({ targetUserId: target.userId, content: '도배 메시지' }),
          onThreshold: async () => {
            calls += 1;
            return 'message_hidden';
          },
        });
      expect((await file(reporters[0]!)).created).toBe(true);
      expect((await file(reporters[0]!)).created).toBe(false);
      expect(calls).toBe(0);
      expect((await file(reporters[1]!)).action).toBe('message_hidden');
      expect(calls).toBe(1);
      await file(reporters[2]!); // 이미 처리된 뒤의 신고는 기준을 새로 채울 때까지 다시 부르지 않는다
      expect(calls).toBe(1);
    });
  });

  describe('내 데이터 지우기', () => {
    it('신고한 사람·신고당한 사람이 지우면 그 신고가 남지 않는다', async () => {
      await nicknameReport(reporters[0]!);
      await nicknameReport(reporters[1]!);
      expect(await reportCount(app)).toBe(2);
      await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(reporters[0]!) });
      expect(await reportCount(app)).toBe(1);
      await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(target) });
      expect(await reportCount(app)).toBe(0);
    });
  });
});
