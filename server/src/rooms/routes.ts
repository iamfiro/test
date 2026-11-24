import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errors } from '../http/errors.js';
import { WindowLimiter } from '../http/window-limit.js';
import { containsBannedWord } from '../moderation/banned-words.js';
import { activeIpRestriction, activeUserRestriction } from '../moderation/restrictions.js';
import { parseTagIds } from '../tags/routes.js';
import { ROOM_PASSWORD } from './password.js';
import { sniffImage } from '../media/image.js';
import type { UploadBody } from '../media/routes.js';
import { FREE_MAPS, IMAGE_SLOTS, MAP_SEATS, type ImageSlot, type RoomCreateInput, type RoomPatch } from './service.js';
import { invitePreview, listRooms, roomDetail, type RoomDetail, type RoomScope, type ViewContext } from './views.js';

const NAME_MAX = 40;
const DESCRIPTION_MAX = 100;
const CAPACITY_MIN = 2;
const ROOM_TAGS_MAX = 3;
const MAPS = ['cafe', 'library', 'rooftop'] as const;
const SCOPES: RoomScope[] = ['mine', 'all', 'recommended'];
const HOUR_MS = 60 * 60 * 1000;
/** 참여·초대 수락을 합쳐 사용자당 시간당 30회(PocketTimeServer `study_room_join`과 같다). */
const JOINS_PER_HOUR = 30;
/** 초대 미리보기: 같은 IP 기준 시간당 60회(계약). */
const PREVIEWS_PER_HOUR = 60;
/** 사진: PocketTime 업로드 규칙과 같은 10MB(계약). 요청 전체는 multipart 머리 여유를 두고 11MB까지 받는다. */
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_BODY_LIMIT = 11 * 1024 * 1024;
const TOKEN_MIN = 16;
const TOKEN_MAX = 128;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 이름: 제어 문자 금지. 소개: 줄바꿈만 허용. */
const CONTROL = /\p{Cc}/u;
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

const shortId = (id: string) => id.slice(0, 4);

function objectBody(body: unknown, allowed: string[], allowEmpty = false): Record<string, unknown> {
  if (body === undefined && allowEmpty) return {};
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw errors.validation('보낼 내용이 없어요');
  const input = body as Record<string, unknown>;
  const unknown = Object.keys(input).find((key) => !allowed.includes(key));
  if (unknown) throw errors.validation('알 수 없는 항목이에요', unknown);
  return input;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string') throw errors.validation('공부방 이름을 적어 주세요', 'name');
  const name = value.trim();
  const length = [...name].length;
  if (length < 1 || length > NAME_MAX || CONTROL.test(name)) throw errors.validation(`공부방 이름은 1–${NAME_MAX}자예요`, 'name');
  // 무엇이 걸렸는지는 말하지 않는다(닉네임과 같은 이유).
  if (containsBannedWord(name)) throw errors.validation('이 이름은 쓸 수 없어요. 다른 이름을 골라 주세요', 'name');
  return name;
}

function parseDescription(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw errors.validation('소개가 올바르지 않아요', 'description');
  const description = value.trim();
  if (description.length === 0) return null;
  if ([...description].length > DESCRIPTION_MAX || CONTROL_EXCEPT_NEWLINE.test(description)) {
    throw errors.validation(`소개는 ${DESCRIPTION_MAX}자까지 쓸 수 있어요`, 'description');
  }
  if (containsBannedWord(description)) throw errors.validation('이 소개는 쓸 수 없어요', 'description');
  return description;
}

function parseMap(value: unknown): RoomCreateInput['map'] {
  if (typeof value !== 'string' || !(MAPS as readonly string[]).includes(value)) throw errors.validation('맵이 올바르지 않아요', 'map');
  return value as RoomCreateInput['map'];
}

function parseCapacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < CAPACITY_MIN || value > MAP_SEATS) {
    throw errors.validation(`정원은 ${CAPACITY_MIN}–${MAP_SEATS}명이에요`, 'capacity');
  }
  return value;
}

function parsePassword(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !ROOM_PASSWORD.test(value)) throw errors.validation('비밀번호는 영문·숫자 4–20자예요', 'password');
  return value;
}

