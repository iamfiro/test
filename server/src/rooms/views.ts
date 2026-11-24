import { and, asc, desc, eq, ilike, inArray, sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { roomTags, studyRoomMembers, studyRooms, tags, users } from '../db/schema.js';
import { PRESENCE_MAX_GAP_MS } from '../study/timer.js';
import { sortCatalog, userTagsMany, type TagView } from '../tags/catalog.js';
import { decryptRoomPassword } from './password.js';

export const ROOM_LIST_LIMIT = 100;

export interface ViewContext {
  db: DbExecutor;
  /** 보는 사람(없으면 비로그인: 초대 미리보기). */
  viewerId: string | null;
  now: Date;
  passwordKey: Buffer;
}

/**
 * 방 한 줄의 공통 열. `studying_count`는 "서버가 presence로 본 지금 공부 중"(계약)이다: 진행 중 세션의 마지막 구간이
 * 열려 있고(일시정지 아님) 그 세션의 관측 구간이 끊김 기준(75초, 타이머와 같은 값) 안에 이어진 멤버 수.
 */
function roomColumns(ctx: ViewContext) {
  const cutoff = new Date(ctx.now.getTime() - PRESENCE_MAX_GAP_MS).toISOString();
  const viewer = ctx.viewerId;
  return {
    id: studyRooms.id,
    hostUserId: studyRooms.hostUserId,
    name: studyRooms.name,
    description: studyRooms.description,
    map: studyRooms.map,
    capacity: studyRooms.capacity,
    passwordCiphertext: studyRooms.passwordCiphertext,
    createdAt: studyRooms.createdAt,
    hostNickname: users.nickname,
    memberCount: sql<number>`(select count(*)::int from study_room_members m where m.room_id = ${studyRooms.id})`.mapWith(Number),
    studyingCount: sql<number>`(
      select count(*)::int from study_room_members m
      join study_sessions s on s.user_id = m.user_id and s.status = 'active' and (s.segments -> -1 ->> 'ended_at') is null
      where m.room_id = ${studyRooms.id}
        and exists (select 1 from presence_spans p where p.session_id = s.id and p.ended_at >= ${cutoff}::timestamptz)
    )`.mapWith(Number),
    isMember:
      viewer === null
        ? sql<boolean>`false`
        : sql<boolean>`exists (select 1 from study_room_members m where m.room_id = ${studyRooms.id} and m.user_id = ${viewer})`,
  };
}

type RoomRow = Awaited<ReturnType<typeof selectRooms>>[number];

function selectRooms(ctx: ViewContext, where: SQL | undefined, order: SQL[], limit: number) {
  return ctx.db
    .select(roomColumns(ctx))
    .from(studyRooms)
    .innerJoin(users, eq(users.id, studyRooms.hostUserId))
    .where(where)
    .orderBy(...order)
    .limit(limit);
}

export async function roomTagsMany(db: DbExecutor, roomIds: string[]): Promise<Map<string, TagView[]>> {
  const result = new Map<string, TagView[]>(roomIds.map((id) => [id, []]));
  if (roomIds.length === 0) return result;
  const rows = await db
    .select({ roomId: roomTags.roomId, id: tags.id, kind: tags.kind, name: tags.name })
    .from(roomTags)
    .innerJoin(tags, eq(tags.id, roomTags.tagId))
    .where(inArray(roomTags.roomId, roomIds));
  for (const { roomId, ...tag } of rows) result.get(roomId)!.push(tag);
  for (const [id, list] of result) result.set(id, sortCatalog(list));
  return result;
}

function serializeRoom(row: RoomRow, roomTagList: TagView[], viewerId: string | null) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    has_password: row.passwordCiphertext !== null,
    capacity: row.capacity,
    map: row.map,
    member_count: row.memberCount,
    studying_count: row.studyingCount,
    is_member: Boolean(row.isMember),
    is_host: row.hostUserId === viewerId,
    host_nickname: row.hostNickname,
    created_at: row.createdAt.toISOString(),
    banner: null,
    logo: null,
    tags: roomTagList,
  };
}

export type RoomView = ReturnType<typeof serializeRoom>;

