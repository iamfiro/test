import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readSettings, writeSetting } from '../src/moderation/settings.js';
import {
  activeIpRestriction,
  activeUserRestriction,
  restrictIp,
  restrictUser,
  unrestrictIp,
  unrestrictUser,
} from '../src/moderation/restrictions.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { startAnonymous } from './helpers/session.js';

const T0 = Date.parse('2026-11-24T03:00:00.000Z');
const HOUR = 60 * 60 * 1000;

async function userCount(app: FastifyInstance): Promise<number> {
  const result = await app.db.execute(sql`select count(*)::int as n from users`);
  return Number((result.rows[0] as { n: number }).n);
}

describe('긴급 스위치·운영자 정지', () => {
  let app: FastifyInstance;
  let clock = T0;

  const start = (headers: Record<string, string> = {}, remoteAddress = '203.0.113.10') =>
    app.inject({
      method: 'POST',
      url: '/auth/start',
      remoteAddress,
      headers: { 'idempotency-key': randomUUID(), ...headers },
    });

  beforeAll(async () => {
    app = await createTestApp({ now: () => new Date(clock) });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    clock += 60 * 1000; // 앞 테스트의 설정 캐시가 남지 않게 캐시 시간(5초)보다 멀리 민다
  });

  describe('설정값', () => {
    it('행이 없으면 모든 스위치가 켜져 있다', async () => {
      expect(await readSettings(app.db)).toEqual({
        chat_write_enabled: true,
        room_create_enabled: true,
        account_create_enabled: true,
      });
      expect(await app.settings.isEnabled('chat_write_enabled')).toBe(true);
      expect(await app.settings.isEnabled('room_create_enabled')).toBe(true);
    });

    it('모르는 키나 true/false가 아닌 값은 저장하지 않는다', async () => {
      await expect(writeSetting(app.db, 'chat_enabled', 'false')).rejects.toThrow();
      await expect(writeSetting(app.db, 'chat_write_enabled', 'off')).rejects.toThrow();
      expect((await readSettings(app.db)).chat_write_enabled).toBe(true);
    });

    it('채팅·방 만들기 스위치를 끄면 읽는 함수가 꺼짐을 돌려준다', async () => {
      await writeSetting(app.db, 'chat_write_enabled', 'false');
      await writeSetting(app.db, 'room_create_enabled', 'false');
      clock += 5000;
      expect(await app.settings.isEnabled('chat_write_enabled')).toBe(false);
      expect(await app.settings.isEnabled('room_create_enabled')).toBe(false);
      expect(await app.settings.isEnabled('account_create_enabled')).toBe(true);
    });
  });

  describe('새 계정 생성 스위치', () => {
    it('끄면 새 계정만 503으로 거절하고 계정을 만들지 않는다', async () => {
      await writeSetting(app.db, 'account_create_enabled', 'false');
      clock += 5000;
      const res = await start();
      expect(res.statusCode).toBe(503);
      expectContract('/auth/start', 'post', 503, res.json());
      expect(res.json().error.code).toBe('ACCOUNT_CREATE_DISABLED');
      expect(res.cookies.find((c) => c.name === 'sv_session')).toBeUndefined();
      expect(await userCount(app)).toBe(0);
    });

    it('꺼져 있어도 이미 세션이 있는 사람은 그대로 들어온다', async () => {
      const me = await startAnonymous(app);
      await writeSetting(app.db, 'account_create_enabled', 'false');
      clock += 5000;
      const res = await start({ cookie: me.cookie });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.user.id).toBe(me.userId);
    });

    it('꺼져 있어도 이미 만든 계정의 재시도(같은 키)는 그 계정을 돌려준다', async () => {
      const key = randomUUID();
      const first = await startAnonymous(app, { key });
      await writeSetting(app.db, 'account_create_enabled', 'false');
      clock += 5000;
      const retry = await start({ 'idempotency-key': key });
      expect(retry.statusCode).toBe(200);
      expect(retry.json().data.user.id).toBe(first.userId);
      expect(await userCount(app)).toBe(1);
    });

    it('다시 켜면 캐시 시간 안에 바로 새 계정을 만든다', async () => {
      await writeSetting(app.db, 'account_create_enabled', 'false');
      clock += 5000;
      expect((await start()).statusCode).toBe(503);
      await writeSetting(app.db, 'account_create_enabled', 'true');
      clock += 5000;
      const res = await start();
      expect(res.statusCode).toBe(200);
      expect(await userCount(app)).toBe(1);
    });
  });

  describe('IP 정지', () => {
    it('account_create로 정지된 IP는 새 계정을 만들지 못하고 다른 IP는 된다', async () => {
      await restrictIp(app.db, { ip: '203.0.113.10', kind: 'account_create', until: new Date(clock + HOUR), reason: '도배' });
      const blocked = await start();
      expect(blocked.statusCode).toBe(403);
      expectContract('/auth/start', 'post', 403, blocked.json());
      expect(blocked.json().error.code).toBe('ACCOUNT_CREATE_RESTRICTED');
      expect(await userCount(app)).toBe(0);
      expect((await start({}, '203.0.113.11')).statusCode).toBe(200);
    });

    it('정지된 IP라도 이미 세션이 있는 사람은 들어온다', async () => {
      const me = await startAnonymous(app, { remoteAddress: '203.0.113.10' });
      await restrictIp(app.db, { ip: '203.0.113.10', kind: 'account_create', until: new Date(clock + HOUR), reason: '도배' });
      expect((await start({ cookie: me.cookie })).statusCode).toBe(200);
    });

    it('기한이 지나거나 풀면 다시 만든다', async () => {
      await restrictIp(app.db, { ip: '203.0.113.10', kind: 'account_create', until: new Date(clock + HOUR), reason: '도배' });
      clock += HOUR + 1000;
      expect((await start()).statusCode).toBe(200);

      await restrictIp(app.db, { ip: '203.0.113.10', kind: 'account_create', until: new Date(clock + HOUR), reason: '도배' });
      expect((await start()).statusCode).toBe(403);
      expect(await unrestrictIp(app.db, '203.0.113.10', 'account_create')).toBe(true);
      expect((await start()).statusCode).toBe(200);
    });

    it('IPv4-mapped IPv6 주소도 같은 IP로 본다', async () => {
      await restrictIp(app.db, { ip: '203.0.113.10', kind: 'account_create', until: new Date(clock + HOUR), reason: '도배' });
      expect((await start({}, '::ffff:203.0.113.10')).statusCode).toBe(403);
    });

    it('다른 종류(chat) 정지는 계정 생성을 막지 않고, 검사 함수는 종류별로 답한다', async () => {
      await restrictIp(app.db, { ip: '203.0.113.10', kind: 'chat', until: new Date(clock + HOUR), reason: '욕설' });
      expect((await start()).statusCode).toBe(200);
      const now = new Date(clock);
      expect(await activeIpRestriction(app.db, '203.0.113.10', 'chat', now)).toMatchObject({ reason: '욕설' });
      expect(await activeIpRestriction(app.db, '203.0.113.10', 'room_create', now)).toBeNull();
    });
  });

  describe('계정 정지 검사', () => {
    it('종류·기한별로 답하고 다시 걸면 기한을 바꾸고 풀면 없어진다', async () => {
      const me = await startAnonymous(app);
      const now = () => new Date(clock);
      await restrictUser(app.db, { userId: me.userId, kind: 'chat', until: new Date(clock + HOUR), reason: '욕설' });
      expect(await activeUserRestriction(app.db, me.userId, 'chat', now())).toMatchObject({ reason: '욕설' });
      expect(await activeUserRestriction(app.db, me.userId, 'room_create', now())).toBeNull();

      await restrictUser(app.db, { userId: me.userId, kind: 'chat', until: new Date(clock + 3 * HOUR), reason: '반복' });
      clock += 2 * HOUR;
      expect(await activeUserRestriction(app.db, me.userId, 'chat', now())).toMatchObject({ reason: '반복' });
      clock += 2 * HOUR;
      expect(await activeUserRestriction(app.db, me.userId, 'chat', now())).toBeNull();

      await restrictUser(app.db, { userId: me.userId, kind: 'room_create', until: new Date(clock + HOUR), reason: '도배' });
      expect(await unrestrictUser(app.db, me.userId, 'room_create')).toBe(true);
      expect(await activeUserRestriction(app.db, me.userId, 'room_create', now())).toBeNull();
      expect(await unrestrictUser(app.db, me.userId, 'room_create')).toBe(false);
    });
  });
});
