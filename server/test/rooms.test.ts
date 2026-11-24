import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { studyRoomInvites, studyRooms, users } from '../src/db/schema.js';
import { writeSetting } from '../src/moderation/settings.js';
import { restrictIp, restrictUser } from '../src/moderation/restrictions.js';
import { runCli } from '../src/ops/commands.js';
import { moveRoomTagRefs, type RoomChange } from '../src/rooms/service.js';
import { listCatalog, seedTags, type TagView } from '../src/tags/catalog.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';

const WEB = 'http://localhost:5190';

async function count(app: FastifyInstance, table: string, where = 'true'): Promise<number> {
  const result = await app.db.execute(sql.raw(`select count(*)::int as n from "${table}" where ${where}`));
  return Number((result.rows[0] as { n: number }).n);
}

describe('공부방', () => {
  let app: FastifyInstance;
  let catalog: TagView[];
  let ipSeq = 0;

  const tagId = (name: string) => catalog.find((t) => t.name === name)!.id;
  /** 사람마다 다른 IP(방 만들기 IP 하루 상한이 다른 테스트를 막지 않게). 그 사람의 요청은 그 IP에서 온다. */
  const ipOf = new Map<string, string>();
  const person = async () => {
    const ip = `198.51.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;
    const session = await startAnonymous(app, { remoteAddress: ip });
    ipOf.set(session.cookie, ip);
    return session;
  };

  const send = (
    who: TestSession | null,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
    url: string,
    payload?: unknown,
    headers?: Record<string, string>,
  ): Promise<LightMyRequestResponse> =>
    app.inject({
      method,
      url,
      remoteAddress: who ? ipOf.get(who.cookie) : '203.0.113.200',
      headers: headers ?? (who ? (method === 'GET' ? authHeaders(who) : withKey(who)) : { 'content-type': 'application/json' }),
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });

  const create = (who: TestSession, body: Record<string, unknown> = {}, headers?: Record<string, string>) =>
    send(who, 'POST', '/study-rooms', { name: '새벽 공부', map: 'cafe', capacity: 10, tag_ids: [], ...body }, headers);
  const createOk = async (who: TestSession, body: Record<string, unknown> = {}) => {
    const res = await create(who, body);
    expect(res.statusCode, res.body).toBe(201);
    return res.json().data as { room: { id: string } & Record<string, unknown>; members: unknown[] | null; password: string | null };
  };
  const join = (who: TestSession, roomId: string, body: Record<string, unknown> = {}) =>
    send(who, 'POST', `/study-rooms/${roomId}/join`, body);
  const get = (who: TestSession, roomId: string) => send(who, 'GET', `/study-rooms/${roomId}`);
  const list = (who: TestSession, query: string) => send(who, 'GET', `/study-rooms?${query}`);

  beforeAll(async () => {
    app = await createTestApp({ env: { ROOM_CREATE_PER_IP_PER_DAY: '3' } });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase(app);
    await seedTags(app.db);
    catalog = await listCatalog(app.db);
  });

  describe('POST /study-rooms (만들기)', () => {
    it('만든 사람이 방장 겸 첫 멤버이고 방장 상세를 돌려준다', async () => {
      const host = await person();
      const res = await create(host, {
        name: '  새벽 공부  ',
        description: '  같이 해요\n매일  ',
        password: 'Study1',
        tag_ids: [tagId('코딩'), tagId('수능')],
      });
      expect(res.statusCode).toBe(201);
      expectContract('/study-rooms', 'post', 201, res.json());
      const { room, members, password } = res.json().data;
      expect(room).toMatchObject({
        name: '새벽 공부',
        description: '같이 해요\n매일',
        has_password: true,
        capacity: 10,
        map: 'cafe',
        member_count: 1,
        studying_count: 0,
        is_member: true,
        is_host: true,
        banner: null,
        logo: null,
      });
      expect(room.tags.map((t: TagView) => t.name)).toEqual(['수능', '코딩']);
      expect(password).toBe('Study1');
      expect(members).toHaveLength(1);
      expect(members[0]).toMatchObject({ user_id: host.userId, is_host: true });
    });

    it('비밀번호는 평문으로 저장하지 않는다', async () => {
      const host = await person();
      const { room } = await createOk(host, { password: 'Study1' });
      const [row] = await app.db.select().from(studyRooms).where(eq(studyRooms.id, room.id));
      expect(JSON.stringify(row)).not.toContain('Study1');
    });

    it('소개가 비거나 공백뿐이면 null', async () => {
      const host = await person();
      const { room } = await createOk(host, { description: '   ' });
      expect(room.description).toBeNull();
    });

    it('입력 규칙을 어기면 422와 field', async () => {
      const host = await person();
      const cases: [Record<string, unknown>, string][] = [
        [{ name: '   ' }, 'name'],
        [{ name: '가'.repeat(41) }, 'name'],
        [{ description: '가'.repeat(101) }, 'description'],
        [{ capacity: 1 }, 'capacity'],
        [{ capacity: 34 }, 'capacity'],
        [{ capacity: 2.5 }, 'capacity'],
        [{ password: 'abc' }, 'password'],
        [{ password: '비밀번호1234' }, 'password'],
        [{ tag_ids: [tagId('수능'), tagId('내신'), tagId('토익'), tagId('코딩')] }, 'tag_ids'],
        [{ tag_ids: [randomUUID()] }, 'tag_ids'],
        [{ map: 'moon' }, 'map'],
        [{ extra: 1 }, 'extra'],
      ];
      for (const [body, field] of cases) {
        const res = await create(host, body);
        expect(res.statusCode, JSON.stringify(body)).toBe(422);
        expect(res.json().error.details.field, JSON.stringify(body)).toBe(field);
      }
      expect(await count(app, 'study_rooms')).toBe(0);
    });

    it('이름·소개에 금칙어가 있으면 422', async () => {
      const host = await person();
      const name = await create(host, { name: '씨 발 공부방' });
      expect(name.statusCode).toBe(422);
      expect(name.json().error.details.field).toBe('name');
      const description = await create(host, { description: 'ㅅㅂ 시발' });
      expect(description.statusCode).toBe(422);
      expect(description.json().error.details.field).toBe('description');
    });

    it('안 산 유료 맵이면 403 STUDY_ROOM_MAP_NOT_OWNED', async () => {
      const host = await person();
      const res = await create(host, { map: 'library' });
      expect(res.statusCode).toBe(403);
      expectContract('/study-rooms', 'post', 403, res.json());
      expect(res.json().error.code).toBe('STUDY_ROOM_MAP_NOT_OWNED');
    });

    it('이미 다른 방 멤버면 409 STUDY_ROOM_ALREADY_MEMBER(그 방 id·방장 여부)', async () => {
      const host = await person();
      const { room } = await createOk(host);
      const again = await create(host, { name: '두 번째' });
      expect(again.statusCode).toBe(409);
      expectContract('/study-rooms', 'post', 409, again.json());
      expect(again.json().error).toMatchObject({ code: 'STUDY_ROOM_ALREADY_MEMBER', details: { room_id: room.id, is_host: true } });

      const member = await person();
      expect((await join(member, room.id)).statusCode).toBe(200);
      const fromMember = await create(member);
      expect(fromMember.json().error).toMatchObject({ code: 'STUDY_ROOM_ALREADY_MEMBER', details: { room_id: room.id, is_host: false } });
      expect(await count(app, 'study_rooms')).toBe(1);
    });

    it('같은 키 재전송은 방을 하나만 만들고, 재전송 응답에는 비밀번호가 없다', async () => {
      const host = await person();
      const headers = withKey(host);
      const first = await create(host, { password: 'Study1' }, headers);
      const again = await create(host, { password: 'Study1' }, headers);
      expect(again.statusCode).toBe(201);
      expect(again.headers['idempotent-replayed']).toBe('true');
      expectContract('/study-rooms', 'post', 201, again.json());
      expect(again.json().data.room.id).toBe(first.json().data.room.id);
      expect(first.json().data.password).toBe('Study1');
      expect(again.json().data.password).toBeNull();
      expect(await count(app, 'study_rooms')).toBe(1);
      expect(await count(app, 'idempotency_keys', `response_body like '%Study1%'`)).toBe(0);
    });

    it('키가 없으면 400, 세션이 없으면 401', async () => {
      const host = await person();
      const { 'idempotency-key': _omit, ...noKey } = withKey(host);
      expect((await create(host, {}, noKey)).statusCode).toBe(400);
      const anonymous = await app.inject({ method: 'POST', url: '/study-rooms', payload: '{}', headers: { 'content-type': 'application/json' } });
      expect(anonymous.statusCode).toBe(401);
    });

    it('긴급 스위치가 꺼져 있으면 503 ROOM_CREATE_DISABLED', async () => {
      await writeSetting(app.db, 'room_create_enabled', 'false');
      const off = await createTestApp({ env: { SETTINGS_CACHE_MS: '0' } });
      try {
        const host = await startAnonymous(off);
        const res = await off.inject({
          method: 'POST',
          url: '/study-rooms',
          headers: withKey(host),
          payload: JSON.stringify({ name: '방', map: 'cafe', capacity: 10, tag_ids: [] }),
        });
        expect(res.statusCode).toBe(503);
        expectContract('/study-rooms', 'post', 503, res.json());
        expect(res.json().error.code).toBe('ROOM_CREATE_DISABLED');
      } finally {
        await off.close();
      }
    });

    it('계정이나 IP의 방 만들기 정지면 403 ROOM_CREATE_RESTRICTED', async () => {
      const until = new Date(Date.now() + 3600_000);
      const restricted = await person();
      await restrictUser(app.db, { userId: restricted.userId, kind: 'room_create', until, reason: '도배' });
      const byUser = await create(restricted);
      expect(byUser.statusCode).toBe(403);
      expectContract('/study-rooms', 'post', 403, byUser.json());
      expect(byUser.json().error.code).toBe('ROOM_CREATE_RESTRICTED');

      await restrictIp(app.db, { ip: '192.0.2.50', kind: 'room_create', until, reason: '도배' });
      const fromIp = await startAnonymous(app, { remoteAddress: '192.0.2.50' });
      const res = await app.inject({
        method: 'POST',
        url: '/study-rooms',
        remoteAddress: '192.0.2.50',
        headers: withKey(fromIp),
        payload: JSON.stringify({ name: '방', map: 'cafe', capacity: 10, tag_ids: [] }),
      });
      expect(res.json().error.code).toBe('ROOM_CREATE_RESTRICTED');
      expect(await count(app, 'study_rooms')).toBe(0);
    });

    it('같은 IP에서 하루 상한(ROOM_CREATE_PER_IP_PER_DAY)을 넘으면 429', async () => {
      const ip = '192.0.2.60';
      const results: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const who = await startAnonymous(app, { remoteAddress: ip });
        const res = await app.inject({
          method: 'POST',
          url: '/study-rooms',
          remoteAddress: ip,
          headers: withKey(who),
          payload: JSON.stringify({ name: `방 ${i}`, map: 'cafe', capacity: 10, tag_ids: [] }),
        });
        results.push(res.statusCode);
        if (res.statusCode === 429) {
          expectContract('/study-rooms', 'post', 429, res.json());
          expect(res.json().error.code).toBe('ROOM_CREATE_RATE_LIMITED');
          expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
        }
      }
      expect(results).toEqual([201, 201, 201, 429]);
    });
  });

  describe('GET /study-rooms/{id} (상세)', () => {
    it('멤버가 아니면 명단·비밀번호 없이, 멤버면 명단(방장 먼저), 방장만 비밀번호', async () => {
      const host = await person();
      const { room } = await createOk(host, { password: 'Study1' });
      const member = await person();
      expect((await join(member, room.id, { password: 'Study1' })).statusCode).toBe(200);
      const outsider = await person();

      const preview = await get(outsider, room.id);
      expect(preview.statusCode).toBe(200);
      expectContract('/study-rooms/{room_id}', 'get', 200, preview.json());
      expect(preview.json().data).toMatchObject({ members: null, password: null, room: { is_member: false, is_host: false, member_count: 2 } });

      const asMember = await get(member, room.id);
      expectContract('/study-rooms/{room_id}', 'get', 200, asMember.json());
      expect(asMember.json().data.password).toBeNull();
      expect(asMember.json().data.members.map((m: { user_id: string }) => m.user_id)).toEqual([host.userId, member.userId]);

      const asHost = await get(host, room.id);
      expect(asHost.json().data.password).toBe('Study1');
    });

    it('명단에는 그 사람의 공개 태그가 실린다', async () => {
      const host = await person();
      await send(host, 'PUT', '/users/me/tags', { tag_ids: [tagId('토익')] });
      const { room } = await createOk(host);
      const res = await get(host, room.id);
      expect(res.json().data.members[0].tags.map((t: TagView) => t.name)).toEqual(['토익']);
    });

    it('없는 방·형식이 틀린 id는 404', async () => {
      const who = await person();
      for (const id of [randomUUID(), 'abc']) {
        const res = await get(who, id);
        expect(res.statusCode).toBe(404);
        expectContract('/study-rooms/{room_id}', 'get', 404, res.json());
      }
    });

    it('studying_count는 서버가 presence로 본 지금 공부 중인 멤버 수다', async () => {
      const host = await person();
      const { room } = await createOk(host);
      const start = await send(host, 'POST', '/study/active-session/start', { subject: null, timezone: 'Asia/Seoul' });
      expect(start.statusCode, start.body).toBe(201);
      expect((await get(host, room.id)).json().data.room.studying_count).toBe(1); // 시작도 관측 신호다
      // 마지막 관측이 끊김 기준(75초)보다 오래면 공부 중으로 보지 않는다.
      await app.db.execute(sql`update presence_spans set started_at = now() - interval '3 minutes', ended_at = now() - interval '2 minutes'`);
      expect((await get(host, room.id)).json().data.room.studying_count).toBe(0);
      const presence = await send(host, 'PUT', '/study/presence', { session_id: start.json().data.session.id });
      expect(presence.statusCode, presence.body).toBeLessThan(300);
      expect((await get(host, room.id)).json().data.room.studying_count).toBe(1);
      const paused = await send(host, 'POST', `/study/active-session/${start.json().data.session.id}/pause`);
      expect(paused.statusCode).toBe(200);
      expect((await get(host, room.id)).json().data.room.studying_count).toBe(0); // 일시정지는 공부 중이 아니다
    });
  });

  describe('GET /study-rooms (목록)', () => {
    it('all은 최신 순, mine은 내 방만, q는 이름 검색', async () => {
      const a = await person();
      const b = await person();
      const first = await createOk(a, { name: '새벽 수학' });
      const second = await createOk(b, { name: '밤 영어', password: 'Study1' });

      const all = await list(a, 'scope=all');
      expect(all.statusCode).toBe(200);
      expectContract('/study-rooms', 'get', 200, all.json());
      expect(all.json().data.rooms.map((r: { id: string }) => r.id)).toEqual([second.room.id, first.room.id]);
      expect(JSON.stringify(all.json())).not.toContain('Study1');

      const mine = await list(a, 'scope=mine');
      expect(mine.json().data.rooms.map((r: { id: string }) => r.id)).toEqual([first.room.id]);
      expect(mine.json().data.rooms[0]).toMatchObject({ is_member: true, is_host: true });

      const found = await list(a, `scope=all&q=${encodeURIComponent('  영어 ')}`);
      expect(found.json().data.rooms.map((r: { id: string }) => r.id)).toEqual([second.room.id]);
      const pct = await list(a, `scope=all&q=${encodeURIComponent('%')}`);
      expect(pct.json().data.rooms).toEqual([]);
    });

    it('recommended는 내 태그와 겹치는 방만, 겹친 수 → 최신 순, 비밀번호 방 포함', async () => {
      const me = await person();
      const r1 = await createOk(await person(), { name: '하나', tag_ids: [tagId('수능')] });
      const r2 = await createOk(await person(), { name: '둘', tag_ids: [tagId('수능'), tagId('코딩')], password: 'Study1' });
      const r3 = await createOk(await person(), { name: '셋', tag_ids: [tagId('수능')] });
      await createOk(await person(), { name: '겹침 없음', tag_ids: [tagId('토익')] });

      const none = await list(me, 'scope=recommended');
      expect(none.json().data.rooms).toEqual([]); // 내 태그가 없으면 빈 목록

      await send(me, 'PUT', '/users/me/tags', { tag_ids: [tagId('수능'), tagId('코딩')] });
      const res = await list(me, 'scope=recommended');
      expectContract('/study-rooms', 'get', 200, res.json());
      expect(res.json().data.rooms.map((r: { id: string }) => r.id)).toEqual([r2.room.id, r3.room.id, r1.room.id]);
    });

    it('scope가 없거나 틀렸거나 q가 공백뿐이면 422', async () => {
      const who = await person();
      for (const query of ['', 'scope=friends', 'scope=all&q=%20%20', `scope=all&q=${'가'.repeat(41)}`]) {
        const res = await list(who, query);
        expect(res.statusCode, query).toBe(422);
      }
    });
  });

  describe('POST /study-rooms/{id}/join (참여)', () => {
    it('누구나 방은 바로 참여하고, 이미 멤버면 다시 보내도 성공', async () => {
      const { room } = await createOk(await person());
      const me = await person();
      const res = await join(me, room.id);
      expect(res.statusCode).toBe(200);
      expectContract('/study-rooms/{room_id}/join', 'post', 200, res.json());
      expect(res.json().data.room).toMatchObject({ is_member: true, is_host: false, member_count: 2 });
      expect(res.json().data.members).toHaveLength(2);
      expect((await join(me, room.id)).statusCode).toBe(200);
      expect(await count(app, 'study_room_members')).toBe(2);
    });

    it('비밀번호가 없거나 틀리면 403(대소문자 구분), 맞으면 참여, 멤버는 비밀번호 없이 다시', async () => {
      const { room } = await createOk(await person(), { password: 'Study1' });
      const me = await person();
      for (const body of [{}, { password: 'study1' }, { password: 'Wrong1' }]) {
        const res = await join(me, room.id, body);
        expect(res.statusCode).toBe(403);
        expectContract('/study-rooms/{room_id}/join', 'post', 403, res.json());
        expect(res.json().error.code).toBe('STUDY_ROOM_WRONG_PASSWORD');
      }
      expect((await join(me, room.id, { password: 'Study1' })).statusCode).toBe(200);
      expect((await join(me, room.id)).statusCode).toBe(200);
    });

    it('정원이 차면 409 STUDY_ROOM_FULL', async () => {
      const { room } = await createOk(await person(), { capacity: 2 });
      expect((await join(await person(), room.id)).statusCode).toBe(200);
      const res = await join(await person(), room.id);
      expect(res.statusCode).toBe(409);
      expectContract('/study-rooms/{room_id}/join', 'post', 409, res.json());
      expect(res.json().error.code).toBe('STUDY_ROOM_FULL');
    });

    it('동시에 여럿이 마지막 자리에 참여해도 정원을 넘지 않는다', async () => {
      const { room } = await createOk(await person(), { capacity: 3 });
      const people = await Promise.all(Array.from({ length: 6 }, () => person()));
      const results = await Promise.all(people.map((p) => join(p, room.id)));
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes.filter((c) => c === 200)).toHaveLength(2);
      expect(codes.filter((c) => c === 409)).toHaveLength(4);
      expect(await count(app, 'study_room_members', `room_id = '${room.id}'`)).toBe(3);
    });

    it('한 사람이 동시에 두 방에 참여해도 한 방에만 들어간다', async () => {
      const x = await createOk(await person());
      const y = await createOk(await person());
      const me = await person();
      const results = await Promise.all([join(me, x.room.id), join(me, y.room.id)]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect(await count(app, 'study_room_members', `user_id = '${me.userId}'`)).toBe(1);
    });

    it('다른 방 멤버면 409, leave_current_room이면 옮긴다(방장이었으면 그 방은 삭제)', async () => {
      const x = await createOk(await person());
      const me = await person();
      const mine = await createOk(me, { name: '내 방' });
      const blocked = await join(me, x.room.id);
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error).toMatchObject({ code: 'STUDY_ROOM_ALREADY_MEMBER', details: { room_id: mine.room.id, is_host: true } });

      const moved = await join(me, x.room.id, { leave_current_room: true });
      expect(moved.statusCode).toBe(200);
      expect(moved.json().data.room.is_member).toBe(true);
      expect(await count(app, 'study_rooms', `id = '${mine.room.id}'`)).toBe(0);
    });

    it('옮기려는 방의 비밀번호가 틀리거나 꽉 찼으면 지금 방은 그대로다', async () => {
      const locked = await createOk(await person(), { password: 'Study1' });
      const full = await createOk(await person(), { capacity: 2 });
      expect((await join(await person(), full.room.id)).statusCode).toBe(200);
      const me = await person();
      const mine = await createOk(me, { name: '내 방' });

      const wrong = await join(me, locked.room.id, { leave_current_room: true, password: 'Wrong1' });
      expect(wrong.json().error.code).toBe('STUDY_ROOM_WRONG_PASSWORD');
      const crowded = await join(me, full.room.id, { leave_current_room: true });
      expect(crowded.json().error.code).toBe('STUDY_ROOM_FULL');
      expect((await get(me, mine.room.id)).json().data.room.is_host).toBe(true);
    });

    it('없는 방은 404, 형식이 틀린 본문은 422', async () => {
      const me = await person();
      expect((await join(me, randomUUID())).statusCode).toBe(404);
      const { room } = await createOk(await person());
      expect((await join(me, room.id, { password: 'a b' })).statusCode).toBe(422);
      expect((await join(me, room.id, { leave_current_room: 'yes' })).statusCode).toBe(422);
    });

    it('참여 시도는 사용자당 시간당 30회까지(틀린 비밀번호 포함)', async () => {
      const { room } = await createOk(await person(), { password: 'Study1' });
      const me = await person();
      for (let i = 0; i < 30; i += 1) expect((await join(me, room.id, { password: 'Wrong1' })).statusCode).toBe(403);
      const res = await join(me, room.id, { password: 'Study1' });
      expect(res.statusCode).toBe(429);
      expectContract('/study-rooms/{room_id}/join', 'post', 429, res.json());
    });
  });

  describe('나가기·삭제·내보내기', () => {
    it('멤버가 나가면 204, 이미 멤버가 아니면(재시도) 204', async () => {
      const { room } = await createOk(await person());
      const me = await person();
      await join(me, room.id);
      expect((await send(me, 'POST', `/study-rooms/${room.id}/leave`)).statusCode).toBe(204);
      expect((await send(me, 'POST', `/study-rooms/${room.id}/leave`)).statusCode).toBe(204);
      expect((await get(me, room.id)).json().data.room).toMatchObject({ is_member: false, member_count: 1 });
    });

    it('방장이 나가면 방이 삭제되고 흔적(멤버·태그·초대)이 남지 않는다', async () => {
      const host = await person();
      const { room } = await createOk(host, { tag_ids: [tagId('수능')] });
      await join(await person(), room.id);
      expect((await send(host, 'POST', `/study-rooms/${room.id}/invite`)).statusCode).toBe(201);
      expect((await send(host, 'POST', `/study-rooms/${room.id}/leave`)).statusCode).toBe(204);
      for (const table of ['study_rooms', 'study_room_members', 'room_tags', 'study_room_invites']) {
        expect(await count(app, table), table).toBe(0);
      }
    });

    it('삭제는 방장만(403 STUDY_ROOM_HOST_ONLY), 삭제하면 흔적이 없고 다시 보내도 204', async () => {
      const host = await person();
      const { room } = await createOk(host, { tag_ids: [tagId('코딩')] });
      const member = await person();
      await join(member, room.id);
      const denied = await send(member, 'DELETE', `/study-rooms/${room.id}`);
      expect(denied.statusCode).toBe(403);
      expectContract('/study-rooms/{room_id}', 'delete', 403, denied.json());
      expect(denied.json().error.code).toBe('STUDY_ROOM_HOST_ONLY');
      expect((await send(await person(), 'DELETE', `/study-rooms/${room.id}`)).statusCode).toBe(403);

      expect((await send(host, 'DELETE', `/study-rooms/${room.id}`)).statusCode).toBe(204);
      expect((await send(host, 'DELETE', `/study-rooms/${room.id}`)).statusCode).toBe(204);
      for (const table of ['study_rooms', 'study_room_members', 'room_tags', 'study_room_invites']) {
        expect(await count(app, table), table).toBe(0);
      }
      expect((await get(member, room.id)).statusCode).toBe(404);
    });

    it('방장은 멤버를 내보내고(차단 아님), 다시 보내도 성공, 자신은 422, 방장 아니면 403', async () => {
      const host = await person();
      const { room } = await createOk(host);
      const member = await person();
      await join(member, room.id);
      const kick = () => send(host, 'DELETE', `/study-rooms/${room.id}/members/${member.userId}`);
      const res = await kick();
      expect(res.statusCode).toBe(200);
      expectContract('/study-rooms/{room_id}/members/{user_id}', 'delete', 200, res.json());
      expect(res.json().data.members.map((m: { user_id: string }) => m.user_id)).toEqual([host.userId]);
      expect((await kick()).statusCode).toBe(200);
      expect((await join(member, room.id)).statusCode).toBe(200); // 다시 참여할 수 있다

      const self = await send(host, 'DELETE', `/study-rooms/${room.id}/members/${host.userId}`);
      expect(self.statusCode).toBe(422);
      const notHost = await send(member, 'DELETE', `/study-rooms/${room.id}/members/${host.userId}`);
      expect(notHost.statusCode).toBe(403);
      expect(notHost.json().error.code).toBe('STUDY_ROOM_HOST_ONLY');
      expect((await send(host, 'DELETE', `/study-rooms/${randomUUID()}/members/${member.userId}`)).statusCode).toBe(404);
    });
  });

  describe('PATCH /study-rooms/{id} (수정)', () => {
    it('보낸 키만 바꾸고 방장 상세를 돌려준다', async () => {
      const host = await person();
      const { room } = await createOk(host, { description: '소개', password: 'Study1', tag_ids: [tagId('수능')] });
      const res = await send(host, 'PATCH', `/study-rooms/${room.id}`, { name: '새 이름', tag_ids: [tagId('코딩')], capacity: 20 });
      expect(res.statusCode).toBe(200);
      expectContract('/study-rooms/{room_id}', 'patch', 200, res.json());
      expect(res.json().data.room).toMatchObject({ name: '새 이름', description: '소개', capacity: 20, has_password: true });
      expect(res.json().data.room.tags.map((t: TagView) => t.name)).toEqual(['코딩']);
      expect(res.json().data.password).toBe('Study1');

      const cleared = await send(host, 'PATCH', `/study-rooms/${room.id}`, { password: null, description: '  ' });
      expect(cleared.json().data.room).toMatchObject({ has_password: false, description: null });
      expect(cleared.json().data.password).toBeNull();
    });

    it('비밀번호를 바꿔도 기존 멤버는 그대로다', async () => {
      const host = await person();
      const { room } = await createOk(host, { password: 'Study1' });
      const member = await person();
      await join(member, room.id, { password: 'Study1' });
      await send(host, 'PATCH', `/study-rooms/${room.id}`, { password: 'Other22' });
      expect((await get(member, room.id)).json().data.room.is_member).toBe(true);
      expect((await join(await person(), room.id, { password: 'Study1' })).statusCode).toBe(403);
    });

    it('방장이 아니면 403, 정원을 멤버 수 아래로는 409, 금칙어·빈 본문·유료 맵은 거절', async () => {
      const host = await person();
      const { room } = await createOk(host, { capacity: 3 });
      const a = await person();
      const b = await person();
      await join(a, room.id);
      await join(b, room.id);

      const notHost = await send(a, 'PATCH', `/study-rooms/${room.id}`, { name: '뺏기' });
      expect(notHost.statusCode).toBe(403);
      expectContract('/study-rooms/{room_id}', 'patch', 403, notHost.json());

      const below = await send(host, 'PATCH', `/study-rooms/${room.id}`, { capacity: 2 });
      expect(below.statusCode).toBe(409);
      expectContract('/study-rooms/{room_id}', 'patch', 409, below.json());
      expect(below.json().error.code).toBe('STUDY_ROOM_CAPACITY_BELOW_MEMBERS');

      expect((await send(host, 'PATCH', `/study-rooms/${room.id}`, { name: '시발방' })).statusCode).toBe(422);
      expect((await send(host, 'PATCH', `/study-rooms/${room.id}`, {})).statusCode).toBe(422);
      const map = await send(host, 'PATCH', `/study-rooms/${room.id}`, { map: 'rooftop' });
      expect(map.json().error.code).toBe('STUDY_ROOM_MAP_NOT_OWNED');
      expect((await send(host, 'PATCH', `/study-rooms/${randomUUID()}`, { name: 'x' })).statusCode).toBe(404);
    });
  });

  describe('초대 링크', () => {
    const issue = (who: TestSession, roomId: string) => send(who, 'POST', `/study-rooms/${roomId}/invite`, undefined, authHeaders(who));
    const tokenOf = (res: LightMyRequestResponse) => {
      const url = new URL(res.json().data.url);
      return url.hash.slice(1);
    };
    const preview = (token: string, who: TestSession | null = null, ip = '203.0.113.10') =>
      app.inject({
        method: 'POST',
        url: '/invites/preview',
        remoteAddress: ip,
        headers: who ? withKey(who) : { 'content-type': 'application/json' },
        payload: JSON.stringify({ token }),
      });

    it('방장이 7일 링크를 받고, 토큰은 다이제스트만 저장한다', async () => {
      const host = await person();
      const { room } = await createOk(host);
      const res = await issue(host, room.id);
      expect(res.statusCode).toBe(201);
      expectContract('/study-rooms/{room_id}/invite', 'post', 201, res.json());
      const url = new URL(res.json().data.url);
      expect(`${url.origin}${url.pathname}`).toBe(`${WEB}/r`);
      const token = tokenOf(res);
      expect(token.length).toBeGreaterThanOrEqual(16);
      const expires = Date.parse(res.json().data.expires_at);
      expect(Math.abs(expires - (Date.now() + 7 * 24 * 3600_000))).toBeLessThan(60_000);
      const [row] = await app.db.select().from(studyRoomInvites).where(eq(studyRoomInvites.roomId, room.id));
      expect(row!.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('방장이 아니면 403, 없는 방은 404', async () => {
      const { room } = await createOk(await person());
      const member = await person();
      await join(member, room.id);
      const res = await issue(member, room.id);
      expect(res.statusCode).toBe(403);
      expectContract('/study-rooms/{room_id}/invite', 'post', 403, res.json());
      expect((await issue(member, randomUUID())).statusCode).toBe(404);
    });

    it('미리보기는 로그인 없이 되고, 새로 만들면 이전 링크는 무효, 만료되면 404', async () => {
      const host = await person();
      const { room } = await createOk(host, { name: '초대방', password: 'Study1' });
      const old = tokenOf(await issue(host, room.id));
      const res = await preview(old);
      expect(res.statusCode).toBe(200);
      expectContract('/invites/preview', 'post', 200, res.json());
      expect(res.json().data).toEqual({
        room_id: room.id,
        name: '초대방',
        map: 'cafe',
        member_count: 1,
        capacity: 10,
        has_password: true,
        is_member: false,
      });
      expect((await preview(old, host)).json().data.is_member).toBe(true);

      const fresh = tokenOf(await issue(host, room.id));
      const stale = await preview(old);
      expect(stale.statusCode).toBe(404);
      expectContract('/invites/preview', 'post', 404, stale.json());
      expect((await preview(fresh)).statusCode).toBe(200);

      await app.db.update(studyRoomInvites).set({ expiresAt: new Date(Date.now() - 1000) });
      expect((await preview(fresh)).statusCode).toBe(404);
      expect((await preview('x'.repeat(40))).statusCode).toBe(404);
      expect((await preview('short')).statusCode).toBe(422);
    });

    it('미리보기는 같은 IP 기준 시간당 60회까지', async () => {
      for (let i = 0; i < 60; i += 1) expect((await preview('y'.repeat(40), null, '203.0.113.77')).statusCode).toBe(404);
      const res = await preview('y'.repeat(40), null, '203.0.113.77');
      expect(res.statusCode).toBe(429);
      expectContract('/invites/preview', 'post', 429, res.json());
    });

    it('수락은 참여와 같다(비밀번호 필요, 멱등 기록에 토큰이 남지 않음)', async () => {
      const host = await person();
      const { room } = await createOk(host, { password: 'Study1' });
      const token = tokenOf(await issue(host, room.id));
      const me = await person();
      const accept = (body: Record<string, unknown>) => send(me, 'POST', '/invites/accept', { token, ...body });

      const wrong = await accept({});
      expect(wrong.statusCode).toBe(403);
      expectContract('/invites/accept', 'post', 403, wrong.json());
      const ok = await accept({ password: 'Study1' });
      expect(ok.statusCode).toBe(200);
      expectContract('/invites/accept', 'post', 200, ok.json());
      expect(ok.json().data.room).toMatchObject({ id: room.id, is_member: true });
      expect(await count(app, 'idempotency_keys', `response_body like '%${token}%'`)).toBe(0);

      const bad = await send(me, 'POST', '/invites/accept', { token: 'z'.repeat(40) });
      expect(bad.statusCode).toBe(404);
      const anonymous = await app.inject({
        method: 'POST',
        url: '/invites/accept',
        headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        payload: JSON.stringify({ token }),
      });
      expect(anonymous.statusCode).toBe(401);
    });
  });

  describe('방 이름 신고', () => {
    const reportRoom = (who: TestSession, roomId: string) =>
      send(who, 'POST', '/reports', { target_type: 'room_name', target_id: roomId, reason: 'profanity' });

    it('서로 다른 세 사람이 신고하면 방 이름이 "<방장 닉네임>의 공부방"으로 바뀐다', async () => {
      const host = await person();
      const { room } = await createOk(host, { name: '나쁜 방 이름' });
      const [hostRow] = await app.db.select().from(users).where(eq(users.id, host.userId));
      const first = await reportRoom(await person(), room.id);
      expect(first.statusCode).toBe(200);
      expectContract('/reports', 'post', 200, first.json());
      expect(first.json().data.report).toMatchObject({ target_type: 'room_name', target_id: room.id });
      await reportRoom(await person(), room.id);
      expect((await get(host, room.id)).json().data.room.name).toBe('나쁜 방 이름');
      await reportRoom(await person(), room.id);
      expect((await get(host, room.id)).json().data.room.name).toBe(`${hostRow!.nickname}의 공부방`);
      expect(await count(app, 'reports', `action = 'room_name_reset'`)).toBe(3);
    });

    it('내 방은 422, 없는 방은 404', async () => {
      const host = await person();
      const { room } = await createOk(host);
      expect((await reportRoom(host, room.id)).statusCode).toBe(422);
      expect((await reportRoom(host, randomUUID())).statusCode).toBe(404);
    });
  });

  describe('계정 지우기', () => {
    it('방장이 계정을 지우면 방이 없어지고, 멤버가 지우면 그 자리만 빠진다', async () => {
      const host = await person();
      const hosted = await createOk(host, { tag_ids: [tagId('수능')] });
      const member = await person();
      await join(member, hosted.room.id);
      const other = await createOk(await person());
      const leaver = await person();
      await join(leaver, other.room.id);

      expect((await send(leaver, 'DELETE', '/users/me', undefined, authHeaders(leaver))).statusCode).toBe(204);
      expect((await get(member, other.room.id)).json().data.room.member_count).toBe(1);

      expect((await send(host, 'DELETE', '/users/me', undefined, authHeaders(host))).statusCode).toBe(204);
      expect(await count(app, 'study_rooms', `id = '${hosted.room.id}'`)).toBe(0);
      expect(await count(app, 'study_room_members', `user_id = '${member.userId}'`)).toBe(0);
      expect(await count(app, 'room_tags')).toBe(0);
    });
  });

  describe('커밋 뒤 알림(L5 실시간 이벤트 자리)', () => {
    it('참여·수정·내보내기·나가기·삭제를 커밋 뒤에 알린다', async () => {
      const seen: RoomChange[] = [];
      const off = app.rooms.onChange((change) => seen.push(change));
      try {
        const host = await person();
        const { room } = await createOk(host);
        const a = await person();
        const b = await person();
        await join(a, room.id);
        await join(b, room.id);
        await send(host, 'PATCH', `/study-rooms/${room.id}`, { name: '바뀐 이름' });
        await send(host, 'DELETE', `/study-rooms/${room.id}/members/${a.userId}`);
        await send(b, 'POST', `/study-rooms/${room.id}/leave`);
        await send(host, 'DELETE', `/study-rooms/${room.id}`);
        expect(seen.map((c) => (c.type === 'member_left' ? `${c.type}:${c.reason}` : c.type))).toEqual([
          'room_created',
          'member_joined',
          'member_joined',
          'room_updated',
          'member_left:removed',
          'member_left:left',
          'room_deleted',
        ]);
        expect(seen.every((c) => c.roomId === room.id)).toBe(true);
      } finally {
        off();
      }
    });
  });

  it('CLI tags merge는 방 태그도 옮긴다', async () => {
    await runCli(['tags', 'add', 'kind', '코딩 공부'], { db: app.db, now: () => new Date(), out: () => {}, err: () => {} });
    catalog = await listCatalog(app.db);
    const host = await person();
    const { room } = await createOk(host, { tag_ids: [tagId('코딩 공부')] });
    const code = await runCli(['tags', 'merge', '코딩 공부', '코딩'], {
      db: app.db,
      now: () => new Date(),
      out: () => {},
      err: () => {},
      moveTagRefs: moveRoomTagRefs,
    });
    expect(code).toBe(0);
    expect((await get(host, room.id)).json().data.room.tags.map((t: TagView) => t.name)).toEqual(['코딩']);
  });
});