function parseCreate(body: unknown): RoomCreateInput {
  const input = objectBody(body, ['name', 'description', 'map', 'capacity', 'password', 'tag_ids']);
  return {
    name: parseName(input.name),
    description: parseDescription(input.description),
    map: parseMap(input.map),
    capacity: parseCapacity(input.capacity),
    password: parsePassword(input.password),
    tagIds: parseTagIds(input.tag_ids, ROOM_TAGS_MAX),
  };
}

function parsePatch(body: unknown): RoomPatch {
  const input = objectBody(body, ['name', 'description', 'map', 'capacity', 'password', 'tag_ids']);
  if (Object.keys(input).length === 0) throw errors.validation('바꿀 항목을 하나 이상 보내 주세요');
  const patch: RoomPatch = {};
  if ('name' in input) patch.name = parseName(input.name);
  if ('description' in input) patch.description = parseDescription(input.description);
  if ('map' in input) patch.map = parseMap(input.map);
  if ('capacity' in input) patch.capacity = parseCapacity(input.capacity);
  if ('password' in input) patch.password = parsePassword(input.password);
  if ('tag_ids' in input) patch.tagIds = parseTagIds(input.tag_ids, ROOM_TAGS_MAX);
  return patch;
}

function parseJoin(input: Record<string, unknown>): { password?: string; leaveCurrent: boolean } {
  const { password, leave_current_room: leave } = input;
  if (password !== undefined && (typeof password !== 'string' || password.length < 4 || password.length > 20)) {
    throw errors.validation('비밀번호는 4–20자예요', 'password');
  }
  if (leave !== undefined && typeof leave !== 'boolean') throw errors.validation('값이 올바르지 않아요', 'leave_current_room');
  return { ...(password === undefined ? {} : { password }), leaveCurrent: leave === true };
}

function parseToken(value: unknown): string {
  if (typeof value !== 'string' || value.length < TOKEN_MIN || value.length > TOKEN_MAX) throw errors.validation('링크가 올바르지 않아요', 'token');
  return value;
}

function roomIdParam(request: FastifyRequest): string {
  const id = (request.params as { room_id?: string }).room_id ?? '';
  // 형식이 틀린 id는 없는 방과 같다.
  if (!UUID.test(id)) throw errors.notFound('공부방을 찾을 수 없어요');
  return id.toLowerCase();
}

/** 방장 상세는 비밀번호를 싣는다. 재전송용 기록에는 남기지 않는다(계약 RoomDetail.password). */
function sendDetail(request: FastifyRequest, reply: FastifyReply, detail: RoomDetail, status = 200) {
  if (detail.password !== null) {
    request.idempotencyReceipt = (payload) => {
      const parsed = JSON.parse(payload) as { data: { password: string | null } };
      parsed.data.password = null;
      return JSON.stringify(parsed);
    };
  }
  return reply.ok(detail, status);
}

