import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/ops/commands.js';
import { readSettings } from '../src/moderation/settings.js';
import { activeIpRestriction, activeUserRestriction } from '../src/moderation/restrictions.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { startAnonymous, withKey } from './helpers/session.js';

const NOW = new Date('2026-11-24T03:00:00.000Z');

describe('운영 CLI', () => {
  let app: FastifyInstance;
  let out: string[];
  let err: string[];

  const cli = (...args: string[]) =>
    runCli(args, { db: app.db, now: () => NOW, out: (line) => out.push(line), err: (line) => err.push(line) });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    out = [];
    err = [];
  });

  it('settings set·get', async () => {
    expect(await cli('settings', 'set', 'chat_write_enabled', 'false')).toBe(0);
    expect((await readSettings(app.db)).chat_write_enabled).toBe(false);
    out = [];
    expect(await cli('settings', 'get')).toBe(0);
    expect(out.join('\n')).toContain('chat_write_enabled\tfalse');
    expect(out.join('\n')).toContain('account_create_enabled\ttrue');
    out = [];
    expect(await cli('settings', 'get', 'chat_write_enabled')).toBe(0);
    expect(out).toEqual(['chat_write_enabled\tfalse']);
  });

  it('잘못된 명령·값은 사용법을 보이고 0이 아닌 코드로 끝난다', async () => {
    expect(await cli('settings', 'set', 'nope', 'true')).not.toBe(0);
    expect(await cli('settings', 'set', 'chat_write_enabled', 'yes')).not.toBe(0);
    expect(await cli('whatever')).not.toBe(0);
    expect(await cli('restrict', 'user', 'not-a-uuid', 'chat', '--hours', '1', '--reason', 'x')).not.toBe(0);
    expect(await cli('restrict', 'ip', '999.1.1.1', 'chat', '--hours', '1', '--reason', 'x')).not.toBe(0);
    expect(err.join('\n')).toMatch(/사용법|usage/i);
  });

  it('restrict user·unrestrict user', async () => {
    const me = await startAnonymous(app);
    expect(await cli('restrict', 'user', me.userId, 'chat', '--days', '7', '--reason', '욕설 반복')).toBe(0);
    const found = await activeUserRestriction(app.db, me.userId, 'chat', NOW);
    expect(found?.until.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(found?.reason).toBe('욕설 반복');
    expect(await cli('restrict', 'user', me.userId, 'chat', '--hours', '1')).not.toBe(0); // 사유 필수
    expect(await cli('restrict', 'user', randomUUID(), 'chat', '--hours', '1', '--reason', 'x')).not.toBe(0); // 없는 사용자
    expect(await cli('unrestrict', 'user', me.userId, 'chat')).toBe(0);
    expect(await activeUserRestriction(app.db, me.userId, 'chat', NOW)).toBeNull();
  });

  it('restrict ip(--until)·unrestrict ip·restrictions list', async () => {
    expect(
      await cli('restrict', 'ip', '203.0.113.7', 'account_create', '--until', '2026-11-25T00:00:00Z', '--reason', '계정 대량 생성'),
    ).toBe(0);
    expect(await activeIpRestriction(app.db, '203.0.113.7', 'account_create', NOW)).not.toBeNull();
    out = [];
    expect(await cli('restrictions', 'list')).toBe(0);
    expect(out.join('\n')).toContain('203.0.113.7');
    expect(await cli('unrestrict', 'ip', '203.0.113.7', 'account_create')).toBe(0);
    expect(await activeIpRestriction(app.db, '203.0.113.7', 'account_create', NOW)).toBeNull();
  });

  it('reports list는 최근 신고를 보여 준다', async () => {
    const target = await startAnonymous(app);
    const reporter = await startAnonymous(app);
    const res = await app.inject({
      method: 'POST',
      url: '/reports',
      headers: withKey(reporter),
      payload: JSON.stringify({ target_type: 'nickname', target_id: target.userId, reason: 'profanity' }),
    });
    expect(res.statusCode).toBe(200);
    expect(await cli('reports', 'list')).toBe(0);
    const lines = out.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ target_type: 'nickname', target_id: target.userId, reason: 'profanity', handled_at: null });
    out = [];
    expect(await cli('reports', 'list', '--handled')).toBe(0);
    expect(out).toEqual([]);
  });
});
