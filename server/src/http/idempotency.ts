import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { idempotencyKeys } from '../db/schema.js';
import { errors } from './errors.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** true면 `Idempotency-Key` 헤더(UUID)가 필수이고 같은 키 재전송은 처음 응답을 돌려준다. */
    idempotent?: boolean;
  }
  interface FastifyRequest {
    /** 키를 묶는 범위. 로그인한 요청은 `user:<id>`, 아니면 `ip:<ip>`. 인증 훅이 정한다. */
    idempotencyScope?: string;
    idempotencyClaim?: { scope: string; key: string };
    /**
     * 재전송용 기록에 남길 본문을 바꾼다(없으면 응답 그대로). 응답에만 실어야 하고 DB에 24시간 두면 안 되는 값
     * (방장 상세의 방 비밀번호)을 빼는 데 쓴다. 그래서 재전송 응답에는 그 값이 없다(계약에 적음).
     */
    idempotencyReceipt?: (payload: string) => string;
  }
}

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_MS = 24 * 60 * 60 * 1000;
const STALE_IN_PROGRESS_MS = 30_000;
const WAIT_STEP_MS = 40;
const WAIT_MAX_MS = 5_000;

function requestHash(request: FastifyRequest): string {
  return createHash('sha256')
    .update(`${request.method} ${request.url}\n${JSON.stringify(request.body ?? null)}`)
    .digest('hex');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface StoredResult {
  status: number;
  body: string;
  contentType: string;
}

export function readIdempotencyKey(request: FastifyRequest): string {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) throw errors.idempotencyKeyRequired();
  return key.toLowerCase();
}

/** 키를 차지한다. 이미 있으면 false. 만료된 기록은 먼저 치운다. */
export async function claimKey(db: Db, scope: string, key: string, hash: string): Promise<boolean> {
  await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key), lt(idempotencyKeys.expiresAt, sql`now()`)));
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ scope, key, requestHash: hash, state: 'in_progress', expiresAt: new Date(Date.now() + TTL_MS) })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  return inserted.length === 1;
}

export async function completeKey(db: Db, scope: string, key: string, result: StoredResult): Promise<void> {
  await db
    .update(idempotencyKeys)
    .set({ state: 'done', responseStatus: result.status, responseBody: result.body, responseContentType: result.contentType })
    .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
}

export async function releaseKey(db: Db, scope: string, key: string): Promise<void> {
  await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
}

/** 이미 차지된 키의 저장된 결과를 기다려 돌려준다. 기록이 사라졌거나 낡았으면 'retry'(다시 차지해 본다). */
export async function awaitStored(db: Db, scope: string, key: string, hash: string): Promise<StoredResult | 'retry'> {
  const startedAt = Date.now();
  for (;;) {
    const [row] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    if (!row) return 'retry';
    if (row.requestHash !== hash) throw errors.idempotencyKeyReused();
    if (row.state === 'done') {
      return {
        status: row.responseStatus ?? 200,
        body: row.responseBody ?? '',
        contentType: row.responseContentType ?? 'application/json; charset=utf-8',
      };
    }
    if (Date.now() - row.createdAt.getTime() > STALE_IN_PROGRESS_MS) {
      // 처리하던 프로세스가 사라진 기록. 지우고 다시 차지한다.
      await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key), eq(idempotencyKeys.state, 'in_progress')));
      return 'retry';
    }
    if (Date.now() - startedAt > WAIT_MAX_MS) throw errors.idempotencyInProgress();
    await sleep(WAIT_STEP_MS);
  }
}

export function registerIdempotency(app: FastifyInstance): void {
  app.decorateRequest('idempotencyScope', undefined);
  app.decorateRequest('idempotencyClaim', undefined);
  app.decorateRequest('idempotencyReceipt', undefined);

  app.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions.config.idempotent) return;
    const key = readIdempotencyKey(request);
    const scope = request.idempotencyScope ?? `ip:${request.ip}`;
    const hash = requestHash(request);

    for (;;) {
      if (await claimKey(app.db, scope, key, hash)) {
        request.idempotencyClaim = { scope, key };
        return;
      }
      const stored = await awaitStored(app.db, scope, key, hash);
      if (stored === 'retry') continue;
      reply
        .code(stored.status)
        .header('content-type', stored.contentType)
        .header('idempotent-replayed', 'true')
        .send(stored.body);
      return reply;
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const claimed = request.idempotencyClaim;
    if (!claimed) return payload;
    request.idempotencyClaim = undefined;
    try {
      if (reply.statusCode >= 500) {
        await releaseKey(app.db, claimed.scope, claimed.key);
      } else {
        const body = typeof payload === 'string' ? payload : String(payload ?? '');
        await completeKey(app.db, claimed.scope, claimed.key, {
          status: reply.statusCode,
          body: request.idempotencyReceipt ? request.idempotencyReceipt(body) : body,
          contentType: String(reply.getHeader('content-type') ?? 'application/json; charset=utf-8'),
        });
      }
    } catch (error) {
      request.log.error({ err: error }, 'idempotency record update failed');
    }
    return payload;
  });
}
