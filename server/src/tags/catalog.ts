import { and, desc, eq, exists, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db/client.js';
import { tagAliases, tags, tagSuggestions, userTags } from '../db/schema.js';
import { TAG_SEED } from './seed.js';

export type TagKind = 'exam' | 'kind';
export const TAG_KINDS: readonly TagKind[] = ['exam', 'kind'];
export const TAG_NAME_MAX = 20;
export const MY_TAGS_MAX = 5;

export interface TagView {
  id: string;
  kind: TagKind;
  name: string;
}

/** 계약 `listTags`의 비교 규칙: NFC → `#` 제거 → 앞뒤 공백 제거 → 소문자. */
export function tagKey(text: string): string {
  return text.normalize('NFC').replaceAll('#', '').trim().toLowerCase();
}

/** 카탈로그 순서: `exam` 먼저, 그다음 이름(코드 포인트) 순. 응답의 모든 태그 목록이 이 순서다. */
export function sortCatalog<T extends TagView>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'exam' ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

const tagColumns = { id: tags.id, kind: tags.kind, name: tags.name };
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listCatalog(db: DbExecutor): Promise<TagView[]> {
  return sortCatalog(await db.select(tagColumns).from(tags));
}

/** 정규 이름이나 별칭의 비교 키에 `key`가 들어간 태그(정규 태그로 한 번씩). */
export async function searchCatalog(db: DbExecutor, key: string): Promise<TagView[]> {
  const pattern = `%${likeEscape(key)}%`;
  const rows = await db
    .select(tagColumns)
    .from(tags)
    .where(
      or(
        ilike(tags.nameKey, pattern),
        exists(
          db
            .select({ one: sql`1` })
            .from(tagAliases)
            .where(and(eq(tagAliases.tagId, tags.id), ilike(tagAliases.aliasKey, pattern))),
        ),
      ),
    );
  return sortCatalog(rows);
}

export async function tagsByIds(db: DbExecutor, ids: string[]): Promise<TagView[]> {
  if (ids.length === 0) return [];
  return sortCatalog(await db.select(tagColumns).from(tags).where(inArray(tags.id, ids)));
}

/** 여러 사람의 공개 태그를 한 번에 읽는다(방 명단). */
export async function userTagsMany(db: DbExecutor, userIds: string[]): Promise<Map<string, TagView[]>> {
  const result = new Map<string, TagView[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return result;
  const rows = await db
    .select({ userId: userTags.userId, ...tagColumns })
    .from(userTags)
    .innerJoin(tags, eq(tags.id, userTags.tagId))
    .where(inArray(userTags.userId, userIds));
  for (const { userId, ...tag } of rows) result.get(userId)!.push(tag);
  for (const [id, list] of result) result.set(id, sortCatalog(list));
  return result;
}

export async function userTagsOf(db: DbExecutor, userId: string): Promise<TagView[]> {
  return (await userTagsMany(db, [userId])).get(userId)!;
}

/** 내 태그를 통째로 바꾼다. 없는 태그가 섞였으면 아무것도 바꾸지 않고 false. */
export async function replaceUserTags(db: Db, userId: string, tagIds: string[]): Promise<TagView[] | null> {
  return db.transaction(async (tx) => {
    const found = await tagsByIds(tx, tagIds);
    if (found.length !== tagIds.length) return null;
    await tx.delete(userTags).where(eq(userTags.userId, userId));
    if (tagIds.length > 0) await tx.insert(userTags).values(tagIds.map((tagId) => ({ userId, tagId })));
    return found;
  });
}

// ---- 운영(CLI) ----

/** 카탈로그를 바꾸는 운영 작업을 한 줄로 세운다(이름·별칭 겹침 검사가 경합에 깨지지 않게). */
async function lockCatalog(tx: DbExecutor): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tag-catalog'))`);
}

export class CatalogError extends Error {}

function validName(raw: string, what: string): { name: string; key: string } {
  const name = raw.normalize('NFC').replaceAll('#', '').trim();
  const length = [...name].length;
  if (length === 0 || length > TAG_NAME_MAX) throw new CatalogError(`${what}은 1–${TAG_NAME_MAX}자여야 한다: ${raw}`);
  return { name, key: tagKey(name) };
}

/** 비교 키가 정규 이름이나 별칭과 겹치면 그 설명. 없으면 null. */
async function keyTaken(tx: DbExecutor, key: string): Promise<string | null> {
  const [tag] = await tx.select({ name: tags.name }).from(tags).where(eq(tags.nameKey, key));
  if (tag) return `이미 있는 태그: ${tag.name}`;
  const [alias] = await tx
    .select({ alias: tagAliases.alias, name: tags.name })
    .from(tagAliases)
    .innerJoin(tags, eq(tags.id, tagAliases.tagId))
    .where(eq(tagAliases.aliasKey, key));
  return alias ? `이미 ${alias.name}의 별칭: ${alias.alias}` : null;
}

async function tagByName(tx: DbExecutor, raw: string): Promise<typeof tags.$inferSelect> {
  const [tag] = await tx.select().from(tags).where(eq(tags.nameKey, tagKey(raw)));
  if (!tag) throw new CatalogError(`없는 태그: ${raw}`);
  return tag;
}

async function insertTag(tx: DbExecutor, kind: TagKind, raw: string): Promise<TagView> {
  const { name, key } = validName(raw, '태그 이름');
  const taken = await keyTaken(tx, key);
  if (taken) throw new CatalogError(taken);
  const [row] = await tx.insert(tags).values({ kind, name, nameKey: key }).returning(tagColumns);
  return row!;
}

async function insertAlias(tx: DbExecutor, tagId: string, raw: string): Promise<void> {
  const { name, key } = validName(raw, '별칭');
  const taken = await keyTaken(tx, key);
  if (taken) throw new CatalogError(taken);
  await tx.insert(tagAliases).values({ aliasKey: key, alias: name, tagId });
}

/** 시드 카탈로그를 넣는다. 이미 있는 이름·별칭은 건너뛴다(다시 해도 늘지 않는다). */
export async function seedTags(db: Db): Promise<{ tags: number; aliases: number }> {
  return db.transaction(async (tx) => {
    await lockCatalog(tx);
    let addedTags = 0;
    let addedAliases = 0;
    for (const [kind, name, aliases] of TAG_SEED) {
      let [tag] = await tx.select({ id: tags.id }).from(tags).where(eq(tags.nameKey, tagKey(name)));
      if (!tag) {
        tag = await insertTag(tx, kind, name);
        addedTags += 1;
      }
      for (const alias of aliases) {
        if (await keyTaken(tx, tagKey(alias))) continue;
        await insertAlias(tx, tag.id, alias);
        addedAliases += 1;
      }
    }
    return { tags: addedTags, aliases: addedAliases };
  });
}

export async function addTag(db: Db, kind: TagKind, name: string): Promise<TagView> {
  return db.transaction(async (tx) => {
    await lockCatalog(tx);
    return insertTag(tx, kind, name);
  });
}

export async function addAlias(db: Db, tagName: string, alias: string): Promise<TagView> {
  return db.transaction(async (tx) => {
    await lockCatalog(tx);
    const tag = await tagByName(tx, tagName);
    await insertAlias(tx, tag.id, alias);
    return { id: tag.id, kind: tag.kind, name: tag.name };
  });
}

/**
 * 태그를 합친다: `from`을 단 사람·방은 `into`를 달게 되고(이미 있으면 하나로), `from`의 별칭은 `into`로 옮기며,
 * `from`의 이름은 `into`의 별칭으로 남는다. 방 태그는 `moveExtraRefs`가 옮긴다(방 테이블을 가진 모듈이 넘긴다).
 */
export async function mergeTags(
  db: Db,
  fromName: string,
  intoName: string,
  moveExtraRefs: (tx: DbExecutor, fromId: string, intoId: string) => Promise<void> = async () => {},
): Promise<{ from: string; into: string }> {
  return db.transaction(async (tx) => {
    await lockCatalog(tx);
    const from = await tagByName(tx, fromName);
    const into = await tagByName(tx, intoName);
    if (from.id === into.id) throw new CatalogError('같은 태그끼리는 합칠 수 없다');
    await tx.execute(sql`
      insert into user_tags (user_id, tag_id, created_at)
      select user_id, ${into.id}, created_at from user_tags where tag_id = ${from.id}
      on conflict do nothing`);
    await moveExtraRefs(tx, from.id, into.id);
    await tx.update(tagAliases).set({ tagId: into.id }).where(eq(tagAliases.tagId, from.id));
    await tx.delete(tags).where(eq(tags.id, from.id)); // 남은 user_tags(from)는 cascade
    await tx.insert(tagAliases).values({ aliasKey: from.nameKey, alias: from.name, tagId: into.id });
    return { from: from.name, into: into.name };
  });
}

export async function catalogWithAliases(db: Db): Promise<(TagView & { aliases: string[] })[]> {
  const list = await listCatalog(db);
  const aliases = await db.select().from(tagAliases);
  return list.map((tag) => ({
    ...tag,
    aliases: aliases
      .filter((a) => a.tagId === tag.id)
      .map((a) => a.alias)
      .sort(),
  }));
}

// ---- 제안 ----

export type SuggestionRow = typeof tagSuggestions.$inferSelect;

/** 제안을 저장한다. 같은 사람의 같은 이름(비교 키)은 한 건이다. */
export async function fileSuggestion(db: DbExecutor, userId: string, name: string): Promise<void> {
  await db.insert(tagSuggestions).values({ userId, name, nameKey: tagKey(name) }).onConflictDoNothing();
}

export async function listSuggestions(db: Db, options: { pending: boolean; limit: number }): Promise<SuggestionRow[]> {
  const where: SQL | undefined = options.pending ? eq(tagSuggestions.status, 'pending') : undefined;
  return db.select().from(tagSuggestions).where(where).orderBy(desc(tagSuggestions.createdAt)).limit(options.limit);
}

async function pendingSuggestion(tx: DbExecutor, id: string): Promise<SuggestionRow> {
  const [row] = await tx.select().from(tagSuggestions).where(eq(tagSuggestions.id, id));
  if (!row) throw new CatalogError(`없는 제안: ${id}`);
  if (row.status !== 'pending') throw new CatalogError(`이미 처리한 제안: ${id} (${row.status})`);
  return row;
}

/** 같은 이름(비교 키)의 대기 중 제안을 모두 같은 결과로 닫는다. */
async function closeSuggestions(tx: DbExecutor, key: string, status: 'accepted' | 'rejected', resolution: string | null) {
  await tx
    .update(tagSuggestions)
    .set({ status, resolution, reviewedAt: sql`now()` })
    .where(and(eq(tagSuggestions.nameKey, key), eq(tagSuggestions.status, 'pending')));
}

export async function acceptSuggestionAsTag(db: Db, id: string, kind: TagKind): Promise<TagView> {
  return db.transaction(async (tx) => {
    await lockCatalog(tx);
    const row = await pendingSuggestion(tx, id);
    const tag = await insertTag(tx, kind, row.name);
    await closeSuggestions(tx, row.nameKey, 'accepted', `tag:${tag.name}`);
    return tag;
  });
}

export async function acceptSuggestionAsAlias(db: Db, id: string, tagName: string): Promise<TagView> {
  return db.transaction(async (tx) => {
    await lockCatalog(tx);
    const row = await pendingSuggestion(tx, id);
    const tag = await tagByName(tx, tagName);
    await insertAlias(tx, tag.id, row.name);
    await closeSuggestions(tx, row.nameKey, 'accepted', `alias:${tag.name}`);
    return { id: tag.id, kind: tag.kind, name: tag.name };
  });
}

export async function rejectSuggestion(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await pendingSuggestion(tx, id);
    await closeSuggestions(tx, row.nameKey, 'rejected', null);
  });
}
