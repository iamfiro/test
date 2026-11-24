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
import { registerTimerRoutes } from './study/routes.js';
import { registerStatsRoutes } from './study/stats.js';
import { TimerService } from './study/timer.js';
import { SettingsService } from './moderation/settings.js';
import { registerReportRoutes } from './moderation/routes.js';
import { registerTagRoutes } from './tags/routes.js';
import { RoomService } from './rooms/service.js';
import { registerRoomRoutes } from './rooms/routes.js';
import type { MediaStorage } from './media/storage.js';
import { DiskStorage } from './media/disk.js';
import { R2Storage } from './media/r2.js';
import { registerDiskMediaRoute, registerMediaParsing } from './media/routes.js';
import { startMaintenance } from './maintenance.js';
import { LocalEventBus, type EventBus } from './realtime/bus.js';
import { LiveRooms } from './realtime/live-rooms.js';
import { SocketHub } from './realtime/socket.js';
import { ChatService } from './chat/service.js';
import { registerChatRoutes } from './chat/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    config: Config;
    /** 서버 시각. 타이머·presence가 쓴다(테스트는 고정 시계를 넣는다). */
    now: () => Date;
    timer: TimerService;
    /** 긴급 스위치(운영 설정) 읽기. */
    settings: SettingsService;
    /** 공부방 상태 변경(커밋 뒤 `onChange` 알림). */
    rooms: RoomService;
    /** 미디어 저장소(방 배너·로고). */
    media: MediaStorage;
    /** 실시간 채널로 나갈 일(커밋 뒤). 서버 1대는 프로세스 안 전달, 늘리면 LISTEN/NOTIFY(결정 M7). */
    bus: EventBus;
    chat: ChatService;
    /** `/socket` 연결·토픽. */
    sockets: SocketHub;
    /** 방 실시간 상태(구독 중인 방). */
    live: LiveRooms;
  }
}

export interface AppOptions {
  config: Config;
  /** 테스트가 경로를 더 붙일 때 쓴다. */
  registerExtraRoutes?: (app: FastifyInstance) => Promise<void> | void;
  /** 서버 시각. 없으면 시스템 시계. */
  now?: () => Date;
  /** 미디어 저장소 대역(테스트). 없으면 설정(`MEDIA_STORAGE`)대로 만든다. */
  media?: MediaStorage;
}

function createMediaStorage(config: Config): MediaStorage {
  const media = config.media;
  if (media.storage === 'r2') return new R2Storage(media);
  return new DiskStorage(media.dir, media.publicBaseUrl);
}

const BODY_LIMIT_BYTES = 64 * 1024;
/** 방 실시간 상태 다시 보기 간격(자리 비움·순위가 이만큼 늦을 수 있다). */
const LIVE_SWEEP_INTERVAL_MS = 5_000;
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
  const now = options.now ?? (() => new Date());
  app.decorate('now', now);
  app.decorate(
    'timer',
    new TimerService(handle.db, now, (error) => app.log.error({ err: error }, 'timer change listener failed')),
  );
  app.decorate('settings', new SettingsService(handle.db, now, config.settingsCacheMs));
  const media = options.media ?? createMediaStorage(config);
  app.decorate('media', media);
  app.decorate(
    'rooms',
    new RoomService(handle.db, now, media, { passwordKey: config.roomPasswordKey, createPerIpPerDay: config.roomCreatePerIpPerDay }, {
      onListenerError: (error) => app.log.error({ err: error }, 'room change listener failed'),
      // 지우지 못한 파일은 공개 URL로 남지만 어디서도 가리키지 않는다. 키를 남겨 운영자가 지울 수 있게 한다.
      onMediaDeleteError: (key, error) => app.log.error({ err: error }, `media delete failed key: ${key}`),
    }),
  );
  app.addHook('onClose', async () => {
    await handle.pool.end();
  });

  const bus = new LocalEventBus((error) => app.log.error({ err: error }, 'live event handler failed'));
  app.decorate('bus', bus);
  app.timer.onChange((change) => bus.publish({ kind: 'timer', userId: change.userId, change: change.type }));
  app.rooms.onChange((change) => bus.publish({ kind: 'room', change }));
  app.decorate('chat', new ChatService(handle.db, now, app.settings));
  const sockets = new SocketHub({
    db: handle.db,
    config,
    bus,
    chat: app.chat,
    live: (sink) =>
      new LiveRooms(handle.db, now, (key) => media.publicUrl(key), sink, (error) => app.log.error({ err: error }, 'live room task failed')),
    log: app.log,
  });
  sockets.attach(app.server);
  app.decorate('sockets', sockets);
  app.decorate('live', sockets.live);
  // 서버를 닫기 전에 소켓을 닫는다(열린 소켓이 HTTP 서버 종료를 붙잡지 않게, 클라이언트는 1001을 받고 다시 연결한다).
  app.addHook('preClose', async () => {
    await sockets.close();
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

  registerMediaParsing(app);

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
  registerTimerRoutes(app);
  registerStatsRoutes(app);
  registerReportRoutes(app);
  registerTagRoutes(app);
  registerRoomRoutes(app);
  registerChatRoutes(app);
  if (media instanceof DiskStorage) registerDiskMediaRoute(app, media);
  await options.registerExtraRoutes?.(app);

  if (config.env !== 'test') {
    startMaintenance(app);
    sockets.startHeartbeat();
    // 자리 비움(presence 75초 끊김)·순위 앞지름을 몇 초마다 다시 본다. 테스트는 시계를 옮긴 뒤 `app.live.sweep()`을 직접 부른다.
    const sweep = setInterval(() => {
      app.live.sweep().catch((error: unknown) => app.log.error({ err: error }, 'live sweep failed'));
    }, LIVE_SWEEP_INTERVAL_MS);
    sweep.unref();
    app.addHook('onClose', async () => clearInterval(sweep));
  }

  return app;
}
