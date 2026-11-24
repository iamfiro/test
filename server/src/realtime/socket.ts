import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { findSession, SESSION_COOKIE } from '../auth/session.js';
import { canAccessTopic, ChatError, parseTopic, type ChatService, type Topic } from '../chat/service.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import type { EventBus, LiveEvent } from './bus.js';
import { type LiveRoomEvent, type LiveRooms, type LiveSink } from './live-rooms.js';

/** 연결 경로. Fastify와 같은 포트의 HTTP 업그레이드로 받는다. */
export const SOCKET_PATH = '/socket';
/** 서버 ping 간격(Cloudflare 유휴 100초보다 짧게, launch.md L5). 다음 ping 때까지 pong이 없으면 끊는다. */
export const PING_INTERVAL_MS = 25_000;
/** 한 사람의 동시 연결 수(탭·기기 합). 넘는 새 연결은 4429로 닫는다. */
export const MAX_CONNECTIONS_PER_USER = 5;
/** 프레임 하나의 크기 상한(바이트). 넘으면 `ws`가 1009로 닫는다. 메시지 200자(UTF-8 최대 800바이트)에 여유. */
export const MAX_FRAME_BYTES = 4 * 1024;
/** 연결 하나가 10초에 보낼 수 있는 프레임 수. 넘으면 1008로 닫는다(채팅 쓰기 제한과 별개로 DB를 지킨다). */
export const MAX_FRAMES_PER_WINDOW = 30;
const FRAME_WINDOW_MS = 10_000;

export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_TOO_MANY_CONNECTIONS = 4429;

interface Connection {
  ws: WebSocket;
  userId: string;
  ip: string;
  topic: Topic | null;
  /** 이 사람이 차단한 사용자(그 사람의 메시지는 보내지 않는다). */
  blocked: Set<string>;
  alive: boolean;
  frames: number[];
  /** 이 연결의 프레임을 한 줄로 처리한다(`join` 뒤 `send`). */
  queue: Promise<void>;
}

type ServerEvent =
  | LiveRoomEvent
  | { type: 'joined'; topic: string; messages: unknown[] }
  | { type: 'message'; topic: string; message: unknown }
  | { type: 'message_hidden'; topic: string; message_id: string }
  | { type: 'error'; topic: string | null; client_id: string | null; code: string };

const shortId = (id: string) => id.slice(0, 4);

