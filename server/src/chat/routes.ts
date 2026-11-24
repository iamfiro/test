import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { chatBlocks, users } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { listBlocks } from './service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 한 사람이 차단할 수 있는 수. 목록을 한 번에 돌려주므로 끝이 있어야 한다. */
export const BLOCKS_MAX = 500;

const shortId = (id: string) => id.slice(0, 4);

function targetParam(request: FastifyRequest): string {
  const id = (request.params as { user_id?: string }).user_id ?? '';
  if (!UUID.test(id)) throw errors.notFound('사용자를 찾을 수 없어요');
  return id.toLowerCase();
}

/**
 * 채팅 차단(결정 9: 내 화면에서 숨김). 소켓이 아니라 HTTP로 둔다: 쓰기 성공을 응답으로 확인하고(멱등 키·CSRF·오류 봉투),
 * 소켓이 끊겨 있어도 목록을 읽고 바꿀 수 있어야 해서다. 바뀌면 열린 소켓의 차단 목록을 다시 읽는다.
 */
export function registerChatRoutes(app: FastifyInstance): void {
  app.get('/users/me/blocks', async (request, reply) => reply.ok({ blocks: await listBlocks(app.db, request.auth!.user.id) }));

  app.put('/users/me/blocks/:user_id', { config: { idempotent: true } }, async (request, reply) => {
    const userId = request.auth!.user.id;
    const targetId = targetParam(request);
    if (targetId === userId) throw errors.validation('나는 차단할 수 없어요', 'user_id');
    const [target] = await app.db.select({ id: users.id }).from(users).where(eq(users.id, targetId));
    if (!target) throw errors.notFound('사용자를 찾을 수 없어요');
    const current = await listBlocks(app.db, userId);
    if (!current.some((b) => b.user_id === targetId)) {
      if (current.length >= BLOCKS_MAX) throw errors.validation(`차단은 ${BLOCKS_MAX}명까지 할 수 있어요`, 'user_id');
      await app.db.insert(chatBlocks).values({ userId, blockedUserId: targetId, createdAt: app.now() }).onConflictDoNothing();
      app.bus.publish({ kind: 'blocks', userId });
      request.log.info(`chat block added user: ${shortId(userId)} target: ${shortId(targetId)}`);
    }
    const block = (await listBlocks(app.db, userId)).find((b) => b.user_id === targetId)!;
    return reply.ok({ block });
  });

  app.delete('/users/me/blocks/:user_id', { config: { idempotent: true } }, async (request, reply) => {
    const userId = request.auth!.user.id;
    const id = (request.params as { user_id?: string }).user_id ?? '';
    if (UUID.test(id)) {
      const removed = await app.db
        .delete(chatBlocks)
        .where(and(eq(chatBlocks.userId, userId), eq(chatBlocks.blockedUserId, id.toLowerCase())))
        .returning({ id: chatBlocks.blockedUserId });
      if (removed.length > 0) {
        app.bus.publish({ kind: 'blocks', userId });
        request.log.info(`chat block removed user: ${shortId(userId)} target: ${shortId(id)}`);
      }
    }
    return reply.code(204).send();
  });
}
