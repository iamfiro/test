import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { idempotencyKeys, sessions, users } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { awaitStored, claimKey, completeKey, readIdempotencyKey, releaseKey } from '../http/idempotency.js';
import { serializeSession } from '../profile/serialize.js';
import { createAnonymousAccount, findOrCreateDevAccount } from './accounts.js';
import { activeIpRestriction } from '../moderation/restrictions.js';
import { clearSessionCookie, createSession, SESSION_COOKIE, setSessionCookie } from './session.js';

const START_SCOPE = 'auth-start';
const DEV_SUBJECT = /^[a-z0-9_-]{1,32}$/;

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/auth/session', { config: { touchSession: true } }, async (request, reply) => {
    const { user, csrfToken } = request.auth!;
    return reply.ok(await serializeSession(app.db, user, csrfToken));
  });

  app.post('/auth/start', { config: { auth: 'optional', csrf: false } }, async (request, reply) => {
    const key = readIdempotencyKey(request);
    if (request.auth) return reply.ok(await serializeSession(app.db, request.auth.user, request.auth.csrfToken));

    for (;;) {
      if (await claimKey(app.db, START_SCOPE, key, 'start')) {
        try {
          // 새 계정을 만들 때만 막는다. 세션이 있는 사람과 이미 만든 계정의 재시도(아래)는 지나간다.
          if (!(await app.settings.isEnabled('account_create_enabled'))) throw errors.accountCreateDisabled();
          if (await activeIpRestriction(app.db, request.ip, 'account_create', app.now())) throw errors.accountCreateRestricted();
          const created = await createAnonymousAccount(app.db, request.ip, app.config.accountCreatePerIpPerHour);
          await completeKey(app.db, START_SCOPE, key, {
            status: 200,
            body: JSON.stringify({ user_id: created.user.id }),
            contentType: 'application/json',
          });
          setSessionCookie(reply, created.token);
          return reply.ok(await serializeSession(app.db, created.user, created.csrfToken));
        } catch (error) {
          await releaseKey(app.db, START_SCOPE, key);
          throw error;
        }
      }

      // 같은 키로 이미 만든 계정이 있다: 응답(쿠키)을 못 받은 재시도다. 같은 계정에 새 세션을 준다.
      const stored = await awaitStored(app.db, START_SCOPE, key, 'start');
      if (stored === 'retry') continue;
      const { user_id: userId } = JSON.parse(stored.body) as { user_id: string };
      const [user] = await app.db.select().from(users).where(eq(users.id, userId));
      if (!user) {
        await releaseKey(app.db, START_SCOPE, key); // 그 사이 지워진 계정이면 처음부터 다시
        continue;
      }
      const session = await createSession(app.db, user.id);
      setSessionCookie(reply, session.token);
      return reply.ok(await serializeSession(app.db, user, session.csrfToken));
    }
  });

  app.post('/auth/login/dev', { config: { auth: 'none' } }, async (request, reply) => {
    if (!app.config.devLoginEnabled) throw errors.notFound();
    const subject = (request.body as { subject?: unknown } | null)?.subject;
    if (typeof subject !== 'string' || !DEV_SUBJECT.test(subject)) throw errors.validation('subject 형식이 올바르지 않아요', 'subject');
    const user = await findOrCreateDevAccount(app.db, subject);
    const session = await createSession(app.db, user.id);
    setSessionCookie(reply, session.token);
    return reply.ok(await serializeSession(app.db, user, session.csrfToken));
  });

  app.post('/auth/logout', { config: { auth: 'optional' } }, async (request, reply) => {
    if (request.auth) await app.db.delete(sessions).where(eq(sessions.idHash, request.auth.sessionHash));
    if (request.cookies[SESSION_COOKIE]) clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.post('/auth/logout-all', async (request, reply) => {
    await app.db.delete(sessions).where(eq(sessions.userId, request.auth!.user.id));
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.delete('/users/me', async (request, reply) => {
    const userId = request.auth!.user.id;
    // 내가 방장인 방은 지우고 다른 방 자리는 비운다(방 서비스가 같은 트랜잭션에서 하고 커밋 뒤 알린다).
    await app.rooms.deleteAccount(userId, async (tx) => {
      // 멱등 기록은 사용자 id를 열이 아닌 범위 문자열로 갖고 있어 따로 지운다.
      await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.scope, `user:${userId}`));
      await tx.delete(users).where(eq(users.id, userId)); // 세션 등 사용자에 딸린 행은 cascade
    });
    app.bus.publish({ kind: 'user_deleted', userId }); // 열린 소켓을 닫는다
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
}
