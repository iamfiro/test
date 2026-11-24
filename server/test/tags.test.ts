import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedTags } from '../src/tags/catalog.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

interface Tag {
  id: string;
  kind: 'exam' | 'kind';
  name: string;
}

async function count(app: FastifyInstance, table: string): Promise<number> {
  const result = await app.db.execute(sql.raw(`select count(*)::int as n from "${table}"`));
  return Number((result.rows[0] as { n: number }).n);
}

describe('태그', () => {
  let app: FastifyInstance;
  let me: TestSession;
  let catalog: Tag[];

  const byName = (name: string) => {
    const tag = catalog.find((t) => t.name === name);
    if (!tag) throw new Error(`no tag ${name}`);
    return tag;
  };
  const getTags = (q?: string) =>
    app.inject({ method: 'GET', url: q === undefined ? '/tags' : `/tags?q=${encodeURIComponent(q)}`, headers: authHeaders(me) });
  const putMyTags = (tagIds: unknown, headers: Record<string, string> = withKey(me)) =>
    app.inject({ method: 'PUT', url: '/users/me/tags', headers, payload: JSON.stringify({ tag_ids: tagIds }) });
  const suggest = (name: unknown, who = me) =>
    app.inject({ method: 'POST', url: '/tag-suggestions', headers: withKey(who), payload: JSON.stringify({ name }) });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    await seedTags(app.db);
    me = await startAnonymous(app);
    const res = await getTags();
    catalog = res.json().data.tags;
  });

  describe('GET /tags', () => {
    it('q가 없으면 카탈로그 전체를 exam 먼저, 그다음 이름 순으로 준다', async () => {
      const res = await getTags();
      expect(res.statusCode).toBe(200);
      expectContract('/tags', 'get', 200, res.json());
      const tags: Tag[] = res.json().data.tags;
      expect(tags).toHaveLength(27);
      const kinds = tags.map((t) => t.kind);
      expect(kinds.indexOf('kind')).toBe(20);
      expect(kinds.slice(20).every((k) => k === 'kind')).toBe(true);
      const exams = tags.slice(0, 20).map((t) => t.name);
      expect(exams).toEqual([...exams].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    });

    it('별칭으로 찾아도 정규 태그 하나로 나온다', async () => {
      const res = await getTags('정처기');
      expectContract('/tags', 'get', 200, res.json());
      expect(res.json().data.tags.map((t: Tag) => t.name)).toEqual(['정보처리기사']);
    });

    it('앞뒤 공백·#·대소문자를 무시한다', async () => {
      const res = await getTags('  #toeic ');
      expect(res.json().data.tags.map((t: Tag) => t.name)).toEqual(['토익']);
    });

    it('정규 이름과 별칭이 함께 맞아도 한 번만 나온다', async () => {
      const res = await getTags('공무원');
      const names = res.json().data.tags.map((t: Tag) => t.name);
      expect(names).toEqual(['경찰공무원', '공무원 7급', '공무원 9급', '소방공무원', '공무원']);
    });

    it('맞는 것이 없으면 빈 목록, #만 보내도 빈 목록', async () => {
      expect((await getTags('없는태그')).json().data.tags).toEqual([]);
      expect((await getTags('#')).json().data.tags).toEqual([]);
    });

    it('q가 20자를 넘으면 422', async () => {
      const res = await getTags('가'.repeat(21));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.details.field).toBe('q');
    });

    it('세션이 없으면 401', async () => {
      const res = await app.inject({ method: 'GET', url: '/tags' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('내 태그', () => {
    it('처음엔 비어 있고, 바꾸면 카탈로그 순서로 돌려준다', async () => {
      const empty = await app.inject({ method: 'GET', url: '/users/me/tags', headers: authHeaders(me) });
      expectContract('/users/me/tags', 'get', 200, empty.json());
      expect(empty.json().data.tags).toEqual([]);

      const picked = [byName('코딩'), byName('토익'), byName('수능')];
      const res = await putMyTags(picked.map((t) => t.id));
      expect(res.statusCode).toBe(200);
      expectContract('/users/me/tags', 'put', 200, res.json());
      expect(res.json().data.tags.map((t: Tag) => t.name)).toEqual(['수능', '토익', '코딩']);

      const after = await app.inject({ method: 'GET', url: '/users/me/tags', headers: authHeaders(me) });
      expect(after.json().data.tags).toEqual(res.json().data.tags);
    });

    it('통째로 바꾼다(이전 태그는 빠진다)', async () => {
      await putMyTags([byName('수능').id, byName('내신').id]);
      const res = await putMyTags([byName('독서').id]);
      expect(res.json().data.tags.map((t: Tag) => t.name)).toEqual(['독서']);
      expect(await count(app, 'user_tags')).toBe(1);
    });

    it('6개는 거절하고 아무것도 바꾸지 않는다', async () => {
      await putMyTags([byName('수능').id]);
      const res = await putMyTags(catalog.slice(0, 6).map((t) => t.id));
      expect(res.statusCode).toBe(422);
      expect(res.json().error.details.field).toBe('tag_ids');
      const after = await app.inject({ method: 'GET', url: '/users/me/tags', headers: authHeaders(me) });
      expect(after.json().data.tags.map((t: Tag) => t.name)).toEqual(['수능']);
    });

    it('없는 tag_id·중복·문자열이 아닌 값은 422', async () => {
      for (const ids of [[randomUUID()], ['not-a-uuid'], [byName('수능').id, byName('수능').id], [1], 'x']) {
        const res = await putMyTags(ids);
        expect(res.statusCode, JSON.stringify(ids)).toBe(422);
      }
    });

    it('같은 키 재전송은 처음 응답을 주고, 키가 없으면 400', async () => {
      const headers = withKey(me);
      const first = await putMyTags([byName('수능').id], headers);
      const again = await putMyTags([byName('수능').id], headers);
      expect(again.statusCode).toBe(200);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expect(again.json().data).toEqual(first.json().data);

      const { 'idempotency-key': _omit, ...noKey } = withKey(me);
      const missing = await putMyTags([byName('토익').id], noKey);
      expect(missing.statusCode).toBe(400);
      expect(missing.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('공개 프로필과 세션의 profile.tags에 실린다', async () => {
      await putMyTags([byName('코딩').id, byName('토익').id]);
      const profile = await app.inject({ method: 'GET', url: '/users/me/profile', headers: authHeaders(me) });
      expectContract('/users/me/profile', 'get', 200, profile.json());
      expect(profile.json().data.profile.tags.map((t: Tag) => t.name)).toEqual(['토익', '코딩']);
      const session = await app.inject({ method: 'GET', url: '/auth/session', headers: authHeaders(me) });
      expectContract('/auth/session', 'get', 200, session.json());
      expect(session.json().data.user.profile.tags.map((t: Tag) => t.name)).toEqual(['토익', '코딩']);
    });
  });

  describe('POST /tag-suggestions', () => {
    it('앞뒤 공백을 지워 저장하고 201로 답한다', async () => {
      const res = await suggest('  정보보안기사 ');
      expect(res.statusCode).toBe(201);
      expectContract('/tag-suggestions', 'post', 201, res.json());
      expect(res.json().data.name).toBe('정보보안기사');
      expect(await count(app, 'tag_suggestions')).toBe(1);
    });

    it('같은 사람이 같은 이름을 다시 보내면 한 건이다', async () => {
      await suggest('정보보안기사');
      await suggest('#정보보안기사');
      expect(await count(app, 'tag_suggestions')).toBe(1);
      const other = await startAnonymous(app, { remoteAddress: '198.51.100.9' });
      await suggest('정보보안기사', other);
      expect(await count(app, 'tag_suggestions')).toBe(2);
    });

    it('비었거나 20자를 넘거나 금칙어면 422', async () => {
      for (const name of ['   ', '가'.repeat(21), 42, '씨발']) {
        const res = await suggest(name);
        expect(res.statusCode, String(name)).toBe(422);
        expect(res.json().error.details.field).toBe('name');
      }
      expect(await count(app, 'tag_suggestions')).toBe(0);
    });

    it('사용자당 시간당 10회를 넘으면 429', async () => {
      for (let i = 0; i < 10; i += 1) expect((await suggest(`제안${i}`)).statusCode).toBe(201);
      const res = await suggest('하나더');
      expect(res.statusCode).toBe(429);
      expectContract('/tag-suggestions', 'post', 429, res.json());
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  it('계정을 지우면 내 태그·제안도 지운다', async () => {
    await putMyTags([byName('수능').id]);
    await suggest('정보보안기사');
    const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(me) });
    expect(res.statusCode).toBe(204);
    expect(await count(app, 'user_tags')).toBe(0);
    expect(await count(app, 'tag_suggestions')).toBe(0);
    expect(await count(app, 'tags')).toBe(27);
  });
});
