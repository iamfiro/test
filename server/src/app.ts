import { randomUUID } from 'node:crypto';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import type { Config } from './config.js';
import { createDb, type Db } from './db/client.js';
import { registerEnvelope } from './http/envelope.js';
import { errors } from './http/errors.js';
import { registerIdempotency } from './http/idempotency.js';
import { registerAuth } from './auth/hook.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerProfileRoutes } from './profile/routes.js';
import { registerStudySettingsRoutes } from './study/settings.js';
import { startMaintenance } from './maintenance.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
  }
}

export interface AppOptions {
  config: Config;
  /** 테스트가 경로를 더 붙일 때 쓴다. */
  registerExtraRoutes?: (app: FastifyInstance) => Promise<void> | void;
}

const BODY_LIMIT_BYTES = 64 * 1024;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // 쿠키·인증 헤더·본문은 어떤 로그에도 남기지 않는다.
      redact: ['req.headers.cookie', 'req.headers.authorization', 'req.body', 'res.headers["set-cookie"]'],
    },
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.trustProxy,
    genReqId: (request) => {
      const incoming = request.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
    },
    routerOptions: { ignoreTrailingSlash: true },
  });

  const handle = createDb(config.databaseUrl);
  app.decorate('db', handle.db);
  app.decorate('config', config);
  app.addHook('onClose', async () => {
    await handle.pool.end();
  });

  registerEnvelope(app);

  // 본문 없는 쓰기(예: PUT /users/me/onboarding)가 JSON 헤더를 달고 와도 받는다. 깨진 JSON은 그대로 거절한다.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    if (body === '') return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error('invalid json'), { code: 'FST_ERR_CTP_INVALID_JSON_BODY', statusCode: 400 }));
    }
  });

  await app.register(cookie);
  await app.register(cors, {
    origin: config.webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-csrf-token', 'idempotency-key'],
    exposedHeaders: ['x-request-id', 'retry-after', 'idempotent-replayed'],
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => errors.rateLimited(Math.max(1, Math.ceil(context.ttl / 1000))),
  });

  // 상태를 바꾸는 요청에 Origin이 있으면 허용 목록에 있어야 한다. 없는 요청(웹이 아닌 클라이언트)은
  // 세션 CSRF 토큰이 막는다(인증 단계).
  app.addHook('onRequest', async (request) => {
    const origin = request.headers.origin;
    if (WRITE_METHODS.has(request.method) && origin !== undefined && !config.webOrigins.includes(origin)) {
      throw errors.csrfRejected('허용하지 않은 출처의 요청이에요');
    }
  });

  registerAuth(app);
  registerIdempotency(app);

  app.addHook('onResponse', async (request, reply) => {
    if (request.url === '/healthz') return;
    const status = reply.statusCode;
    const line = `request completed method: ${request.method} path: ${request.routeOptions.url ?? 'unmatched'} status: ${status} bytes: ${reply.getHeader('content-length') ?? 0} elapsed_ms: ${Math.round(reply.elapsedTime)}`;
    if (status >= 500) request.log.error(line);
    else if (status >= 400) request.log.warn(line);
    else request.log.info(line);
  });

  app.get('/healthz', { config: { auth: 'none', rateLimit: false } }, async (_request, reply) => {
    try {
      await app.db.execute(sql`select 1`);
    } catch {
      throw errors.serviceUnavailable();
    }
    return reply.ok({ status: 'ok' });
  });

  registerAuthRoutes(app);
  registerProfileRoutes(app);
  registerStudySettingsRoutes(app);
  await options.registerExtraRoutes?.(app);

  if (config.env !== 'test') startMaintenance(app);

  return app;
}
