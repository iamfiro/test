import type { FastifyInstance } from 'fastify';
import { lt, sql } from 'drizzle-orm';
import type { Db } from './db/client.js';
import { accountCreations, idempotencyKeys, roomCreations, sessions, studyRoomInvites } from './db/schema.js';
import { purgeExpiredRestrictions } from './moderation/restrictions.js';
import { purgeOldMessages } from './chat/service.js';

const INTERVAL_MS = 60 * 60 * 1000;

/** 만료된 멱등 기록·세션·정지·초대, 하루 지난 IP 기록(계정·방 만들기), 30일 지난 채팅 메시지를 지운다. */
export async function purgeExpired(
  db: Db,
): Promise<{
  idempotency: number;
  sessions: number;
  accountCreations: number;
  restrictions: number;
  roomCreations: number;
  invites: number;
  chatMessages: number;
}> {
  const [idempotency, expiredSessions, creations, restrictions, rooms, invites, chatMessages] = await Promise.all([
    db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, sql`now()`)).returning({ k: idempotencyKeys.key }),
    db.delete(sessions).where(lt(sessions.expiresAt, sql`now()`)).returning({ k: sessions.idHash }),
    db.delete(accountCreations).where(lt(accountCreations.createdAt, sql`now() - interval '24 hours'`)).returning({ k: accountCreations.id }),
    purgeExpiredRestrictions(db, new Date()),
    db.delete(roomCreations).where(lt(roomCreations.createdAt, sql`now() - interval '24 hours'`)).returning({ k: roomCreations.id }),
    db.delete(studyRoomInvites).where(lt(studyRoomInvites.expiresAt, sql`now()`)).returning({ k: studyRoomInvites.roomId }),
    purgeOldMessages(db, new Date()),
  ]);
  return {
    idempotency: idempotency.length,
    sessions: expiredSessions.length,
    accountCreations: creations.length,
    restrictions,
    roomCreations: rooms.length,
    invites: invites.length,
    chatMessages,
  };
}

/** 서버가 켜져 있는 동안 한 시간마다 정리한다. 시작 때도 한 번 한다. */
export function startMaintenance(app: FastifyInstance): void {
  const run = () => {
    const startedAt = Date.now();
    purgeExpired(app.db)
      .then((counts) =>
        app.log.info(
          `maintenance purge done idempotency: ${counts.idempotency} sessions: ${counts.sessions} account_creations: ${counts.accountCreations} restrictions: ${counts.restrictions} room_creations: ${counts.roomCreations} invites: ${counts.invites} chat_messages: ${counts.chatMessages} elapsed_ms: ${Date.now() - startedAt}`,
        ),
      )
      .catch((error: unknown) => app.log.warn({ err: error }, 'maintenance purge failed'));
  };
  run();
  const timer = setInterval(run, INTERVAL_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