function cookieValue(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export interface SocketHubDeps {
  db: Db;
  config: Config;
  bus: EventBus;
  chat: ChatService;
  live: (sink: LiveSink) => LiveRooms;
  log: FastifyBaseLogger;
}

/**
 * `/socket` 실시간 채널(docs/contracts/study-room-chat.md, study-room-live.md). 연결 하나는 토픽 하나에만 들어간다
 * (`lobby` 또는 `room:<id>`, 다른 토픽에 `join`하면 앞 토픽에서 빠진다).
 */
export class SocketHub implements LiveSink {
  readonly live: LiveRooms;
  private readonly wss: WebSocketServer;
  private readonly connections = new Set<Connection>();
  private readonly byUser = new Map<string, Set<Connection>>();
  private readonly topics = new Map<string, Set<Connection>>();
  /** 채팅 이벤트를 받은 순서대로 보낸다. */
  private chatQueue: Promise<void> = Promise.resolve();
  private readonly unsubscribe: () => void;
  private pingTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: SocketHubDeps) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_BYTES, clientTracking: false });
    this.live = deps.live(this);
    this.unsubscribe = deps.bus.subscribe((event) => this.onBusEvent(event));
  }

  /** HTTP 서버의 업그레이드를 받는다. 다른 경로의 업그레이드는 끊는다. */
  attach(server: Server): void {
    server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      const path = (request.url ?? '').split('?')[0];
      if (path !== SOCKET_PATH) {
        socket.destroy();
        return;
      }
      this.upgrade(request, socket, head).catch((error: unknown) => {
        this.deps.log.error({ err: error }, 'socket upgrade failed');
        socket.destroy();
      });
    });
  }

  /** 운영에서는 25초마다 부른다(테스트는 직접 부른다). 지난 ping에 pong이 없던 연결은 끊는다. */
  heartbeat(): void {
    for (const conn of this.connections) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      conn.ws.ping();
    }
  }

  startHeartbeat(): void {
    this.pingTimer = setInterval(() => this.heartbeat(), PING_INTERVAL_MS);
    this.pingTimer.unref();
  }

  /** 정상 종료: 모든 소켓을 1001(going away)로 닫는다. 클라이언트는 다시 연결한다. */
  async close(): Promise<void> {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.unsubscribe();
    for (const conn of this.connections) conn.ws.close(1001, 'server shutting down');
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  // LiveSink
  broadcast(topic: string, event: LiveRoomEvent): void {
    for (const conn of this.topics.get(topic) ?? []) this.sendTo(conn, event);
  }

  evictUser(topic: string, userId: string): void {
    for (const conn of [...(this.topics.get(topic) ?? [])]) if (conn.userId === userId) this.unsubscribeConn(conn);
  }

  evictAll(topic: string): void {
    for (const conn of [...(this.topics.get(topic) ?? [])]) this.unsubscribeConn(conn);
  }

  hasSubscribers(topic: string): boolean {
    return (this.topics.get(topic)?.size ?? 0) > 0;
  }

  private clientIp(request: IncomingMessage): string {
    if (this.deps.config.trustProxy) {
      const forwarded = request.headers['x-forwarded-for'];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return request.socket.remoteAddress ?? '';
  }

  /** 인증(세션 쿠키 + Origin 허용 목록)을 먼저 하고, 실패해도 업그레이드를 마친 뒤 4401로 닫는다(클라이언트가 이유를 안다). */
  private async upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const startedAt = Date.now();
    const origin = request.headers.origin;
    const token = cookieValue(request.headers.cookie, SESSION_COOKIE);
    const originOk = typeof origin === 'string' && this.deps.config.webOrigins.includes(origin);
    const auth = originOk && token ? await findSession(this.deps.db, token, { touch: 'throttled' }) : null;
    const ip = this.clientIp(request);
    this.wss.handleUpgrade(request, socket, head, (ws) => {
      if (!auth) {
        this.deps.log.warn(`socket rejected reason: ${originOk ? 'session' : 'origin'} elapsed_ms: ${Date.now() - startedAt}`);
        ws.close(CLOSE_UNAUTHORIZED, 'unauthorized');
        return;
      }
      const userId = auth.user.id;
      if ((this.byUser.get(userId)?.size ?? 0) >= MAX_CONNECTIONS_PER_USER) {
        this.deps.log.warn(`socket rejected reason: too_many user: ${shortId(userId)}`);
        ws.close(CLOSE_TOO_MANY_CONNECTIONS, 'too many connections');
        return;
      }
      void this.accept(ws, userId, ip, startedAt);
    });
  }

  private async accept(ws: WebSocket, userId: string, ip: string, startedAt: number): Promise<void> {
    const conn: Connection = { ws, userId, ip, topic: null, blocked: new Set(), alive: true, frames: [], queue: Promise.resolve() };
    this.connections.add(conn);
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(conn);
    ws.on('pong', () => {
      conn.alive = true;
    });
    ws.on('close', () => this.remove(conn));
    ws.on('error', (error) => this.deps.log.warn({ err: error }, `socket error user: ${shortId(userId)}`));
    // 차단 목록을 읽기 전에 온 프레임은 줄에서 기다린다.
    conn.queue = this.deps.chat
      .blockedBy(userId)
      .then((blocked) => {
        conn.blocked = blocked;
      })
      .catch((error: unknown) => this.deps.log.error({ err: error }, 'socket block list load failed'));
    ws.on('message', (data, isBinary) => this.onFrame(conn, data, isBinary));
    this.deps.log.info(`socket connected user: ${shortId(userId)} elapsed_ms: ${Date.now() - startedAt}`);
  }

  private remove(conn: Connection): void {
    if (!this.connections.delete(conn)) return;
    const mine = this.byUser.get(conn.userId);
    mine?.delete(conn);
    if (mine?.size === 0) this.byUser.delete(conn.userId);
    this.unsubscribeConn(conn);
  }

  /** 토픽에서 뺀다. 방 토픽의 마지막 구독자였으면 방 상태를 메모리에서 내린다. */
  private unsubscribeConn(conn: Connection): void {
    const topic = conn.topic;
    if (!topic) return;
    conn.topic = null;
    const set = this.topics.get(topic.name);
    set?.delete(conn);
    if (set?.size === 0) this.topics.delete(topic.name);
    if (topic.kind === 'room' && !this.hasSubscribers(topic.name)) this.live.release(topic.roomId);
  }

  private subscribeConn(conn: Connection, topic: Topic): void {
    if (conn.topic?.name !== topic.name) this.unsubscribeConn(conn);
    conn.topic = topic;
    if (!this.topics.has(topic.name)) this.topics.set(topic.name, new Set());
    this.topics.get(topic.name)!.add(conn);
  }

  private sendTo(conn: Connection, event: ServerEvent): void {
    if (conn.ws.readyState !== conn.ws.OPEN) return;
    conn.ws.send(JSON.stringify(event));
  }

  private onFrame(conn: Connection, data: RawData, isBinary: boolean): void {
    const at = Date.now();
    conn.frames = conn.frames.filter((t) => t > at - FRAME_WINDOW_MS);
    conn.frames.push(at);
    if (conn.frames.length > MAX_FRAMES_PER_WINDOW) {
      this.deps.log.warn(`socket closed reason: frame_flood user: ${shortId(conn.userId)}`);
      conn.ws.close(1008, 'too many frames');
      return;
    }
    if (isBinary) {
      conn.ws.close(1003, 'text frames only');
      return;
    }
    let frame: unknown;
    try {
      frame = JSON.parse(data.toString());
    } catch {
      this.sendTo(conn, { type: 'error', topic: null, client_id: null, code: 'INVALID' });
      return;
    }
    conn.queue = conn.queue
      .then(() => this.handleFrame(conn, frame))
      .catch((error: unknown) => {
        this.deps.log.error({ err: error }, `socket frame failed user: ${shortId(conn.userId)}`);
      });
  }

  private async handleFrame(conn: Connection, frame: unknown): Promise<void> {
    if (conn.ws.readyState !== conn.ws.OPEN) return;
    const input = typeof frame === 'object' && frame !== null && !Array.isArray(frame) ? (frame as Record<string, unknown>) : {};
    const rawTopic = typeof input.topic === 'string' ? input.topic : null;
    const clientId = typeof input.client_id === 'string' ? input.client_id : null;
    const topic = parseTopic(input.topic);
    if (!topic || (input.type !== 'join' && input.type !== 'send')) {
      this.sendTo(conn, { type: 'error', topic: rawTopic, client_id: clientId, code: 'INVALID' });
      return;
    }
    if (input.type === 'join') await this.join(conn, topic);
    else await this.send(conn, topic, input.client_id, input.body);
  }

  /**
   * 토픽에 들어간다. 방 토픽은 멤버만이고 `room_state` 스냅샷을 먼저 보낸다(방 줄 안에서 구독하므로 스냅샷의
   * `seq` 뒤 변경이 빠지지 않는다). 그다음 최근 메시지(`joined`).
   */
  private async join(conn: Connection, topic: Topic): Promise<void> {
    const { db, chat } = this.deps;
    if (topic.kind === 'room') {
      const ok = await this.live.run(topic.roomId, async () => {
        if (!(await canAccessTopic(db, conn.userId, topic))) return false;
        const snapshot = await this.live.snapshot(topic.roomId);
        if (!snapshot) return false;
        this.subscribeConn(conn, topic);
        this.sendTo(conn, snapshot);
        return true;
      });
      if (!ok) {
        this.sendTo(conn, { type: 'error', topic: topic.name, client_id: null, code: 'FORBIDDEN' });
        return;
      }
    } else {
      this.subscribeConn(conn, topic);
    }
    // 구독한 뒤에 읽는다: 그 사이 저장된 메시지는 실시간으로도 오고 클라이언트가 id로 겹침을 지운다.
    const messages = await chat.recent(topic.name, conn.blocked);
    if (conn.topic?.name !== topic.name) return; // 그 사이 내보내졌다
    this.sendTo(conn, { type: 'joined', topic: topic.name, messages });
  }

  private async send(conn: Connection, topic: Topic, clientIdRaw: unknown, body: unknown): Promise<void> {
    const clientId = typeof clientIdRaw === 'string' ? clientIdRaw : null;
    try {
      const { message, created } = await this.deps.chat.send({ userId: conn.userId, ip: conn.ip, topic, clientId: clientIdRaw, body });
      if (created) {
        this.deps.bus.publish({ kind: 'chat_message', topic: message.topic, messageId: message.view.id });
      } else {
        // 재전송(같은 client_id): 보낸 연결에만 다시 알린다. 다른 사람은 이미 받았다.
        this.sendTo(conn, { type: 'message', topic: message.topic, message: message.view });
      }
    } catch (error) {
      if (!(error instanceof ChatError)) throw error;
      if (error.code !== 'INVALID' && error.code !== 'FORBIDDEN') {
        this.deps.log.warn(`chat send rejected code: ${error.code} user: ${shortId(conn.userId)} topic: ${topic.kind}`);
      }
      this.sendTo(conn, { type: 'error', topic: topic.name, client_id: clientId, code: error.code });
    }
  }

  private onBusEvent(event: LiveEvent): void {
    switch (event.kind) {
      case 'timer':
      case 'profile':
      case 'room':
        this.live.handle(event).catch((error: unknown) => this.deps.log.error({ err: error }, `live room event failed kind: ${event.kind}`));
        return;
      case 'chat_message':
      case 'chat_hidden':
        this.chatQueue = this.chatQueue
          .then(() => this.deliverChat(event))
          .catch((error: unknown) => this.deps.log.error({ err: error }, 'chat delivery failed'));
        return;
      case 'blocks':
        for (const conn of this.byUser.get(event.userId) ?? []) {
          conn.queue = conn.queue
            .then(async () => {
              conn.blocked = await this.deps.chat.blockedBy(event.userId);
            })
            .catch((error: unknown) => this.deps.log.error({ err: error }, 'socket block list reload failed'));
        }
        return;
      case 'user_deleted':
        for (const conn of [...(this.byUser.get(event.userId) ?? [])]) conn.ws.close(CLOSE_UNAUTHORIZED, 'account deleted');
        return;
    }
  }

  private async deliverChat(event: Extract<LiveEvent, { kind: 'chat_message' | 'chat_hidden' }>): Promise<void> {
    const subscribers = this.topics.get(event.topic);
    if (event.kind === 'chat_hidden') {
      for (const conn of subscribers ?? []) this.sendTo(conn, { type: 'message_hidden', topic: event.topic, message_id: event.messageId });
      return;
    }
    if (!subscribers || subscribers.size === 0) return;
    const message = await this.deps.chat.byId(event.messageId);
    if (!message || message.hidden) return;
    const authorId = message.view.author.id;
    for (const conn of this.topics.get(event.topic) ?? []) {
      // 차단한 사람의 메시지는 그 사람에게 보내지 않는다(보낸 사람 자신에게는 늘 보낸다).
      if (conn.userId !== authorId && conn.blocked.has(authorId)) continue;
      this.sendTo(conn, { type: 'message', topic: event.topic, message: message.view });
    }
  }
}
