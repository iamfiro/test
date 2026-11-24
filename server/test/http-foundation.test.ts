import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase } from './helpers/app.js';
import { expectContract } from './helpers/contract.js';
import { TEST_WEB_ORIGIN } from './helpers/env.js';

const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';

describe('HTTP 골격', () => {
  let app: FastifyInstance;
  let calls: number;

  beforeAll(async () => {
    app = await createTestApp({
      registerExtraRoutes: async (instance) => {
        // 멱등 키 동작을 보려는 테스트 전용 경로. 실제 API에는 없다.
        instance.post('/__test/idem', { config: { idempotent: true } }, async (request, reply) => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 80));
          return reply.ok({ call: calls, echo: (request.body as { n?: number })?.n ?? null }, 201);
        });
        instance.post('/__test/idem-fail', { config: { idempotent: true } }, async (_request, reply) => {
          calls += 1;
          if (calls === 1) throw new Error('boom');
          return reply.ok({ call: calls });
        });
        instance.get('/__test/limited', { config: { rateLimit: { max: 2, timeWindow: '1 minute' } } }, async (_r, reply) =>
          reply.ok({ ok: true }),
        );
      },
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    calls = 0;
    await resetDatabase(app);
  });

  describe('헬스체크', () => {
    it('GET /healthz는 DB가 되면 봉투에 ok를 담아 200으로 답한다', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toEqual({ status: 'ok' });
      expect(body.error).toBeNull();
      expectContract('/healthz', 'get', 200, body);
    });

    it('DB에 닿지 않으면 503 SERVICE_UNAVAILABLE', async () => {
      const broken = await createTestApp({ env: { DATABASE_URL: 'postgres://studyvillage:studyvillage@localhost:1/none' } });
      const res = await broken.inject({ method: 'GET', url: '/healthz' });
      await broken.close();
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
      expectContract('/healthz', 'get', 503, res.json());
    });
  });

  describe('오류 봉투', () => {
    it('없는 경로는 404 RESOURCE_NOT_FOUND 봉투', async () => {
      const res = await app.inject({ method: 'GET', url: '/nope' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.data).toBeNull();
      expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
      expect(typeof body.meta.requestId).toBe('string');
      expect(new Date(body.meta.timestamp).toString()).not.toBe('Invalid Date');
    });

    it('깨진 JSON은 422 VALIDATION_ERROR 봉투', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/__test/idem',
        headers: { 'content-type': 'application/json', 'idempotency-key': KEY_A },
        payload: '{"n":',
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('요청 크기 상한(64KB)을 넘으면 413 PAYLOAD_TOO_LARGE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/__test/idem',
        headers: { 'content-type': 'application/json', 'idempotency-key': KEY_A },
        payload: JSON.stringify({ n: 'x'.repeat(70_000) }),
      });
      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('응답마다 X-Request-Id가 있고 meta.requestId와 같다', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz' });
      expect(res.headers['x-request-id']).toBe(res.json().meta.requestId);
    });
  });

  describe('CORS·Origin', () => {
    it('허용한 웹 origin에는 credentials를 허용하는 CORS 헤더를 준다', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: TEST_WEB_ORIGIN } });
      expect(res.headers['access-control-allow-origin']).toBe(TEST_WEB_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('허용하지 않은 origin에는 CORS 헤더를 주지 않는다', async () => {
      const res = await app.inject({ method: 'GET', url: '/healthz', headers: { origin: 'https://evil.test' } });
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('preflight는 CSRF·멱등 헤더를 허용한다', async () => {
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/__test/idem',
        headers: {
          origin: TEST_WEB_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-csrf-token,idempotency-key',
        },
      });
      expect(res.statusCode).toBe(204);
      const allowed = String(res.headers['access-control-allow-headers']).toLowerCase();
      expect(allowed).toContain('x-csrf-token');
      expect(allowed).toContain('idempotency-key');
    });

    it('상태를 바꾸는 요청이 허용하지 않은 Origin에서 오면 403 CSRF_REJECTED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/__test/idem',
        headers: { origin: 'https://evil.test', 'content-type': 'application/json', 'idempotency-key': KEY_A },
        payload: '{}',
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('CSRF_REJECTED');
      expect(calls).toBe(0);
    });
  });

  describe('Idempotency-Key', () => {
    const post = (key: string | undefined, payload: unknown = { n: 1 }) =>
      app.inject({
        method: 'POST',
        url: '/__test/idem',
        headers: { 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
        payload: JSON.stringify(payload),
      });

    it('키가 필요한 쓰기에서 키가 없으면 거절하고 실행하지 않는다', async () => {
      const res = await post(undefined);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect(calls).toBe(0);
    });

    it('UUID가 아닌 키도 거절한다', async () => {
      const res = await post('not-a-uuid');
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    it('같은 키·같은 본문 재전송은 처음 응답을 그대로 돌려주고 한 번만 실행한다', async () => {
      const first = await post(KEY_A);
      const second = await post(KEY_A);
      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json().data).toEqual(first.json().data);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(calls).toBe(1);
    });

    it('같은 키에 다른 본문이면 409 IDEMPOTENCY_KEY_REUSED', async () => {
      await post(KEY_A, { n: 1 });
      const res = await post(KEY_A, { n: 2 });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(calls).toBe(1);
    });

    it('다른 키는 따로 실행한다', async () => {
      await post(KEY_A);
      const res = await post(KEY_B);
      expect(res.json().data.call).toBe(2);
    });

    it('같은 키 동시 두 요청은 한 번만 실행하고 둘 다 같은 응답을 받는다', async () => {
      const [a, b] = await Promise.all([post(KEY_A), post(KEY_A)]);
      expect(calls).toBe(1);
      expect(a.statusCode).toBe(201);
      expect(b.statusCode).toBe(201);
      expect(a.json().data).toEqual(b.json().data);
    });

    it('서버 오류(5xx)로 끝난 요청은 저장하지 않아 같은 키로 다시 실행된다', async () => {
      const send = () =>
        app.inject({
          method: 'POST',
          url: '/__test/idem-fail',
          headers: { 'content-type': 'application/json', 'idempotency-key': KEY_A },
          payload: '{}',
        });
      const first = await send();
      const second = await send();
      expect(first.statusCode).toBe(500);
      expect(second.statusCode).toBe(200);
      expect(calls).toBe(2);
    });
  });

  describe('rate limit', () => {
    it('한도를 넘으면 429 RATE_LIMIT_EXCEEDED와 Retry-After', async () => {
      const get = () => app.inject({ method: 'GET', url: '/__test/limited' });
      expect((await get()).statusCode).toBe(200);
      expect((await get()).statusCode).toBe(200);
      const res = await get();
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });
});
