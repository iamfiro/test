import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_CONNECTIONS_PER_USER, MAX_FRAME_BYTES } from '../src/realtime/socket.js';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { authHeaders, startAnonymous } from './helpers/session.js';
import { listen, TestSocket } from './helpers/socket.js';

describe('실시간 채널 연결 /socket', () => {
  let app: FastifyInstance;
  let url: string;
  const open: TestSocket[] = [];
  const connect = (options: Parameters<typeof TestSocket.connect>[1]) => {
    const socket = TestSocket.connect(url, options);
    open.push(socket);
    return socket;
  };

  beforeAll(async () => {
    app = await createTestApp();
    url = await listen(app);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    for (const socket of open.splice(0)) socket.close();
    await resetDatabase(app);
  });

  it('세션 쿠키가 없으면 4401로 닫는다', async () => {
    const socket = connect({});
    expect((await socket.closedWithin()).code).toBe(4401);
  });

  it('없는(지운) 세션이면 4401로 닫는다', async () => {
    const socket = connect({ cookie: 'sv_session=not-a-session' });
    expect((await socket.closedWithin()).code).toBe(4401);
  });

  it('허용 목록에 없는 Origin이나 Origin 없는 연결은 세션이 있어도 4401로 닫는다', async () => {
    const me = await startAnonymous(app);
    expect((await connect({ cookie: me.cookie, origin: 'https://evil.example' }).closedWithin()).code).toBe(4401);
    expect((await connect({ cookie: me.cookie, origin: null }).closedWithin()).code).toBe(4401);
  });

  it('/socket이 아닌 경로의 업그레이드는 받지 않는다', async () => {
    const me = await startAnonymous(app);
    const socket = TestSocket.connect(url.replace('/socket', '/other'), { cookie: me.cookie });
    await expect(socket.opened()).rejects.toThrow();
  });

  it('세션이 맞으면 열리고 로비에 들어가 최근 메시지(빈 목록)를 받는다', async () => {
    const me = await startAnonymous(app);
    const socket = await connect({ cookie: me.cookie }).opened();
    expect(await socket.join('lobby')).toEqual([{ type: 'joined', topic: 'lobby', messages: [] }]);
  });

  it('한 사람의 동시 연결은 상한까지만 받고 넘으면 4429로 닫는다', async () => {
    const me = await startAnonymous(app);
    for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i += 1) await connect({ cookie: me.cookie }).opened();
    expect((await connect({ cookie: me.cookie }).closedWithin()).code).toBe(4429);
    // 다른 사람은 막히지 않는다.
    const other = await startAnonymous(app);
    await connect({ cookie: other.cookie }).opened();
  });

  it('큰 프레임은 1009로 닫는다', async () => {
    const me = await startAnonymous(app);
    const socket = await connect({ cookie: me.cookie }).opened();
    socket.send({ type: 'send', topic: 'lobby', client_id: crypto.randomUUID(), body: 'a'.repeat(MAX_FRAME_BYTES) });
    expect((await socket.closedWithin()).code).toBe(1009);
  });

  it('JSON이 아니거나 모르는 종류·토픽이면 INVALID 오류를 받고 연결은 그대로다', async () => {
    const me = await startAnonymous(app);
    const socket = await connect({ cookie: me.cookie }).opened();
    socket.ws.send('not json');
    expect(await socket.next()).toEqual({ type: 'error', topic: null, client_id: null, code: 'INVALID' });
    socket.send({ type: 'shout', topic: 'lobby' });
    expect(await socket.next()).toMatchObject({ type: 'error', code: 'INVALID' });
    socket.send({ type: 'join', topic: 'room:not-a-uuid' });
    expect(await socket.next()).toMatchObject({ type: 'error', topic: 'room:not-a-uuid', code: 'INVALID' });
    expect(await socket.join('lobby')).toEqual([{ type: 'joined', topic: 'lobby', messages: [] }]);
  });

  it('pong이 없는 연결은 다음 ping 때 끊는다', async () => {
    const me = await startAnonymous(app);
    const silent = await connect({ cookie: me.cookie, autoPong: false }).opened();
    const healthy = await connect({ cookie: me.cookie }).opened();
    const ponged = new Promise<void>((resolve) => healthy.ws.once('ping', () => resolve()));
    app.sockets.heartbeat();
    await ponged;
    // 클라이언트가 pong을 보냈는지 서버가 알 때까지: 같은 연결의 왕복(로비 들어가기) 하나를 끝낸다.
    await healthy.join('lobby');
    app.sockets.heartbeat();
    expect((await silent.closedWithin()).code).toBe(1006);
    expect(healthy.ws.readyState).toBe(healthy.ws.OPEN);
  });

  it('내 데이터를 지우면 열린 소켓을 4401로 닫는다', async () => {
    const me = await startAnonymous(app);
    const socket = await connect({ cookie: me.cookie }).opened();
    await socket.join('lobby');
    const res = await app.inject({ method: 'DELETE', url: '/users/me', headers: authHeaders(me) });
    expect(res.statusCode).toBe(204);
    expect((await socket.closedWithin()).code).toBe(4401);
  });

  it('서버를 정상 종료하면 소켓을 1001로 닫는다', async () => {
    const other = await createTestApp();
    const otherUrl = await listen(other);
    const me = await startAnonymous(other);
    const socket = await TestSocket.connect(otherUrl, { cookie: me.cookie }).opened();
    await other.close();
    expect((await socket.closedWithin()).code).toBe(1001);
  });
});
