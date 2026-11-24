import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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

async function claim(db: Db, scope: string, key: string, hash: string): Promise<boolean> {
  await db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key), lt(idempotencyKeys.expiresAt, sql`now()`)));
  const inserted = await db
    .insert(idempotencyKeys)
    .values({ scope, key, requestHash: hash, state: 'in_progress', expiresAt: new Date(Date.now() + TTL_MS) })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  return inserted.length === 1;
}

async function replayOrWait(db: Db, scope: string, key: string, hash: string, reply: FastifyReply): Promise<'replayed' | 'retry'> {
  const startedAt = Date.now();
  for (;;) {
    const [row] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
    if (!row) return 'retry';
    if (row.requestHash !== hash) throw errors.idempotencyKeyReused();
    if (row.state === 'done') {
      reply
        .code(row.responseStatus ?? 200)
        .header('content-type', row.responseContentType ?? 'application/json; charset=utf-8')
        .header('idempotent-replayed', 'true')
        .send(row.responseBody ?? '');
      return 'replayed';
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

  app.addHook('preHandler', async (request, reply) => {
    if (!request.routeOptions.config.idempotent) return;
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) throw errors.idempotencyKeyRequired();
    const normalizedKey = key.toLowerCase();
    const scope = request.idempotencyScope ?? `ip:${request.ip}`;
    const hash = requestHash(request);

    for (;;) {
      if (await claim(app.db, scope, normalizedKey, hash)) {
        request.idempotencyClaim = { scope, key: normalizedKey };
        return;
      }
      if ((await replayOrWait(app.db, scope, normalizedKey, hash, reply)) === 'replayed') return reply;
    }
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const claimed = request.idempotencyClaim;
    if (!claimed) return payload;
    request.idempotencyClaim = undefined;
    try {
      if (reply.statusCode >= 500) {
        await app.db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, claimed.scope), eq(idempotencyKeys.key, claimed.key)));
      } else {
        await app.db
          .update(idempotencyKeys)
          .set({
            state: 'done',
            responseStatus: reply.statusCode,
            responseBody: typeof payload === 'string' ? payload : String(payload ?? ''),
            responseContentType: String(reply.getHeader('content-type') ?? 'application/json; charset=utf-8'),
          })
          .where(and(eq(idempotencyKeys.scope, claimed.scope), eq(idempotencyKeys.key, claimed.key)));
      }
    } catch (error) {
      request.log.error({ err: error }, 'idempotency record update failed');
    }
    return payload;
  });
}

/** 만료된 멱등 기록을 지운다. 서버 시작 때와 주기적으로 부른다. */
export async function purgeExpiredIdempotencyKeys(db: Db): Promise<number> {
  const deleted = await db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, sql`now()`)).returning({ key: idempotencyKeys.key });
  return deleted.length;
}
