import type { AddressInfo } from 'node:net';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { TEST_WEB_ORIGIN } from './env.js';

/** 기다림의 상한(실패를 드러내는 시간이지 무언가를 기다리는 sleep이 아니다). */
const WAIT_MS = 4000;

type Event = Record<string, any>;

/** 실제 `ws` 클라이언트. 받은 프레임을 순서대로 쌓고 `next`로 하나씩 꺼낸다. */
export class TestSocket {
  private readonly queue: Event[] = [];
  private readonly waiters: ((event: Event) => void)[] = [];
  readonly closed: Promise<{ code: number; reason: string }>;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString()) as Event;
      const waiter = this.waiters.shift();
      if (waiter) waiter(event);
      else this.queue.push(event);
    });
    this.closed = new Promise((resolve) => ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() })));
  }

  static connect(url: string, options: { cookie?: string; origin?: string | null; autoPong?: boolean; forwardedFor?: string } = {}): TestSocket {
    const headers: Record<string, string> = {};
    if (options.cookie) headers.cookie = options.cookie;
    if (options.forwardedFor) headers['x-forwarded-for'] = options.forwardedFor;
    const origin = options.origin === undefined ? TEST_WEB_ORIGIN : options.origin;
    const ws = new WebSocket(url, { headers, ...(origin === null ? {} : { origin }), autoPong: options.autoPong ?? true });
    ws.on('error', () => undefined); // 닫힘 코드로 판정한다
    return new TestSocket(ws);
  }

  /** 연결이 열릴 때까지. */
  async opened(): Promise<this> {
    if (this.ws.readyState === WebSocket.OPEN) return this;
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        this.ws.once('open', () => resolve());
        this.ws.once('close', (code) => reject(new Error(`열리기 전에 닫힘 code: ${code}`)));
      }),
      'open',
    );
    return this;
  }

  send(event: unknown): void {
    this.ws.send(JSON.stringify(event));
  }

  /** 바로 다음 프레임(건너뛰지 않는다: "그 사이 다른 것이 오지 않았다"를 확인할 때). */
  next(label = 'next'): Promise<Event> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return withTimeout(new Promise<Event>((resolve) => this.waiters.push(resolve)), label);
  }

  /** 조건에 맞는 프레임이 올 때까지 앞의 것은 버린다. */
  async until(predicate: (event: Event) => boolean, label = 'until'): Promise<Event> {
    for (;;) {
      const event = await this.next(label);
      if (predicate(event)) return event;
    }
  }

  async join(topic: string): Promise<Event[]> {
    this.send({ type: 'join', topic });
    const received: Event[] = [];
    for (;;) {
      const event = await this.next(`join ${topic}`);
      received.push(event);
      if (event.type === 'joined' || event.type === 'error') return received;
    }
  }

  close(): void {
    this.ws.close();
  }

  closedWithin(): Promise<{ code: number; reason: string }> {
    return withTimeout(this.closed, 'close');
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`시간 안에 오지 않음: ${label}`)), WAIT_MS);
    }),
  ]);
}

/** 앱을 임의 포트로 띄우고 소켓 주소를 돌려준다. */
export async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.server.address() as AddressInfo;
  return `ws://127.0.0.1:${port}/socket`;
}
