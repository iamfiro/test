import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runCli } from '../src/ops/commands.js';
import { LeagueService } from '../src/league/service.js';
import { readSettings } from '../src/moderation/settings.js';
import { activeIpRestriction, activeUserRestriction } from '../src/moderation/restrictions.js';
import { listCatalog, userTagsOf } from '../src/tags/catalog.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { authHeaders, startAnonymous, withKey } from './helpers/session.js';
import { seedRanked } from './helpers/study.js';

const NOW = new Date('2026-11-24T03:00:00.000Z');

describe('운영 CLI', () => {
  let app: FastifyInstance;
  let out: string[];
  let err: string[];

  const cli = (...args: string[]) =>
    runCli(args, {
      db: app.db,
      now: () => clock,
      league: new LeagueService(app.db, () => clock, app.config.league, app.config.entryIdSecret),
      rooms: app.rooms,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
  let clock = NOW;

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
    clock = NOW;
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

  describe('태그·제안', () => {
    const names = async () => (await listCatalog(app.db)).map((t) => t.name);
    const putTags = async (who: { cookie: string; csrf: string }, tagNames: string[]) => {
      const catalog = await listCatalog(app.db);
      const ids = tagNames.map((name) => catalog.find((t) => t.name === name)!.id);
      const res = await app.inject({ method: 'PUT', url: '/users/me/tags', headers: withKey(who), payload: JSON.stringify({ tag_ids: ids }) });
      expect(res.statusCode).toBe(200);
    };
    const suggest = async (who: { cookie: string; csrf: string }, name: string) => {
      const res = await app.inject({ method: 'POST', url: '/tag-suggestions', headers: withKey(who), payload: JSON.stringify({ name }) });
      expect(res.statusCode).toBe(201);
    };

    it('tags seed는 study-tags.md 2절 카탈로그를 넣고 다시 해도 늘지 않는다', async () => {
      expect(await cli('tags', 'seed')).toBe(0);
      expect(await names()).toHaveLength(27);
      expect(await cli('tags', 'seed')).toBe(0);
      expect(await names()).toHaveLength(27);
      out = [];
      expect(await cli('tags', 'list')).toBe(0);
      const info = out.map((line) => JSON.parse(line) as { name: string; aliases: string[] });
      expect(info.find((t) => t.name === '정보처리기사')?.aliases).toEqual(['정처기']);
    });

    it('tags add·alias: 이미 있는 이름·별칭과 겹치면 실패한다', async () => {
      await cli('tags', 'seed');
      expect(await cli('tags', 'add', 'exam', '정보보안기사')).toBe(0);
      expect(await names()).toContain('정보보안기사');
      expect(await cli('tags', 'add', 'exam', '#정처기')).toBe(1); // 별칭과 겹침
      expect(await cli('tags', 'add', 'subject', '수학')).toBe(2); // 종류가 틀림
      expect(await cli('tags', 'alias', '정보보안기사', '정보보안')).toBe(0);
      const res = await app.inject({ method: 'GET', url: '/tags?q=%EC%A0%95%EB%B3%B4%EB%B3%B4%EC%95%88', headers: withKey(await startAnonymous(app)) });
      expect(res.json().data.tags.map((t: { name: string }) => t.name)).toEqual(['정보보안기사']);
      expect(await cli('tags', 'alias', '정보보안기사', '토익')).toBe(1); // 정규 이름과 겹침
      expect(await cli('tags', 'alias', '없는태그', '별칭')).toBe(1);
    });

    it('tags merge는 사용자 태그를 옮기고 없앤 이름을 별칭으로 남긴다', async () => {
      await cli('tags', 'seed');
      await cli('tags', 'add', 'kind', '코딩 공부');
      const a = await startAnonymous(app);
      const b = await startAnonymous(app);
      await putTags(a, ['코딩 공부']);
      await putTags(b, ['코딩 공부', '코딩']);
      expect(await cli('tags', 'merge', '코딩 공부', '코딩')).toBe(0);
      expect(await names()).not.toContain('코딩 공부');
      expect((await userTagsOf(app.db, a.userId)).map((t) => t.name)).toEqual(['코딩']);
      expect((await userTagsOf(app.db, b.userId)).map((t) => t.name)).toEqual(['코딩']);
      const res = await app.inject({ method: 'GET', url: `/tags?q=${encodeURIComponent('코딩 공부')}`, headers: withKey(a) });
      expect(res.json().data.tags.map((t: { name: string }) => t.name)).toEqual(['코딩']);
    });

    it('suggestions list·accept·alias·reject', async () => {
      await cli('tags', 'seed');
      const a = await startAnonymous(app);
      const b = await startAnonymous(app);
      await suggest(a, '정보보안기사');
      await suggest(b, '#정보보안기사');
      await suggest(a, '쌍기사');
      await suggest(b, '아무거나');
      out = [];
      expect(await cli('suggestions', 'list', '--pending')).toBe(0);
      const pending = out.map((line) => JSON.parse(line) as { id: string; name: string; status: string });
      expect(pending).toHaveLength(4);
      const idOf = (name: string) => pending.find((p) => p.name === name)!.id;

      expect(await cli('suggestions', 'accept', idOf('정보보안기사'), 'exam')).toBe(0);
      expect(await names()).toContain('정보보안기사');
      expect(await cli('suggestions', 'alias', idOf('쌍기사'), '정보처리기사')).toBe(0);
      expect(await cli('suggestions', 'reject', idOf('아무거나'))).toBe(0);
      expect(await cli('suggestions', 'reject', randomUUID())).toBe(1);

      out = [];
      expect(await cli('suggestions', 'list', '--pending')).toBe(0);
      expect(out).toEqual([]); // 같은 이름의 다른 사람 제안도 함께 처리됨
      out = [];
      expect(await cli('suggestions', 'list')).toBe(0);
      const all = out.map((line) => JSON.parse(line) as { name: string; status: string; resolution: string | null });
      expect(all.filter((s) => s.status === 'accepted')).toHaveLength(3);
      expect(all.find((s) => s.name === '쌍기사')?.resolution).toBe('alias:정보처리기사');
    });
  });

  describe('리그·지표·사용자', () => {
    // 리그 주 2026-03-02(월) 04:00 KST ~ 03-09 04:00 KST.
    const W1 = '2026-03-01T19:00:00.000Z';

    async function studyDays(userId: string, dates: string[], minutes: number) {
      for (const date of dates) {
        const from = `${date}T10:00:00+09:00`;
        const to = new Date(Date.parse(from) + minutes * 60_000).toISOString();
        await seedRanked(app, userId, from, to);
        await app.league.syncUser(userId, Date.parse(from), Date.parse(to));
      }
    }

    it('league settle: 마감 + 지연이 지난 주만 정산하고 다시 돌리면 할 일이 없다. league weeks로 상태를 본다', async () => {
      const me = await startAnonymous(app);
      await studyDays(me.userId, ['2026-03-03'], 60 * 8);
      clock = new Date('2026-03-09T04:05:00+09:00');
      expect(await cli('league', 'settle')).toBe(0);
      expect(out).toEqual(['nothing due']);
      clock = new Date('2026-03-09T04:11:00+09:00');
      out = [];
      expect(await cli('league', 'settle')).toBe(0);
      expect(out).toEqual([`settled week_start: ${W1}`]);
      out = [];
      expect(await cli('league', 'settle')).toBe(0);
      expect(out).toEqual(['nothing due']);
      out = [];
      expect(await cli('league', 'weeks')).toBe(0);
      const settled = out.map((line) => JSON.parse(line)).find((w) => w.week_start === W1);
      expect(settled).toMatchObject({ status: 'settled', leagues: [{ league: 'general', groups: 1, members: 1 }] });
      expect(await cli('league', 'nope')).toBe(2);
    });

    it('metrics week: 주 3일 이상 비율, 스트릭 7일 도달, 리그 인원', async () => {
      const [a, b] = [await startAnonymous(app), await startAnonymous(app, { remoteAddress: '10.9.9.9' })];
      // a: 2/24–3/4 매일 15분(3월 2일 주에 스트릭 7일 도달, 3일 이상). b: 3/3 하루 5분(10분 미만).
      const days = Array.from({ length: 9 }, (_, i) => new Date(Date.UTC(2026, 1, 24 + i)).toISOString().slice(0, 10));
      await studyDays(a.userId, days, 15);
      await studyDays(b.userId, ['2026-03-03'], 5);
      clock = new Date('2026-03-10T12:00:00+09:00');
      expect(await cli('metrics', 'week')).toBe(0); // 기본: 지난 주(3월 2일 주)
      expect(JSON.parse(out[0]!)).toEqual({
        week: '2026-03-02',
        league_week_start: W1,
        active_users: 2,
        studied_3_days: 1,
        studied_3_days_ratio: 0.5,
        streak_7: 1,
        streak_7_ratio: 0.5,
        streak_30: 0,
        streak_30_ratio: 0,
        league_participants: { general: 2, top: 0 },
        league_groups: { general: 1, top: 0 },
        league_memberships_now: { general: 2, top: 0 },
      });
      out = [];
      expect(await cli('metrics', 'week', '--week', '2026-02-25')).toBe(0);
      expect(JSON.parse(out[0]!)).toMatchObject({ week: '2026-02-23', active_users: 1, studied_3_days: 1, streak_7: 0 });
      expect(await cli('metrics', 'week', '--week', '3월')).toBe(2);
    });

    it('users find·show: id 앞부분·닉네임으로 찾고 요약을 본다(이메일 없음)', async () => {
      const me = await startAnonymous(app);
      const nickname = me.res.json().data.user.profile.nickname as string;
      expect(await cli('users', 'find', me.userId.slice(0, 6))).toBe(0);
      expect(out.map((line) => JSON.parse(line).id)).toContain(me.userId);
      out = [];
      expect(await cli('users', 'find', '--nickname', nickname)).toBe(0);
      expect(JSON.parse(out[0]!)).toMatchObject({ id: me.userId, nickname });
      out = [];
      expect(await cli('restrict', 'user', me.userId, 'chat', '--days', '1', '--reason', '도배')).toBe(0);
      out = [];
      expect(await cli('users', 'show', me.userId)).toBe(0);
      expect(JSON.parse(out[0]!)).toMatchObject({
        id: me.userId,
        email: null,
        room: null,
        league: 'general',
        streak_current: 0,
        restrictions: [{ kind: 'chat', reason: '도배' }],
        reports_received: { total: 0, pending: 0 },
      });
      expect(await cli('users', 'find', 'ab')).toBe(2);
      expect(await cli('users', 'show', randomUUID())).toBe(1);
    });

    it('users delete: --yes가 있어야 하고, 지우면 그 사람 세션이 끊기고 데이터가 남지 않는다', async () => {
      const me = await startAnonymous(app);
      await studyDays(me.userId, ['2026-03-03'], 30);
      expect(await cli('users', 'delete', me.userId)).toBe(2);
      expect((await app.inject({ method: 'GET', url: '/users/me/profile', headers: authHeaders(me) })).statusCode).toBe(200);
      expect(await cli('users', 'delete', me.userId, '--yes')).toBe(0);
      expect(out).toEqual([`deleted user ${me.userId}`]);
      expect((await app.inject({ method: 'GET', url: '/users/me/profile', headers: authHeaders(me) })).statusCode).toBe(401);
      out = [];
      expect(await cli('users', 'find', me.userId.slice(0, 8))).toBe(0);
      expect(out).toEqual(['no users']);
      expect(await cli('users', 'delete', me.userId, '--yes')).toBe(1);
    });
  });
});
