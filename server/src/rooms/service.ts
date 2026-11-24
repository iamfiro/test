import { createHash, randomBytes } from 'node:crypto';
import type { MediaStorage } from '../media/storage.js';
import { and, asc, count, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db/client.js';
import { roomCreations, roomTags, studyRoomInvites, studyRoomMembers, studyRooms } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { normalizeIp } from '../moderation/restrictions.js';
import { tagsByIds } from '../tags/catalog.js';
import { encryptRoomPassword, roomPasswordMatches } from './password.js';

/**
 * 방 상태를 바꾸는 곳은 이 파일 하나다(만들기·참여·나가기·내보내기·수정·삭제·계정 삭제). 모두 트랜잭션 안에서
 * 처리하고, 커밋이 끝난 뒤 `onChange` 구독자에게 알린다(L5 방 실시간 이벤트가 여기에 붙는다. 타이머의
 * `TimerService.onChange`와 같은 방식이고, 커밋 안 된 상태를 내보내지 않는다).
 *
 * 잠금 순서: 사용자 잠금(자기 멤버십을 바꾸는 요청) → 방 행 잠금(id 순). 방장의 내보내기·삭제는 방 행만 잠근다.
 * 사용자 잠금을 방 잠금 뒤에 잡는 곳이 없어서 서로 기다리다 멈추지 않는다.
 */

export type RoomChange =
  | { type: 'room_created'; roomId: string; userId: string }
  | { type: 'room_updated'; roomId: string }
  | { type: 'room_deleted'; roomId: string; memberIds: string[] }
  | { type: 'member_joined'; roomId: string; userId: string }
  | { type: 'member_moved'; roomId: string; userId: string }
  | { type: 'member_left'; roomId: string; userId: string; reason: 'left' | 'removed' | 'account_deleted' };

export const FREE_MAPS = new Set(['cafe']);
/**
 * 맵 자리 수(세 맵 모두 33석, 계약 RoomMap). 자리 번호는 0–32로 웹 `room3d/scenes.ts`의 `cafeSeats`(원본 GLB `seat_NN`)
 * 순서와 같다. 정원은 이 수를 넘지 않으므로 멤버는 늘 자기 자리가 있다.
 */
export const MAP_SEATS = 33;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IP_WINDOW_SECONDS = 24 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const hashInviteToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface RoomCreateInput {
  name: string;
  description: string | null;
  map: 'cafe' | 'library' | 'rooftop';
  capacity: number;
  password: string | null;
  tagIds: string[];
}

export type RoomPatch = Partial<RoomCreateInput>;

interface Pending {
  changes: RoomChange[];
  /** 커밋 뒤 지울 미디어 키(교체된 사진, 지운 방의 사진). */
  mediaKeys: string[];
}

export type ImageSlot = 'banner' | 'logo';
export const IMAGE_SLOTS: readonly ImageSlot[] = ['banner', 'logo'];

/** 방 사진의 미디어 키(launch.md L4a 접두사). */
export const imageKey = (roomId: string, slot: ImageSlot, imageId: string) => `rooms/${roomId}/${slot}/${imageId}`;

const slotColumn = (slot: ImageSlot) => (slot === 'banner' ? studyRooms.bannerId : studyRooms.logoId);

interface LockedRoom {
  id: string;
  hostUserId: string;
  capacity: number;
  map: string;
  passwordCiphertext: string | null;
}

async function lockUser(tx: DbExecutor, userId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`room-user:${userId}`}, 0))`);
}

/** 방 행을 id 순으로 잠근다. 없는 방은 결과에 없다. */
async function lockRooms(tx: DbExecutor, ids: string[]): Promise<Map<string, LockedRoom>> {
  const valid = [...new Set(ids)].filter((id) => UUID.test(id)).sort();
  if (valid.length === 0) return new Map();
  const rows = await tx
    .select({
      id: studyRooms.id,
      hostUserId: studyRooms.hostUserId,
      capacity: studyRooms.capacity,
      map: studyRooms.map,
      passwordCiphertext: studyRooms.passwordCiphertext,
    })
    .from(studyRooms)
    .where(inArray(studyRooms.id, valid))
    .orderBy(asc(studyRooms.id))
    .for('update');
  return new Map(rows.map((row) => [row.id, row]));
}

async function membershipOf(tx: DbExecutor, userId: string): Promise<{ roomId: string; isHost: boolean } | null> {
  const [row] = await tx
    .select({ roomId: studyRoomMembers.roomId, hostUserId: studyRooms.hostUserId })
    .from(studyRoomMembers)
    .innerJoin(studyRooms, eq(studyRooms.id, studyRoomMembers.roomId))
    .where(eq(studyRoomMembers.userId, userId));
  return row ? { roomId: row.roomId, isHost: row.hostUserId === userId } : null;
}

async function memberCount(tx: DbExecutor, roomId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(studyRoomMembers).where(eq(studyRoomMembers.roomId, roomId));
  return row!.n;
}

/** 비어 있는 가장 작은 자리 번호. 방 행이 잠겨 있어야 한다(같은 자리에 두 사람이 앉지 않게). */
async function freeSeat(tx: DbExecutor, roomId: string): Promise<number> {
  const rows = await tx.select({ seat: studyRoomMembers.seat }).from(studyRoomMembers).where(eq(studyRoomMembers.roomId, roomId));
  const taken = new Set(rows.map((row) => row.seat));
  for (let seat = 0; seat < MAP_SEATS; seat += 1) if (!taken.has(seat)) return seat;
  throw errors.roomFull();
}

async function setRoomTags(tx: DbExecutor, roomId: string, tagIds: string[]): Promise<void> {
  if ((await tagsByIds(tx, tagIds)).length !== tagIds.length) throw errors.validation('없는 태그예요', 'tag_ids');
  await tx.delete(roomTags).where(eq(roomTags.roomId, roomId));
  if (tagIds.length > 0) await tx.insert(roomTags).values(tagIds.map((tagId) => ({ roomId, tagId })));
}

/** `tags merge` CLI가 방 태그도 옮기게 넘기는 함수(이미 그 태그가 있는 방은 하나로). */
export async function moveRoomTagRefs(tx: DbExecutor, fromId: string, intoId: string): Promise<void> {
  await tx.execute(sql`
    insert into room_tags (room_id, tag_id)
    select room_id, ${intoId} from room_tags where tag_id = ${fromId}
    on conflict do nothing`);
}

export class RoomService {
  private readonly listeners = new Set<(change: RoomChange) => void>();

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
    private readonly media: MediaStorage,
    private readonly options: { passwordKey: Buffer; createPerIpPerDay: number },
    private readonly hooks: {
      onListenerError: (error: unknown) => void;
      onMediaDeleteError: (key: string, error: unknown) => void;
    },
  ) {}

  /** 커밋된 방 변경을 받는다. 반환 함수로 구독을 끊는다. */
  onChange(listener: (change: RoomChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 이 파일 밖의 트랜잭션이 커밋한 방 변경을 알린다(신고 기준 도달로 방 이름을 되돌린 경우). */
  notify(change: RoomChange): void {
    this.emit([change]);
  }

  private emit(changes: RoomChange[]): void {
    for (const change of changes) {
      for (const listener of this.listeners) {
        try {
          listener(change);
        } catch (error) {
          this.hooks.onListenerError(error);
        }
      }
    }
  }

  private async run<T>(work: (tx: DbExecutor, pending: Pending) => Promise<T>): Promise<T> {
    const pending: Pending = { changes: [], mediaKeys: [] };
    const result = await this.db.transaction((tx) => work(tx, pending));
    this.emit(pending.changes);
    await this.deleteMedia(pending.mediaKeys);
    return result;
  }

  /** 커밋 뒤 파일을 지운다. 실패해도 요청은 성공이다(DB는 이미 그 파일을 가리키지 않는다). 키를 로그에 남긴다. */
  private async deleteMedia(keys: string[]): Promise<void> {
    await Promise.all(
      keys.map((key) => this.media.delete(key).catch((error: unknown) => this.hooks.onMediaDeleteError(key, error))),
    );
  }

  private encrypt(password: string | null): string | null {
    return password === null ? null : encryptRoomPassword(this.options.passwordKey, password);
  }

  private async deleteRoomInTx(tx: DbExecutor, pending: Pending, roomId: string): Promise<void> {
    const members = await tx.select({ userId: studyRoomMembers.userId }).from(studyRoomMembers).where(eq(studyRoomMembers.roomId, roomId));
    const [images] = await tx
      .delete(studyRooms)
      .where(eq(studyRooms.id, roomId))
      .returning({ bannerId: studyRooms.bannerId, logoId: studyRooms.logoId }); // 멤버·태그·초대는 cascade
    if (images?.bannerId) pending.mediaKeys.push(imageKey(roomId, 'banner', images.bannerId));
    if (images?.logoId) pending.mediaKeys.push(imageKey(roomId, 'logo', images.logoId));
    pending.changes.push({ type: 'room_deleted', roomId, memberIds: members.map((m) => m.userId) });
  }

  /** 내가 속한 방에서 나간다(방장이면 방을 지운다). 방 행은 이미 잠겨 있어야 한다. */
  private async leaveInTx(tx: DbExecutor, pending: Pending, userId: string, membership: { roomId: string; isHost: boolean }) {
    if (membership.isHost) {
      await this.deleteRoomInTx(tx, pending, membership.roomId);
      return;
    }
    await tx.delete(studyRoomMembers).where(and(eq(studyRoomMembers.roomId, membership.roomId), eq(studyRoomMembers.userId, userId)));
    pending.changes.push({ type: 'member_left', roomId: membership.roomId, userId, reason: 'left' });
  }

  /** 방을 만들고 id를 돌려준다. 이미 다른 방 멤버면 409, 이 IP의 하루 상한이면 429. */
  async create(userId: string, ip: string, input: RoomCreateInput): Promise<string> {
    return this.run(async (tx, pending) => {
      await lockUser(tx, userId);
      const current = await membershipOf(tx, userId);
      if (current) throw errors.roomAlreadyMember(current.roomId, current.isHost);

      const address = normalizeIp(ip) ?? ip;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`room-create-ip:${address}`}, 0))`);
      const recent = await tx
        .select({ createdAt: roomCreations.createdAt })
        .from(roomCreations)
        .where(and(eq(roomCreations.ip, address), gt(roomCreations.createdAt, sql`now() - make_interval(secs => ${IP_WINDOW_SECONDS})`)))
        .orderBy(asc(roomCreations.createdAt));
      const limit = this.options.createPerIpPerDay;
      if (recent.length >= limit) {
        const oldest = recent[recent.length - limit]!.createdAt.getTime();
        throw errors.roomCreateRateLimited(Math.max(1, Math.ceil((oldest + IP_WINDOW_SECONDS * 1000 - Date.now()) / 1000)));
      }

      const [room] = await tx
        .insert(studyRooms)
        .values({
          hostUserId: userId,
          name: input.name,
          description: input.description,
          map: input.map,
          capacity: input.capacity,
          passwordCiphertext: this.encrypt(input.password),
        })
        .returning({ id: studyRooms.id });
      await tx.insert(studyRoomMembers).values({ roomId: room!.id, userId, seat: 0 });
      await setRoomTags(tx, room!.id, input.tagIds);
      await tx.insert(roomCreations).values({ ip: address });
      pending.changes.push({ type: 'room_created', roomId: room!.id, userId });
      return room!.id;
    });
  }

  /**
   * 참여(계약 joinStudyRoom). 이미 이 방 멤버면 그대로 성공. 비밀번호·정원을 먼저 확인하고, 다른 방 멤버면
   * `leaveCurrent`일 때만 같은 트랜잭션에서 그 방을 나간 뒤(방장이면 삭제) 들어온다.
   */
  async join(userId: string, roomId: string, options: { password?: string; leaveCurrent: boolean }): Promise<void> {
    await this.run(async (tx, pending) => {
      await lockUser(tx, userId);
      const before = await membershipOf(tx, userId);
      const locked = await lockRooms(tx, before ? [roomId, before.roomId] : [roomId]);
      const target = locked.get(roomId);
      if (!target) throw errors.notFound('공부방을 찾을 수 없어요');
      // 방 잠금 뒤 다시 읽는다(그 사이 방장이 나를 내보냈거나 방을 지웠을 수 있다. 새로 생길 수는 없다: 사용자 잠금).
      const current = await membershipOf(tx, userId);
      if (current?.roomId === roomId) return;
      if (target.passwordCiphertext !== null && !roomPasswordMatches(this.options.passwordKey, target.passwordCiphertext, options.password)) {
        throw errors.roomWrongPassword();
      }
      if ((await memberCount(tx, roomId)) >= target.capacity) throw errors.roomFull();
      if (current) {
        if (!options.leaveCurrent) throw errors.roomAlreadyMember(current.roomId, current.isHost);
        await this.leaveInTx(tx, pending, userId, current);
      }
      await tx.insert(studyRoomMembers).values({ roomId, userId, seat: await freeSeat(tx, roomId) });
      pending.changes.push({ type: 'member_joined', roomId, userId });
    });
  }

  /** 나가기. 멤버가 아니면 아무것도 하지 않는다(재시도). 방장이면 방을 지운다. */
  async leave(userId: string, roomId: string): Promise<void> {
    await this.run(async (tx, pending) => {
      await lockUser(tx, userId);
      if (!(await lockRooms(tx, [roomId])).has(roomId)) return;
      const current = await membershipOf(tx, userId);
      if (current?.roomId !== roomId) return;
      await this.leaveInTx(tx, pending, userId, current);
    });
  }

  /** 삭제(방장만). 없는 방이면 아무것도 하지 않는다(재시도). */
  async remove(userId: string, roomId: string): Promise<void> {
    await this.run(async (tx, pending) => {
      const room = (await lockRooms(tx, [roomId])).get(roomId);
      if (!room) return;
      if (room.hostUserId !== userId) throw errors.roomHostOnly();
      await this.deleteRoomInTx(tx, pending, roomId);
    });
  }

  /** 내보내기(방장만, 차단 아님). 이미 멤버가 아니면 그대로 성공. */
  async kick(hostId: string, roomId: string, targetId: string): Promise<void> {
    await this.run(async (tx, pending) => {
      const room = (await lockRooms(tx, [roomId])).get(roomId);
      if (!room) throw errors.notFound('공부방을 찾을 수 없어요');
      if (room.hostUserId !== hostId) throw errors.roomHostOnly();
      if (targetId.toLowerCase() === hostId) throw errors.validation('방장은 내보낼 수 없어요', 'user_id');
      if (!UUID.test(targetId)) return;
      const removed = await tx
        .delete(studyRoomMembers)
        .where(and(eq(studyRoomMembers.roomId, roomId), eq(studyRoomMembers.userId, targetId.toLowerCase())))
        .returning({ userId: studyRoomMembers.userId });
      if (removed.length > 0) pending.changes.push({ type: 'member_left', roomId, userId: removed[0]!.userId, reason: 'removed' });
    });
  }

  /**
   * 자리 옮기기(멤버 본인). 같은 자리면 그대로 성공(재시도). 다른 사람이 앉은 자리면 409. 방 행을 잠가 참여·다른
   * 사람의 자리 옮기기와 한 줄로 세운다.
   */
  async moveSeat(userId: string, roomId: string, seat: number): Promise<void> {
    await this.run(async (tx, pending) => {
      if (!(await lockRooms(tx, [roomId])).has(roomId)) throw errors.notFound('공부방을 찾을 수 없어요');
      const rows = await tx.select({ userId: studyRoomMembers.userId, seat: studyRoomMembers.seat }).from(studyRoomMembers).where(eq(studyRoomMembers.roomId, roomId));
      const mine = rows.find((row) => row.userId === userId);
      if (!mine) throw errors.roomNotMember();
      if (mine.seat === seat) return;
      if (rows.some((row) => row.seat === seat)) throw errors.roomSeatTaken();
      await tx.update(studyRoomMembers).set({ seat }).where(and(eq(studyRoomMembers.roomId, roomId), eq(studyRoomMembers.userId, userId)));
      pending.changes.push({ type: 'member_moved', roomId, userId });
    });
  }

  /** 수정(방장만). 보낸 키만 바꾼다. */
  async update(hostId: string, roomId: string, patch: RoomPatch): Promise<void> {
    await this.run(async (tx, pending) => {
      const room = (await lockRooms(tx, [roomId])).get(roomId);
      if (!room) throw errors.notFound('공부방을 찾을 수 없어요');
      if (room.hostUserId !== hostId) throw errors.roomHostOnly();
      if (patch.map !== undefined && patch.map !== room.map && !FREE_MAPS.has(patch.map)) throw errors.roomMapNotOwned();
      if (patch.capacity !== undefined && patch.capacity < (await memberCount(tx, roomId))) throw errors.roomCapacityBelowMembers();
      const changes: Partial<typeof studyRooms.$inferInsert> = { updatedAt: this.now() };
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.description !== undefined) changes.description = patch.description;
      if (patch.map !== undefined) changes.map = patch.map;
      if (patch.capacity !== undefined) changes.capacity = patch.capacity;
      if (patch.password !== undefined) changes.passwordCiphertext = this.encrypt(patch.password);
      await tx.update(studyRooms).set(changes).where(eq(studyRooms.id, roomId));
      if (patch.tagIds !== undefined) await setRoomTags(tx, roomId, patch.tagIds);
      pending.changes.push({ type: 'room_updated', roomId });
    });
  }

  private async requireHost(tx: DbExecutor, hostId: string, roomId: string): Promise<void> {
    const room = (await lockRooms(tx, [roomId])).get(roomId);
    if (!room) throw errors.notFound('공부방을 찾을 수 없어요');
    if (room.hostUserId !== hostId) throw errors.roomHostOnly();
  }

  /**
   * 배너·로고를 올린다(방장만). 새 키에 먼저 올리고, 방을 잠가 새 id로 바꾼 뒤 커밋되면 이전 파일을 지운다.
   * 권한이 없거나 방이 그 사이 사라졌으면 올린 파일을 지운다(어디서도 가리키지 않는 파일을 남기지 않는다).
   */
  async setImage(hostId: string, roomId: string, slot: ImageSlot, bytes: Buffer, contentType: string): Promise<void> {
    await this.db.transaction((tx) => this.requireHost(tx, hostId, roomId)); // 남의 방에 파일을 올리기 전에 거른다
    const imageId = randomBytes(16).toString('hex');
    const key = imageKey(roomId, slot, imageId);
    await this.media.put(key, bytes, contentType);
    try {
      await this.run(async (tx, pending) => {
        await this.requireHost(tx, hostId, roomId);
        const column = slotColumn(slot);
        const [before] = await tx.select({ id: column }).from(studyRooms).where(eq(studyRooms.id, roomId));
        await tx.update(studyRooms).set({ [slot === 'banner' ? 'bannerId' : 'logoId']: imageId, updatedAt: this.now() }).where(eq(studyRooms.id, roomId));
        if (before?.id) pending.mediaKeys.push(imageKey(roomId, slot, before.id));
        pending.changes.push({ type: 'room_updated', roomId });
      });
    } catch (error) {
      await this.deleteMedia([key]);
      throw error;
    }
  }

  /** 배너·로고를 지운다(방장만). 이미 없으면 그대로 성공. */
  async clearImage(hostId: string, roomId: string, slot: ImageSlot): Promise<void> {
    await this.run(async (tx, pending) => {
      await this.requireHost(tx, hostId, roomId);
      const column = slotColumn(slot);
      const [before] = await tx.select({ id: column }).from(studyRooms).where(eq(studyRooms.id, roomId));
      if (!before?.id) return;
      await tx.update(studyRooms).set({ [slot === 'banner' ? 'bannerId' : 'logoId']: null, updatedAt: this.now() }).where(eq(studyRooms.id, roomId));
      pending.mediaKeys.push(imageKey(roomId, slot, before.id));
      pending.changes.push({ type: 'room_updated', roomId });
    });
  }

  /** 초대 링크 토큰을 새로 만든다(방장만). 이전 링크는 무효. 토큰 원문은 돌려줄 뿐 저장하지 않는다. */
  async issueInvite(hostId: string, roomId: string): Promise<{ token: string; expiresAt: Date }> {
    return this.run(async (tx) => {
      const room = (await lockRooms(tx, [roomId])).get(roomId);
      if (!room) throw errors.notFound('공부방을 찾을 수 없어요');
      if (room.hostUserId !== hostId) throw errors.roomHostOnly();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(this.now().getTime() + INVITE_TTL_MS);
      await tx
        .insert(studyRoomInvites)
        .values({ roomId, tokenHash: hashInviteToken(token), expiresAt })
        .onConflictDoUpdate({ target: studyRoomInvites.roomId, set: { tokenHash: hashInviteToken(token), expiresAt, createdAt: sql`now()` } });
      return { token, expiresAt };
    });
  }

  /** 살아 있는 초대 토큰이 가리키는 방 id. 만료·무효면 null(원인을 구분하지 않는다). */
  async roomIdForInvite(token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ roomId: studyRoomInvites.roomId })
      .from(studyRoomInvites)
      .where(and(eq(studyRoomInvites.tokenHash, hashInviteToken(token)), gt(studyRoomInvites.expiresAt, this.now())));
    return row?.roomId ?? null;
  }

  /**
   * 계정 삭제: 내가 방장인 방을 지우고(멤버도 나감), 다른 방 멤버였으면 그 자리를 비운다. `deleteRows`(사용자 행
   * 삭제)와 같은 트랜잭션에서 하고, 커밋 뒤 알린다.
   */
  async deleteAccount(userId: string, deleteRows: (tx: DbExecutor) => Promise<void>): Promise<void> {
    await this.run(async (tx, pending) => {
      await lockUser(tx, userId);
      const current = await membershipOf(tx, userId);
      const hosted = await tx.select({ id: studyRooms.id }).from(studyRooms).where(eq(studyRooms.hostUserId, userId));
      await lockRooms(tx, [...hosted.map((r) => r.id), ...(current ? [current.roomId] : [])]);
      for (const room of hosted) await this.deleteRoomInTx(tx, pending, room.id);
      if (current && !current.isHost) {
        await tx.delete(studyRoomMembers).where(eq(studyRoomMembers.userId, userId));
        pending.changes.push({ type: 'member_left', roomId: current.roomId, userId, reason: 'account_deleted' });
      }
      await deleteRows(tx);
    });
  }
}
