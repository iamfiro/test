import type { FastifyInstance } from 'fastify';
import { errors } from '../http/errors.js';
import { WindowLimiter } from '../http/window-limit.js';
import { containsBannedWord } from '../moderation/banned-words.js';
import { fileSuggestion, listCatalog, MY_TAGS_MAX, replaceUserTags, searchCatalog, tagKey, TAG_NAME_MAX, userTagsOf } from './catalog.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL = /\p{Cc}/u;
/** 태그 제안: 사용자당 시간당 10회(계약 suggestTag). */
const SUGGESTIONS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

function objectBody(body: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw errors.validation('보낼 내용이 없어요');
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) throw errors.validation('알 수 없는 항목이에요', unknown);
  return input;
}

/** 태그 id 목록(카탈로그 존재 여부는 쓰는 쪽이 확인). 형식이 틀리면 422 `field`. */
export function parseTagIds(value: unknown, max: number, field = 'tag_ids'): string[] {
  if (!Array.isArray(value)) throw errors.validation('태그 목록이 올바르지 않아요', field);
  if (value.length > max) throw errors.validation(`태그는 ${max}개까지 고를 수 있어요`, field);
  if (!value.every((id): id is string => typeof id === 'string' && UUID.test(id))) {
    throw errors.validation('없는 태그예요', field);
  }
  const ids = value.map((id) => id.toLowerCase());
  if (new Set(ids).size !== ids.length) throw errors.validation('같은 태그를 두 번 골랐어요', field);
  return ids;
}

export function registerTagRoutes(app: FastifyInstance): void {
  const suggestions = new WindowLimiter(SUGGESTIONS_PER_HOUR, HOUR_MS, app.now);

  app.get('/tags', async (request, reply) => {
    const { q } = request.query as { q?: unknown };
    if (q === undefined) return reply.ok({ tags: await listCatalog(app.db) });
    if (typeof q !== 'string' || [...q].length < 1 || [...q].length > TAG_NAME_MAX) {
      throw errors.validation(`검색어는 1–${TAG_NAME_MAX}자예요`, 'q');
    }
    const key = tagKey(q);
    return reply.ok({ tags: key === '' ? [] : await searchCatalog(app.db, key) });
  });

  app.get('/users/me/tags', async (request, reply) => reply.ok({ tags: await userTagsOf(app.db, request.auth!.user.id) }));

  app.put('/users/me/tags', { config: { idempotent: true } }, async (request, reply) => {
    const input = objectBody(request.body, ['tag_ids']);
    const ids = parseTagIds(input.tag_ids, MY_TAGS_MAX);
    const saved = await replaceUserTags(app.db, request.auth!.user.id, ids);
    if (saved === null) throw errors.validation('없는 태그예요', 'tag_ids');
    return reply.ok({ tags: saved });
  });

  app.post('/tag-suggestions', { config: { idempotent: true } }, async (request, reply) => {
    const input = objectBody(request.body, ['name']);
    if (typeof input.name !== 'string') throw errors.validation('태그 이름이 올바르지 않아요', 'name');
    const name = input.name.trim();
    const length = [...name].length;
    if (length < 1 || length > TAG_NAME_MAX || CONTROL.test(name) || tagKey(name) === '') {
      throw errors.validation(`태그 이름은 1–${TAG_NAME_MAX}자예요`, 'name');
    }
    if (containsBannedWord(name)) throw errors.validation('이 이름은 제안할 수 없어요', 'name');
    const userId = request.auth!.user.id;
    const allowed = suggestions.take(userId);
    if (!allowed.ok) throw errors.rateLimited(allowed.retryAfterSeconds);
    await fileSuggestion(app.db, userId, name);
    request.log.info(`tag suggested user: ${userId.slice(0, 4)}`);
    return reply.ok({ name }, 201);
  });
}
