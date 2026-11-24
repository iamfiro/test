import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';
import { listen, TestSocket } from './helpers/socket.js';

type Event = Record<string, any>;

describe('방 실시간 상태', () => {
  let app: FastifyInstance;
  let url: string;
  let clock = Date.parse('2026-11-24T03:00:00.000Z'); // 서울 12:00
  let ipSeq = 0;
  const open: TestSocket[] = [];
  const ipOf = new Map<string, string>();

  const person = async () => {
    const ip = `198.51.100.${++ipSeq}`;
    const session = await startAnonymous(app, { remoteAddress: ip });
    ipOf.set(session.userId, ip);
    return session;
  };
  const http = (who: TestSession, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, payload?: unknown) =>
    app.inject({
      method,
      url: path,
      remoteAddress: ipOf.get(who.userId),
      headers: method === 'GET' ? authHeaders(who) : withKey(who),
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  const ok = async (res: Awaited<ReturnType<typeof http>>, status = 200) => {
    expect(res.statusCode, res.body).toBe(status);
    return res.statusCode === 204 ? null : res.json().data;
  };
  const createRoom = async (host: TestSession, body: Record<string, unknown> = {}) =>
    (await ok(await http(host, 'POST', '/study-rooms', { name: '새벽 공부', map: 'cafe', capacity: 10, tag_ids: [], ...body }), 201)).room
      .id as string;
  const joinRoom = (who: TestSession, roomId: string) => http(who, 'POST', `/study-rooms/${roomId}/join`, {}).then((r) => ok(r));
  const start = async (who: TestSession) =>
    (await ok(await http(who, 'POST', '/study/active-session/start', { subject: null, timezone: 'Asia/Seoul' }), 201)).session.id as string;
  const connect = async (who: TestSession) => {
    const socket = TestSocket.connect(url, { cookie: who.cookie });
    open.push(socket);
    return socket.opened();
  };
  /** 방 토픽에 들어가 스냅샷을 돌려준다. */
  const enter = async (who: TestSession, roomId: string) => {
    const socket = await connect(who);
    const [state, joined] = await socket.join(`room:${roomId}`);
    expect(state!.type).toBe('room_state');
    expect(joined!.type).toBe('joined');
    return { socket, state: state! };
  };
  const memberOf = (state: Event, userId: string) => state.members.find((m: Event) => m.user_id === userId);
  const nextRoomEvent = (socket: TestSocket) => socket.until((e) => typeof e.seq === 'number', 'room event');

  beforeAll(async () => {
    app = await createTestApp({ now: () => new Date(clock) });
    url = await listen(app);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    for (const socket of open.splice(0)) socket.close();
    await resetDatabase(app);
    clock += 60 * 60 * 1000;
  });

  it('room_state: 방 정보와 멤버 전원(자리·상태·흐른 초·오늘 초·순위), seq 0부터', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    const { state } = await enter(host, roomId);
    expect(state).toMatchObject({ topic: `room:${roomId}`, seq: 0, server_time: new Date(clock).toISOString() });
    expect(state.room).toMatchObject({ id: roomId, name: '새벽 공부', capacity: 10, map: 'cafe', has_password: false, host_user_id: host.userId });
    expect(state.members).toEqual([
      expect.objectContaining({ user_id: host.userId, seat: 0, is_host: true, status: 'away', session_seconds: 0, today_seconds: 0, rank: null }),
      expect.objectContaining({ user_id: guest.userId, seat: 1, is_host: false, status: 'away', rank: null }),
    ]);
    expect(memberOf(state, host.userId)).toEqual({
      user_id: host.userId,
      nickname: expect.any(String),
      avatar: expect.any(Object),
      gender: null,
      seat: 0,
      is_host: true,
      status: 'away',
      session_seconds: 0,
      as_of: new Date(clock).toISOString(),
      today_seconds: 0,
      rank: null,
    });
  });

  it('타이머 시작·일시정지·재개·끝내기 → 같은 방 다른 연결에 member_updated(seq가 1씩)', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    const { socket } = await enter(host, roomId);

    const sessionId = await start(guest);
    const started = await nextRoomEvent(socket);
    expect(started).toMatchObject({ type: 'member_updated', seq: 1, member: { user_id: guest.userId, status: 'studying', session_seconds: 0, rank: null } });

    clock += 90_000;
    await ok(await http(guest, 'PUT', '/study/presence', { session_id: sessionId }), 204);
    // 90초 흐름 → 순위가 생긴다(presence가 상태를 바꾸지 않아도 순위가 바뀌면 보낸다).
    const ranked = await nextRoomEvent(socket);
    expect(ranked).toMatchObject({ type: 'member_updated', seq: 2, member: { user_id: guest.userId, status: 'studying', session_seconds: 90, rank: 1 } });

    await ok(await http(guest, 'POST', `/study/active-session/${sessionId}/pause`, {}));
    expect(await nextRoomEvent(socket)).toMatchObject({ seq: 3, member: { status: 'paused', session_seconds: 90, rank: 1 } });
    clock += 30_000;
    await ok(await http(guest, 'POST', `/study/active-session/${sessionId}/resume`, {}));
    expect(await nextRoomEvent(socket)).toMatchObject({ seq: 4, member: { status: 'studying', session_seconds: 90 } });
    clock += 10_000;
    await ok(await http(guest, 'POST', `/study/active-session/${sessionId}/finish`, {}));
    expect(await nextRoomEvent(socket)).toMatchObject({
      seq: 5,
      member: { status: 'away', session_seconds: 0, today_seconds: 100, rank: null },
    });
  });

  it('presence가 75초 끊기면 away(시계를 옮기고 sweep), 다시 오면 studying', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    const { socket } = await enter(host, roomId);
    const sessionId = await start(guest);
    await nextRoomEvent(socket); // studying

    clock += 75_000;
    await app.live.sweep();
    // 75초 정각은 아직 이어진 것으로 본다(타이머와 같은 기준). 그 사이 순위는 생긴다.
    const ranked = await nextRoomEvent(socket);
    expect(ranked.member).toMatchObject({ status: 'studying', rank: 1 });
    clock += 1_000;
    await app.live.sweep();
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'member_updated', member: { user_id: guest.userId, status: 'away', rank: null } });
    // 같은 상태면 다시 보내지 않는다.
    clock += 60_000;
    await app.live.sweep();

    await ok(await http(guest, 'PUT', '/study/presence', { session_id: sessionId }), 204);
    const back = await nextRoomEvent(socket);
    expect(back).toMatchObject({ seq: ranked.seq + 2, member: { status: 'studying' } });
  });

  it('일시정지 중 75초 넘게 끊겼다 돌아오면 쉬는 중(다른 변경으로 다시 읽어도 그대로)', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    const { socket } = await enter(host, roomId);
    const sessionId = await start(guest);
    await nextRoomEvent(socket);
    clock += 10_000;
    await ok(await http(guest, 'POST', `/study/active-session/${sessionId}/pause`, {}));
    expect(await nextRoomEvent(socket)).toMatchObject({ member: { status: 'paused' } });
    clock += 120_000;
    await app.live.sweep();
    expect(await nextRoomEvent(socket)).toMatchObject({ member: { status: 'away' } });
    await ok(await http(guest, 'PUT', '/study/presence', { session_id: sessionId }), 204);
    expect(await nextRoomEvent(socket)).toMatchObject({ member: { status: 'paused', session_seconds: 10 } });
    await ok(await http(guest, 'PATCH', '/users/me/profile', { nickname: '돌아옴' }));
    expect(await nextRoomEvent(socket)).toMatchObject({ member: { nickname: '돌아옴', status: 'paused' } });
  });

  it('흐르는 사람이 멈춘 사람을 앞지르면 sweep이 순위를 다시 보낸다', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    const { socket } = await enter(host, roomId);

    const hostSession = await start(host);
    await nextRoomEvent(socket);
    clock += 60_000;
    await ok(await http(host, 'POST', `/study/active-session/${hostSession}/pause`, {}));
    expect(await nextRoomEvent(socket)).toMatchObject({ member: { user_id: host.userId, status: 'paused', session_seconds: 60, rank: 1 } });

    const guestSession = await start(guest);
    expect(await nextRoomEvent(socket)).toMatchObject({ member: { user_id: guest.userId, status: 'studying', rank: null } });
    clock += 30_000;
    await ok(await http(guest, 'PUT', '/study/presence', { session_id: guestSession }), 204);
    await ok(await http(host, 'PUT', '/study/presence', { session_id: hostSession }), 204);
    expect(await nextRoomEvent(socket)).toMatchObject({ member: { user_id: guest.userId, rank: 2 } });
    clock += 31_000; // guest 61초 > host 60초
    await app.live.sweep();
    const updates = [await nextRoomEvent(socket), await nextRoomEvent(socket)];
    const byUser = Object.fromEntries(updates.map((e) => [e.member.user_id, e.member.rank]));
    expect(byUser).toEqual({ [guest.userId]: 1, [host.userId]: 2 });
  });

  it('참여 → member_joined(빈 자리 중 가장 작은 번호), 자리 옮기기 → member_updated', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const { socket } = await enter(host, roomId);
    const guest = await person();
    await joinRoom(guest, roomId);
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'member_joined', seq: 1, member: { user_id: guest.userId, seat: 1, status: 'away' } });

    const moved = await http(guest, 'PUT', `/study-rooms/${roomId}/seat`, { seat: 7 });
    expect(moved.statusCode, moved.body).toBe(200);
    expectContract('/study-rooms/{room_id}/seat', 'put', 200, moved.json());
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'member_updated', seq: 2, member: { user_id: guest.userId, seat: 7 } });

    const taken = await http(host, 'PUT', `/study-rooms/${roomId}/seat`, { seat: 7 });
    expect(taken.statusCode).toBe(409);
    expectContract('/study-rooms/{room_id}/seat', 'put', 409, taken.json());
    expect(taken.json().error.code).toBe('STUDY_ROOM_SEAT_TAKEN');
    const range = await http(host, 'PUT', `/study-rooms/${roomId}/seat`, { seat: 33 });
    expect(range.statusCode).toBe(422);
    expectContract('/study-rooms/{room_id}/seat', 'put', 422, range.json());
    const stranger = await person();
    const notMember = await http(stranger, 'PUT', `/study-rooms/${roomId}/seat`, { seat: 3 });
    expect(notMember.statusCode).toBe(403);
    expectContract('/study-rooms/{room_id}/seat', 'put', 403, notMember.json());
    // 같은 자리로 다시 보내면 그대로 성공(이벤트 없음).
    expect((await http(guest, 'PUT', `/study-rooms/${roomId}/seat`, { seat: 7 })).statusCode).toBe(200);

    // 1번이 비었으니 다음 사람은 1번.
    const third = await person();
    await joinRoom(third, roomId);
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'member_joined', seq: 3, member: { user_id: third.userId, seat: 1 } });
  });

  it('내보내지면 member_left(removed)를 받고 그 토픽에서 바로 빠진다', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    const hostSide = await enter(host, roomId);
    const guestSide = await enter(guest, roomId);

    await ok(await http(host, 'DELETE', `/study-rooms/${roomId}/members/${guest.userId}`));
    const left = { type: 'member_left', topic: `room:${roomId}`, seq: 1, user_id: guest.userId, reason: 'removed' };
    expect(await nextRoomEvent(hostSide.socket)).toEqual(left);
    expect(await guestSide.socket.next()).toEqual(left);

    // 방장의 다음 방 메시지가 내보낸 사람에게 가지 않는다: 그 사람의 다음 프레임은 자기 로비 응답이다.
    hostSide.socket.send({ type: 'send', topic: `room:${roomId}`, client_id: crypto.randomUUID(), body: '안녕히' });
    await hostSide.socket.until((e) => e.type === 'message');
    expect(await guestSide.socket.join('lobby')).toEqual([{ type: 'joined', topic: 'lobby', messages: [] }]);
    // 다시 들어가거나 쓸 수 없다.
    expect(await guestSide.socket.join(`room:${roomId}`)).toMatchObject([{ type: 'error', code: 'FORBIDDEN' }]);
  });

  it('나가기·계정 삭제도 member_left(사유), 방 삭제는 room_deleted 뒤 모두 빠진다', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const a = await person();
    const b = await person();
    await joinRoom(a, roomId);
    await joinRoom(b, roomId);
    const { socket } = await enter(host, roomId);
    const aSide = await enter(a, roomId);

    await ok(await http(a, 'POST', `/study-rooms/${roomId}/leave`, {}), 204);
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'member_left', user_id: a.userId, reason: 'left' });
    expect(await aSide.socket.next()).toMatchObject({ type: 'member_left', user_id: a.userId });
    await ok(await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(b) }), 204);
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'member_left', user_id: b.userId, reason: 'account_deleted' });

    await ok(await http(host, 'DELETE', `/study-rooms/${roomId}`), 204);
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'room_deleted', topic: `room:${roomId}`, seq: 3 });
    expect(await socket.join(`room:${roomId}`)).toMatchObject([{ type: 'error', code: 'FORBIDDEN' }]);
  });

  it('방 수정 → room_updated, 프로필 수정 → member_updated', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const { socket } = await enter(host, roomId);
    await ok(await http(host, 'PATCH', `/study-rooms/${roomId}`, { name: '저녁 공부', capacity: 12 }));
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'room_updated', seq: 1, room: { id: roomId, name: '저녁 공부', capacity: 12 } });
    await ok(await http(host, 'PATCH', '/users/me/profile', { nickname: '새 이름', gender: 'female' }));
    expect(await nextRoomEvent(socket)).toMatchObject({ type: 'member_updated', seq: 2, member: { user_id: host.userId, nickname: '새 이름', gender: 'female' } });
  });

  it('seq 빈틈을 본 클라이언트가 다시 join하면 지금 seq의 스냅샷을 받는다', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    const { socket } = await enter(host, roomId);
    await start(guest);
    const e1 = await nextRoomEvent(socket);
    await ok(await http(host, 'PATCH', `/study-rooms/${roomId}`, { name: '바뀐 이름' }));
    const e2 = await nextRoomEvent(socket);
    expect([e1.seq, e2.seq]).toEqual([1, 2]);
    // (클라이언트가 e2를 놓쳤다고 치고) 다시 들어간다.
    const [state] = await socket.join(`room:${roomId}`);
    expect(state).toMatchObject({ type: 'room_state', seq: 2, room: { name: '바뀐 이름' } });
    expect(memberOf(state!, guest.userId)).toMatchObject({ status: 'studying' });
    // 다음 변경은 3.
    await ok(await http(host, 'PATCH', `/study-rooms/${roomId}`, { name: '또 바뀜' }));
    expect((await nextRoomEvent(socket)).seq).toBe(3);
  });

  it('차단해도 방 명단에서는 빠지지 않는다', async () => {
    const host = await person();
    const roomId = await createRoom(host);
    const guest = await person();
    await joinRoom(guest, roomId);
    await ok(await http(host, 'PUT', `/users/me/blocks/${guest.userId}`));
    const { state } = await enter(host, roomId);
    expect(memberOf(state, guest.userId)).toBeTruthy();
  });
});