export function registerRoomRoutes(app: FastifyInstance): void {
  const joins = new WindowLimiter(JOINS_PER_HOUR, HOUR_MS, app.now);
  const previews = new WindowLimiter(PREVIEWS_PER_HOUR, HOUR_MS, app.now);

  const context = (viewerId: string | null): ViewContext => ({
    db: app.db,
    viewerId,
    now: app.now(),
    passwordKey: app.config.roomPasswordKey,
    mediaUrl: (key) => app.media.publicUrl(key),
  });
  const detailOf = async (request: FastifyRequest, roomId: string) => {
    const detail = await roomDetail(context(request.auth!.user.id), roomId);
    if (!detail) throw errors.notFound('공부방을 찾을 수 없어요');
    return detail;
  };
  const takeJoin = (userId: string) => {
    const allowed = joins.take(userId);
    if (!allowed.ok) throw errors.rateLimited(allowed.retryAfterSeconds);
  };

  app.get('/study-rooms', async (request, reply) => {
    const { scope, q } = request.query as { scope?: unknown; q?: unknown };
    if (typeof scope !== 'string' || !(SCOPES as string[]).includes(scope)) throw errors.validation('scope가 올바르지 않아요', 'scope');
    let search: string | null = null;
    if (q !== undefined) {
      const trimmed = typeof q === 'string' ? q.trim() : '';
      if ([...trimmed].length < 1 || [...trimmed].length > NAME_MAX) throw errors.validation(`검색어는 1–${NAME_MAX}자예요`, 'q');
      search = trimmed;
    }
    const viewerId = request.auth!.user.id;
    return reply.ok({ rooms: await listRooms({ ...context(viewerId), viewerId }, scope as RoomScope, search) });
  });

  app.post('/study-rooms', { config: { idempotent: true } }, async (request, reply) => {
    const startedAt = Date.now();
    const userId = request.auth!.user.id;
    // 새 방을 만들 때만 막는다(수정·참여는 지나간다).
    if (!(await app.settings.isEnabled('room_create_enabled'))) throw errors.roomCreateDisabled();
    const now = app.now();
    if (await activeUserRestriction(app.db, userId, 'room_create', now)) throw errors.roomCreateRestricted();
    if (await activeIpRestriction(app.db, request.ip, 'room_create', now)) throw errors.roomCreateRestricted();
    const input = parseCreate(request.body);
    if (!FREE_MAPS.has(input.map)) throw errors.roomMapNotOwned();
    const roomId = await app.rooms.create(userId, request.ip, input);
    request.log.info(`study room created room: ${shortId(roomId)} elapsed_ms: ${Date.now() - startedAt}`);
    return sendDetail(request, reply, await detailOf(request, roomId), 201);
  });

  app.get('/study-rooms/:room_id', async (request, reply) => reply.ok(await detailOf(request, roomIdParam(request))));

  app.patch('/study-rooms/:room_id', { config: { idempotent: true } }, async (request, reply) => {
    const roomId = roomIdParam(request);
    const patch = parsePatch(request.body);
    await app.rooms.update(request.auth!.user.id, roomId, patch);
    request.log.info(`study room updated room: ${shortId(roomId)} fields: ${Object.keys(patch).join(',')}`);
    return sendDetail(request, reply, await detailOf(request, roomId));
  });

  app.delete('/study-rooms/:room_id', { config: { idempotent: true } }, async (request, reply) => {
    const id = (request.params as { room_id?: string }).room_id ?? '';
    if (UUID.test(id)) await app.rooms.remove(request.auth!.user.id, id.toLowerCase());
    request.log.info(`study room deleted room: ${shortId(id)}`);
    return reply.code(204).send();
  });

  app.post('/study-rooms/:room_id/join', { config: { idempotent: true } }, async (request, reply) => {
    const roomId = roomIdParam(request);
    const options = parseJoin(objectBody(request.body, ['password', 'leave_current_room'], true));
    const userId = request.auth!.user.id;
    takeJoin(userId);
    await app.rooms.join(userId, roomId, options);
    request.log.info(`study room joined room: ${shortId(roomId)} moved: ${options.leaveCurrent}`);
    return sendDetail(request, reply, await detailOf(request, roomId));
  });

  app.post('/study-rooms/:room_id/leave', { config: { idempotent: true } }, async (request, reply) => {
    const id = (request.params as { room_id?: string }).room_id ?? '';
    if (UUID.test(id)) await app.rooms.leave(request.auth!.user.id, id.toLowerCase());
    return reply.code(204).send();
  });

  app.delete('/study-rooms/:room_id/members/:user_id', { config: { idempotent: true } }, async (request, reply) => {
    const roomId = roomIdParam(request);
    const targetId = (request.params as { user_id?: string }).user_id ?? '';
    await app.rooms.kick(request.auth!.user.id, roomId, targetId);
    request.log.info(`study room member removed room: ${shortId(roomId)} user: ${shortId(targetId)}`);
    return sendDetail(request, reply, await detailOf(request, roomId));
  });

  app.put('/study-rooms/:room_id/seat', { config: { idempotent: true } }, async (request, reply) => {
    const roomId = roomIdParam(request);
    const { seat } = objectBody(request.body, ['seat']);
    if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 0 || seat >= MAP_SEATS) {
      throw errors.validation(`자리 번호는 0–${MAP_SEATS - 1}이에요`, 'seat');
    }
    await app.rooms.moveSeat(request.auth!.user.id, roomId, seat);
    request.log.info(`study room seat moved room: ${shortId(roomId)} seat: ${seat}`);
    return reply.ok({ seat });
  });

  const slotParam = (request: FastifyRequest): ImageSlot => {
    const slot = (request.params as { slot?: string }).slot;
    if (!(IMAGE_SLOTS as readonly (string | undefined)[]).includes(slot)) throw errors.notFound();
    return slot as ImageSlot;
  };

  app.put('/study-rooms/:room_id/images/:slot', { bodyLimit: IMAGE_BODY_LIMIT, config: { idempotent: true } }, async (request, reply) => {
    const startedAt = Date.now();
    const roomId = roomIdParam(request);
    const slot = slotParam(request);
    const body = request.body as UploadBody | undefined;
    const bytes = body && typeof body === 'object' && 'file' in body ? body.file?.bytes : undefined;
    if (!bytes) throw errors.validation('사진 파일을 보내 주세요', 'file');
    if (bytes.length > IMAGE_MAX_BYTES) throw errors.validation('사진은 10MB까지 올릴 수 있어요', 'file');
    // 보낸 형식(파일 이름·Content-Type)은 믿지 않는다.
    const info = sniffImage(bytes);
    if (!info) throw errors.validation('JPEG·PNG·WebP 사진만 올릴 수 있어요', 'file');
    await app.rooms.setImage(request.auth!.user.id, roomId, slot, bytes, info.type);
    request.log.info(
      `study room image saved room: ${shortId(roomId)} slot: ${slot} type: ${info.type} bytes: ${bytes.length} elapsed_ms: ${Date.now() - startedAt}`,
    );
    return sendDetail(request, reply, await detailOf(request, roomId));
  });

  app.delete('/study-rooms/:room_id/images/:slot', { config: { idempotent: true } }, async (request, reply) => {
    const roomId = roomIdParam(request);
    const slot = slotParam(request);
    await app.rooms.clearImage(request.auth!.user.id, roomId, slot);
    request.log.info(`study room image removed room: ${shortId(roomId)} slot: ${slot}`);
    return sendDetail(request, reply, await detailOf(request, roomId));
  });

  // 발급은 멱등 기록을 쓰지 않는다(계약): 기록에 토큰이 남으면 안 되고, 재시도는 새 링크로 충분하다.
  app.post('/study-rooms/:room_id/invite', async (request, reply) => {
    const roomId = roomIdParam(request);
    const { token, expiresAt } = await app.rooms.issueInvite(request.auth!.user.id, roomId);
    request.log.info(`study room invite issued room: ${shortId(roomId)}`);
    return reply.ok({ url: `${app.config.inviteWebOrigin}/r#${token}`, expires_at: expiresAt.toISOString() }, 201);
  });

  // 읽기만 하므로 세션이 있어도 CSRF 토큰을 요구하지 않는다(비로그인도 부른다).
  app.post('/invites/preview', { config: { auth: 'optional', csrf: false } }, async (request, reply) => {
    const token = parseToken(objectBody(request.body, ['token']).token);
    const allowed = previews.take(request.ip);
    if (!allowed.ok) throw errors.rateLimited(allowed.retryAfterSeconds);
    const roomId = await app.rooms.roomIdForInvite(token);
    const preview = roomId ? await invitePreview(context(request.auth?.user.id ?? null), roomId) : null;
    if (!preview) throw errors.notFound('링크가 만료됐거나 공부방이 없어요');
    return reply.ok(preview);
  });

  app.post('/invites/accept', { config: { idempotent: true } }, async (request, reply) => {
    const input = objectBody(request.body, ['token', 'password', 'leave_current_room']);
    const token = parseToken(input.token);
    const { token: _token, ...rest } = input;
    const options = parseJoin(rest);
    const userId = request.auth!.user.id;
    takeJoin(userId);
    const roomId = await app.rooms.roomIdForInvite(token);
    if (!roomId) throw errors.notFound('링크가 만료됐거나 공부방이 없어요');
    await app.rooms.join(userId, roomId, options);
    request.log.info(`study room joined by invite room: ${shortId(roomId)} moved: ${options.leaveCurrent}`);
    return sendDetail(request, reply, await detailOf(request, roomId));
  });
}
