import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { chatBlocks, chatMessages } from '../src/db/schema.js';
import { purgeExpired } from '../src/maintenance.js';
import { restrictIp, restrictUser } from '../src/moderation/restrictions.js';
import { writeSetting } from '../src/moderation/settings.js';
import { runCli } from '../src/ops/commands.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { authHeaders, startAnonymous, withKey, type TestSession } from './helpers/session.js';
import { listen, TestSocket } from './helpers/socket.js';

describe('공부방 채팅', () => {
  let app: FastifyInstance;
  let url: string;
  let clock = Date.parse('2026-11-24T03:00:00.000Z');
  let ipSeq = 0;
  const open: TestSocket[] = [];
  /** 사람마다 다른 IP(TRUST_PROXY + X-Forwarded-For). IP 쓰기 제한이 다른 테스트를 막지 않게. */
  const ipOf = new Map<string, string>();

  const person = async (ip?: string): Promise<TestSession> => {
    const address = ip ?? `198.51.100.${++ipSeq}`;
    const session = await startAnonymous(app, { remoteAddress: address });
    ipOf.set(session.userId, address);
    return session;
  };
  const connect = async (who: TestSession) => {
    const socket = TestSocket.connect(url, { cookie: who.cookie, forwardedFor: ipOf.get(who.userId) });
    open.push(socket);
    return socket.opened();
  };
  const say = (socket: TestSocket, topic: string, body: string, clientId: string = randomUUID()) => {
    socket.send({ type: 'send', topic, client_id: clientId, body });
    return clientId;
  };
  /** 보낸 사람이 자기 메시지(또는 오류)를 받을 때까지. */
  const sayAndWait = async (socket: TestSocket, topic: string, body: string, clientId?: string) => {
    const id = say(socket, topic, body, clientId);
    const event = await socket.until((e) => (e.type === 'message' && e.message.client_id === id) || (e.type === 'error' && e.client_id === id));
    clock += 1000; // 메시지마다 다른 시각(목록 순서)
    return event;
  };
  const http = (who: TestSession, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, payload?: unknown) =>
    app.inject({
      method,
      url: path,
      remoteAddress: ipOf.get(who.userId),
      headers: method === 'GET' ? authHeaders(who) : withKey(who),
      ...(payload === undefined ? {} : { payload: JSON.stringify(payload) }),
    });
  const createRoom = async (host: TestSession) => {
    const res = await http(host, 'POST', '/study-rooms', { name: '새벽 공부', map: 'cafe', capacity: 10, tag_ids: [] });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().data.room.id as string;
  };
  const report = (who: TestSession, messageId: string) =>
    http(who, 'POST', '/reports', { target_type: 'message', target_id: messageId, reason: 'profanity' });

  beforeAll(async () => {
    app = await createTestApp({ now: () => new Date(clock), env: { TRUST_PROXY: 'true' } });
    url = await listen(app);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    for (const socket of open.splice(0)) socket.close();
    await resetDatabase(app);
    clock += 60 * 60 * 1000; // 이전 테스트의 쓰기 제한 창 밖으로
  });

  describe('토픽', () => {
    it('방 토픽은 멤버만 들어가고 쓴다(아니면 FORBIDDEN, 저장 안 함)', async () => {
      const host = await person();
      const stranger = await person();
      const roomId = await createRoom(host);
      const socket = await connect(stranger);
      expect(await socket.join(`room:${roomId}`)).toEqual([{ type: 'error', topic: `room:${roomId}`, client_id: null, code: 'FORBIDDEN' }]);
      const sent = await sayAndWait(socket, `room:${roomId}`, '안녕');
      expect(sent).toMatchObject({ type: 'error', code: 'FORBIDDEN' });
      // 없는 방도 같다(있는지 드러내지 않는다).
      expect(await socket.join(`room:${randomUUID()}`)).toMatchObject([{ type: 'error', code: 'FORBIDDEN' }]);
      expect(await app.db.select().from(chatMessages)).toEqual([]);
    });

    it('방 멤버는 room_state 다음 joined를 받는다', async () => {
      const host = await person();
      const roomId = await createRoom(host);
      const socket = await connect(host);
      const events = await socket.join(`room:${roomId}`);
      expect(events.map((e) => e.type)).toEqual(['room_state', 'joined']);
    });

    it('다른 토픽에 들어가면 앞 토픽의 메시지는 더 오지 않는다', async () => {
      const a = await person();
      const b = await person();
      const roomId = await createRoom(a);
      const sa = await connect(a);
      const sb = await connect(b);
      await sa.join('lobby');
      await sb.join('lobby');
      await sa.join(`room:${roomId}`);
      await sayAndWait(sb, 'lobby', '로비 메시지');
      say(sa, `room:${roomId}`, '방 메시지');
      // a가 바로 다음에 받은 것은 자기 방 메시지다(로비 메시지는 오지 않았다).
      expect((await sa.next()).message.body).toBe('방 메시지');
    });
  });

  describe('보내기', () => {
    it('토픽의 모든 사람(보낸 사람 포함)에게 가고, 앞뒤 공백을 지워 저장한다', async () => {
      const a = await person();
      const b = await person();
      const sa = await connect(a);
      const sb = await connect(b);
      await sa.join('lobby');
      await sb.join('lobby');
      const clientId = randomUUID();
      const mine = await sayAndWait(sa, 'lobby', '  안녕하세요  ', clientId);
      expect(mine).toMatchObject({ type: 'message', topic: 'lobby', message: { client_id: clientId, body: '안녕하세요', author: { id: a.userId } } });
      expect(await sb.next()).toEqual(mine);
    });

    it('길이가 1–200자가 아니거나 client_id가 UUID가 아니면 INVALID(저장 안 함)', async () => {
      const a = await person();
      const sa = await connect(a);
      await sa.join('lobby');
      expect(await sayAndWait(sa, 'lobby', '   ')).toMatchObject({ type: 'error', code: 'INVALID' });
      expect(await sayAndWait(sa, 'lobby', '가'.repeat(201))).toMatchObject({ type: 'error', code: 'INVALID' });
      sa.send({ type: 'send', topic: 'lobby', client_id: 'x', body: '안녕' });
      expect(await sa.next()).toEqual({ type: 'error', topic: 'lobby', client_id: 'x', code: 'INVALID' });
      expect(await sayAndWait(sa, 'lobby', '가'.repeat(200))).toMatchObject({ type: 'message' });
      expect(await app.db.select().from(chatMessages)).toHaveLength(1);
    });

    it('다시 연결해 같은 client_id로 보내면 새로 저장하지 않고 같은 메시지를 다시 알린다', async () => {
      const a = await person();
      const first = await connect(a);
      await first.join('lobby');
      const clientId = randomUUID();
      const original = await sayAndWait(first, 'lobby', '한 번만', clientId);
      first.close();
      await first.closedWithin();

      const again = await connect(a);
      const joined = await again.join('lobby');
      expect(joined.at(-1)!.messages.map((m: { id: string }) => m.id)).toEqual([original.message.id]);
      const resent = await sayAndWait(again, 'lobby', '한 번만', clientId);
      expect(resent.message).toEqual(original.message);
      expect(await app.db.select().from(chatMessages)).toHaveLength(1);
    });

    it('사용자당 10초에 5개를 넘으면 RATE_LIMITED, 10초 뒤 다시 쓸 수 있다', async () => {
      const a = await person();
      const sa = await connect(a);
      await sa.join('lobby');
      for (let i = 0; i < 5; i += 1) {
        say(sa, 'lobby', `메시지 ${i}`);
        expect(await sa.next()).toMatchObject({ type: 'message' });
      }
      expect(await sayAndWait(sa, 'lobby', '여섯 번째')).toMatchObject({ type: 'error', code: 'RATE_LIMITED' });
      clock += 10_000;
      expect(await sayAndWait(sa, 'lobby', '이제 됨')).toMatchObject({ type: 'message' });
    });

    it('IP당으로도 10초에 5개(같은 IP의 다른 사람과 합친다)', async () => {
      const a = await person('203.0.113.9');
      const b = await person('203.0.113.9');
      const sa = await connect(a);
      const sb = await connect(b);
      await sa.join('lobby');
      await sb.join('lobby');
      for (let i = 0; i < 3; i += 1) {
        say(sa, 'lobby', `a ${i}`);
        await sa.until((e) => e.type === 'message' && e.message.author.id === a.userId);
      }
      for (let i = 0; i < 2; i += 1) {
        say(sb, 'lobby', `b ${i}`);
        await sb.until((e) => e.type === 'message' && e.message.author.id === b.userId);
      }
      expect(await sayAndWait(sb, 'lobby', 'b 2')).toMatchObject({ type: 'error', code: 'RATE_LIMITED' });
    });

    it('링크·금칙어·5분 안 연속 같은 글은 막는다', async () => {
      const a = await person();
      const sa = await connect(a);
      await sa.join('lobby');
      for (const link of ['https://example.com 와봐', 'www.example.org', '여기 open.kakao.com/o/abc', 'naver . com 검색', 'ｅｘａｍｐｌｅ．ｃｏｍ']) {
        expect(await sayAndWait(sa, 'lobby', link), link).toMatchObject({ type: 'error', code: 'LINK_NOT_ALLOWED' });
        clock += 10_000;
      }
      expect(await sayAndWait(sa, 'lobby', '1.5시간 했어요')).toMatchObject({ type: 'message' });
      expect(await sayAndWait(sa, 'lobby', '씨 발')).toMatchObject({ type: 'error', code: 'BANNED_WORD' });
      expect(await sayAndWait(sa, 'lobby', '같은 말')).toMatchObject({ type: 'message' });
      expect(await sayAndWait(sa, 'lobby', '같은  말!')).toMatchObject({ type: 'error', code: 'REPEATED' });
      clock += 5 * 60 * 1000 + 1;
      expect(await sayAndWait(sa, 'lobby', '같은 말')).toMatchObject({ type: 'message' });
    });

    it('채팅 쓰기 스위치를 끄면 CHAT_DISABLED, 계정·IP 채팅 정지면 RESTRICTED', async () => {
      const a = await person();
      const b = await person();
      const c = await person();
      const sa = await connect(a);
      const sb = await connect(b);
      const sc = await connect(c);
      for (const s of [sa, sb, sc]) await s.join('lobby');

      await writeSetting(app.db, 'chat_write_enabled', 'false');
      clock += 60_000; // 설정 캐시
      expect(await sayAndWait(sa, 'lobby', '안녕')).toMatchObject({ type: 'error', code: 'CHAT_DISABLED' });
      await writeSetting(app.db, 'chat_write_enabled', 'true');
      clock += 60_000;

      const until = new Date(clock + 24 * 60 * 60 * 1000);
      await restrictUser(app.db, { userId: b.userId, kind: 'chat', until, reason: '테스트' });
      await restrictIp(app.db, { ip: ipOf.get(c.userId)!, kind: 'chat', until, reason: '테스트' });
      expect(await sayAndWait(sb, 'lobby', '안녕')).toMatchObject({ type: 'error', code: 'RESTRICTED' });
      expect(await sayAndWait(sc, 'lobby', '안녕')).toMatchObject({ type: 'error', code: 'RESTRICTED' });
      expect(await sayAndWait(sa, 'lobby', '안녕')).toMatchObject({ type: 'message' });
      expect(await app.db.select().from(chatMessages)).toHaveLength(1);
    });
  });

  describe('보관', () => {
    it('30일 지난 메시지는 joined에 오지 않고 정리 잡이 지운다', async () => {
      const a = await person();
      const sa = await connect(a);
      await sa.join('lobby');
      await sayAndWait(sa, 'lobby', '옛날 메시지');
      clock += 30 * 24 * 60 * 60 * 1000 + 1000;
      await sayAndWait(sa, 'lobby', '새 메시지');
      const again = await connect(a);
      const joined = (await again.join('lobby')).at(-1)!;
      expect(joined.messages.map((m: { body: string }) => m.body)).toEqual(['새 메시지']);
      // 정리 잡은 DB 시각(now())으로 30일을 본다: 오래된 행 시각을 옮겨 확인한다.
      await app.db.update(chatMessages).set({ createdAt: sql`now() - interval '31 days'` }).where(eq(chatMessages.body, '옛날 메시지'));
      expect((await purgeExpired(app.db)).chatMessages).toBe(1);
      expect((await app.db.select().from(chatMessages)).map((m) => m.body)).toEqual(['새 메시지']);
    });

    it('최근 50개만 오래된 것부터', async () => {
      const a = await person();
      await app.db.insert(chatMessages).values(
        Array.from({ length: 55 }, (_, i) => ({
          topic: 'lobby',
          authorUserId: a.userId,
          clientId: randomUUID(),
          body: `m${i}`,
          createdAt: new Date(clock - (55 - i) * 1000),
        })),
      );
      const sa = await connect(a);
      const joined = (await sa.join('lobby')).at(-1)!;
      expect(joined.messages).toHaveLength(50);
      expect(joined.messages[0].body).toBe('m5');
      expect(joined.messages[49].body).toBe('m54');
    });
  });

  describe('차단', () => {
    it('차단 목록 저장·조회·해제(HTTP, 계약 모양)', async () => {
      const me = await person();
      const other = await person();
      const put = await http(me, 'PUT', `/users/me/blocks/${other.userId}`);
      expect(put.statusCode, put.body).toBe(200);
      expectContract('/users/me/blocks/{user_id}', 'put', 200, put.json());
      expect(put.json().data.block).toMatchObject({ user_id: other.userId });
      // 다시 보내도 하나.
      expect((await http(me, 'PUT', `/users/me/blocks/${other.userId}`)).statusCode).toBe(200);
      const list = await http(me, 'GET', '/users/me/blocks');
      expectContract('/users/me/blocks', 'get', 200, list.json());
      expect(list.json().data.blocks.map((b: { user_id: string }) => b.user_id)).toEqual([other.userId]);

      const self = await http(me, 'PUT', `/users/me/blocks/${me.userId}`);
      expect(self.statusCode).toBe(422);
      expectContract('/users/me/blocks/{user_id}', 'put', 422, self.json());
      const missing = await http(me, 'PUT', `/users/me/blocks/${randomUUID()}`);
      expect(missing.statusCode).toBe(404);
      expectContract('/users/me/blocks/{user_id}', 'put', 404, missing.json());
      const noKey = await app.inject({ method: 'PUT', url: `/users/me/blocks/${other.userId}`, headers: authHeaders(me) });
      expect(noKey.statusCode).toBe(400);

      expect((await http(me, 'DELETE', `/users/me/blocks/${other.userId}`)).statusCode).toBe(204);
      expect((await http(me, 'DELETE', `/users/me/blocks/${other.userId}`)).statusCode).toBe(204);
      expect((await http(me, 'GET', '/users/me/blocks')).json().data.blocks).toEqual([]);
    });

    it('차단한 사람의 메시지는 나에게 오지 않고(실시간·joined), 해제하면 다시 온다. 그 사람은 계속 받는다', async () => {
      const me = await person();
      const rude = await person();
      const friend = await person();
      const sMe = await connect(me);
      const sRude = await connect(rude);
      const sFriend = await connect(friend);
      for (const s of [sMe, sRude, sFriend]) await s.join('lobby');
      await sayAndWait(sRude, 'lobby', '차단 전');
      await sMe.until((e) => e.type === 'message');

      expect((await http(me, 'PUT', `/users/me/blocks/${rude.userId}`)).statusCode).toBe(200);
      // 소켓이 새 차단 목록을 읽을 때까지: 같은 연결의 왕복 하나(프레임은 한 줄로 처리된다).
      await sMe.join('lobby');
      await sayAndWait(sRude, 'lobby', '차단 뒤');
      await sayAndWait(sFriend, 'lobby', '친구 말');
      // 바로 다음에 온 것이 친구 말이다(차단한 사람 것은 건너뜀).
      expect((await sMe.next()).message.body).toBe('친구 말');
      // 내가 하는 말은 차단당한 사람에게도 간다(한쪽 방향).
      await sayAndWait(sMe, 'lobby', '내 말');
      expect((await sRude.until((e) => e.type === 'message' && e.message.author.id === me.userId)).message.body).toBe('내 말');

      const joined = (await sMe.join('lobby')).at(-1)!;
      expect(joined.messages.map((m: { body: string }) => m.body)).toEqual(['친구 말', '내 말']);

      expect((await http(me, 'DELETE', `/users/me/blocks/${rude.userId}`)).statusCode).toBe(204);
      const after = (await sMe.join('lobby')).at(-1)!;
      expect(after.messages.map((m: { body: string }) => m.body)).toEqual(['차단 전', '차단 뒤', '친구 말', '내 말']);
      await sayAndWait(sRude, 'lobby', '해제 뒤');
      expect((await sMe.next()).message.body).toBe('해제 뒤');
    });
  });

  describe('메시지 신고', () => {
    it('서로 다른 3명이 신고하면 숨기고 토픽의 모두에게 message_hidden을 보낸다', async () => {
      const author = await person();
      const reporters = [await person(), await person(), await person()];
      const sAuthor = await connect(author);
      await sAuthor.join('lobby');
      const watchers = [];
      for (const r of reporters) {
        const s = await connect(r);
        await s.join('lobby');
        watchers.push(s);
      }
      const sent = await sayAndWait(sAuthor, 'lobby', '나쁜 말');
      const messageId = sent.message.id as string;

      const first = await report(reporters[0]!, messageId);
      expect(first.statusCode, first.body).toBe(200);
      expectContract('/reports', 'post', 200, first.json());
      expect(first.json().data.report).toMatchObject({ target_type: 'message', target_id: messageId });
      expect((await report(reporters[0]!, messageId)).statusCode).toBe(200); // 같은 사람 두 번은 한 번
      expect((await report(reporters[1]!, messageId)).statusCode).toBe(200);
      expect((await app.db.select().from(chatMessages))[0]!.hiddenAt).toBeNull();
      expect((await report(reporters[2]!, messageId)).statusCode).toBe(200);

      expect(await sAuthor.until((e) => e.type === 'message_hidden')).toEqual({ type: 'message_hidden', topic: 'lobby', message_id: messageId });
      for (const w of watchers) await w.until((e) => e.type === 'message_hidden' && e.message_id === messageId);
      expect((await sAuthor.join('lobby')).at(-1)!.messages).toEqual([]);
      // 숨긴 메시지는 더 신고할 수 없다(없는 것과 같다).
      expect((await report(await person(), messageId)).statusCode).toBe(404);
    });

    it('내 메시지는 422, 볼 수 없는 방의 메시지·없는 메시지는 404', async () => {
      const host = await person();
      const stranger = await person();
      const roomId = await createRoom(host);
      const sHost = await connect(host);
      await sHost.join(`room:${roomId}`);
      const sent = await sayAndWait(sHost, `room:${roomId}`, '방 안 이야기');
      const own = await report(host, sent.message.id);
      expect(own.statusCode).toBe(422);
      expectContract('/reports', 'post', 422, own.json());
      const outside = await report(stranger, sent.message.id);
      expect(outside.statusCode).toBe(404);
      expectContract('/reports', 'post', 404, outside.json());
      expect((await report(stranger, randomUUID())).statusCode).toBe(404);
    });

    it('운영 CLI로 메시지 신고를 보고 숨기고 되돌린다', async () => {
      const author = await person();
      const reporter = await person();
      const sAuthor = await connect(author);
      await sAuthor.join('lobby');
      const sent = await sayAndWait(sAuthor, 'lobby', '애매한 말');
      const messageId = sent.message.id as string;
      expect((await report(reporter, messageId)).statusCode).toBe(200);

      const out: string[] = [];
      const err: string[] = [];
      const cli = (...args: string[]) =>
        runCli(args, { db: app.db, now: () => new Date(clock), out: (l) => out.push(l), err: (l) => err.push(l) });
      expect(await cli('reports', 'list', '--type', 'message', '--pending')).toBe(0);
      expect(JSON.parse(out[0]!)).toMatchObject({ target_type: 'message', target_id: messageId, content: '애매한 말', target_user_id: author.userId });
      out.length = 0;
      expect(await cli('messages', 'show', messageId)).toBe(0);
      expect(JSON.parse(out[0]!)).toMatchObject({ id: messageId, topic: 'lobby', body: '애매한 말', hidden_at: null });
      expect(await cli('messages', 'hide', messageId)).toBe(0);
      expect((await sAuthor.join('lobby')).at(-1)!.messages).toEqual([]);
      out.length = 0;
      expect(await cli('reports', 'list', '--type', 'message', '--pending')).toBe(0);
      expect(out).toEqual([]);
      expect(await cli('messages', 'restore', messageId)).toBe(0);
      expect((await sAuthor.join('lobby')).at(-1)!.messages.map((m: { id: string }) => m.id)).toEqual([messageId]);
      expect(await cli('messages', 'hide', 'nope')).toBe(2);
      expect(await cli('messages', 'hide', randomUUID())).toBe(1);
    });
  });

  it('계정을 지우면 그 사람의 메시지·차단·신고가 남지 않는다', async () => {
    const leaver = await person();
    const other = await person();
    const sLeaver = await connect(leaver);
    await sLeaver.join('lobby');
    const sent = await sayAndWait(sLeaver, 'lobby', '곧 떠나요');
    const sOther = await connect(other);
    await sOther.join('lobby');
    await sayAndWait(sOther, 'lobby', '남는 말');
    expect((await http(leaver, 'PUT', `/users/me/blocks/${other.userId}`)).statusCode).toBe(200);
    expect((await http(other, 'PUT', `/users/me/blocks/${leaver.userId}`)).statusCode).toBe(200);
    expect((await report(other, sent.message.id)).statusCode).toBe(200);

    expect((await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(leaver) })).statusCode).toBe(204);
    const rows = await app.db.select().from(chatMessages);
    expect(rows.map((r) => r.body)).toEqual(['남는 말']);
    expect(await app.db.select().from(chatBlocks)).toEqual([]);
    const reports = await app.db.execute(sql`select count(*)::int as n from reports`);
    expect(Number((reports.rows[0] as { n: number }).n)).toBe(0);
    expect((await sOther.join('lobby')).at(-1)!.messages.map((m: { body: string }) => m.body)).toEqual(['남는 말']);
  });
});