async function serializeRows(ctx: ViewContext, rows: RoomRow[]): Promise<RoomView[]> {
  const tagMap = await roomTagsMany(ctx.db, rows.map((r) => r.id));
  return rows.map((row) => serializeRoom(row, tagMap.get(row.id)!, ctx.viewerId));
}

export type RoomScope = 'mine' | 'all' | 'recommended';
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** 목록(최신 100개). `recommended`는 내 태그와 겹친 수 → 공부 중 수 → 최신 순(study-tags.md 결정 8). */
export async function listRooms(ctx: ViewContext & { viewerId: string }, scope: RoomScope, q: string | null): Promise<RoomView[]> {
  const conditions: SQL[] = [];
  if (q !== null) conditions.push(ilike(studyRooms.name, `%${likeEscape(q)}%`));
  const newest = desc(studyRooms.createdAt);
  if (scope === 'mine') {
    conditions.push(sql`exists (select 1 from study_room_members m where m.room_id = ${studyRooms.id} and m.user_id = ${ctx.viewerId})`);
  }
  if (scope !== 'recommended') return serializeRows(ctx, await selectRooms(ctx, and(...conditions), [newest], ROOM_LIST_LIMIT));

  const overlap = sql`(select count(*) from room_tags rt join user_tags ut on ut.tag_id = rt.tag_id and ut.user_id = ${ctx.viewerId} where rt.room_id = ${studyRooms.id})`;
  conditions.push(sql`${overlap} > 0`);
  const studying = roomColumns(ctx).studyingCount;
  const rows = await selectRooms(ctx, and(...conditions), [sql`${overlap} desc`, sql`${studying} desc`, newest], ROOM_LIST_LIMIT);
  return serializeRows(ctx, rows);
}

export async function roomView(ctx: ViewContext, roomId: string): Promise<{ room: RoomView; row: RoomRow } | null> {
  const [row] = await selectRooms(ctx, eq(studyRooms.id, roomId), [desc(studyRooms.createdAt)], 1);
  if (!row) return null;
  const [room] = await serializeRows(ctx, [row]);
  return { room: room!, row };
}

/**
 * 상세(계약 `RoomDetail`): 멤버면 전체 명단(방장 먼저, 들어온 순)과 각자의 공개 태그, 방장이면 비밀번호.
 * 없는 방이면 null.
 */
export async function roomDetail(ctx: ViewContext, roomId: string) {
  const found = await roomView(ctx, roomId);
  if (!found) return null;
  const { room, row } = found;
  let members: unknown[] | null = null;
  if (room.is_member) {
    const rows = await ctx.db
      .select({ userId: studyRoomMembers.userId, nickname: users.nickname, avatar: users.avatar })
      .from(studyRoomMembers)
      .innerJoin(users, eq(users.id, studyRoomMembers.userId))
      .where(eq(studyRoomMembers.roomId, roomId))
      .orderBy(sql`${studyRoomMembers.userId} = ${row.hostUserId} desc`, asc(studyRoomMembers.joinedAt), asc(studyRoomMembers.userId));
    const tagMap = await userTagsMany(ctx.db, rows.map((r) => r.userId));
    members = rows.map((m) => ({
      user_id: m.userId,
      nickname: m.nickname,
      avatar: m.avatar,
      is_host: m.userId === row.hostUserId,
      tags: tagMap.get(m.userId)!,
    }));
  }
  const password = room.is_host && row.passwordCiphertext !== null ? decryptRoomPassword(ctx.passwordKey, row.passwordCiphertext) : null;
  return { room, members, password };
}

export type RoomDetail = NonNullable<Awaited<ReturnType<typeof roomDetail>>>;

/** 초대 링크 미리보기(계약 `InvitePreview`). */
export async function invitePreview(ctx: ViewContext, roomId: string) {
  const found = await roomView(ctx, roomId);
  if (!found) return null;
  const { room } = found;
  return {
    room_id: room.id,
    name: room.name,
    map: room.map,
    member_count: room.member_count,
    capacity: room.capacity,
    has_password: room.has_password,
    is_member: room.is_member,
  };
}
