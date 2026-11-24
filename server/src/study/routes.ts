import type { FastifyInstance } from 'fastify';
import { and, asc, between, eq } from 'drizzle-orm';
import { studySessions } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { toRecordView, type StudyRecordView } from './timer.js';
import { daysBetween, isDateString, isTimezone } from './time.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 계약 `/study/records`의 `to` 설명: 포함, 최대 62일. */
const MAX_RECORD_DAYS = 62;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function onlyKeys(body: Record<string, unknown>, allowed: string[]): void {
  const unknown = Object.keys(body).find((key) => !allowed.includes(key));
  if (unknown) throw errors.validation('알 수 없는 항목이에요', unknown);
}

function sessionIdParam(params: unknown): string {
  const id = (params as { session_id?: string }).session_id;
  if (typeof id !== 'string' || !UUID.test(id)) throw errors.validation('세션 id가 올바르지 않아요', 'session_id');
  return id.toLowerCase();
}

const shortId = (id: string) => id.slice(0, 4);

export function registerTimerRoutes(app: FastifyInstance): void {
  const timer = app.timer;

  app.get('/study/active-session', async (request, reply) => reply.ok({ session: await timer.active(request.auth!.user.id) }));

  app.post('/study/active-session/start', { config: { idempotent: true } }, async (request, reply) => {
    const body = request.body;
    if (!isPlainObject(body)) throw errors.validation('보낼 내용이 없어요');
    onlyKeys(body, ['subject', 'timezone']);
    if (!('subject' in body) || (body.subject !== null && typeof body.subject !== 'string')) {
      throw errors.validation('과목 값이 올바르지 않아요', 'subject');
    }
    if (!isTimezone(body.timezone)) throw errors.validation('시간대(IANA 이름)가 올바르지 않아요', 'timezone');
    const startedAt = Date.now();
    const result = await timer.start(request.auth!.user.id, { subject: body.subject as string | null, timezone: body.timezone });
    request.log.info(
      `study session start session: ${shortId(result.session.id)} created: ${result.created} elapsed_ms: ${Date.now() - startedAt}`,
    );
    return reply.ok({ session: result.session }, result.created ? 201 : 200);
  });

  app.post('/study/active-session/:session_id/pause', { config: { idempotent: true } }, async (request, reply) =>
    reply.ok({ session: await timer.pause(request.auth!.user.id, sessionIdParam(request.params)) }),
  );

  app.post('/study/active-session/:session_id/resume', { config: { idempotent: true } }, async (request, reply) =>
    reply.ok({ session: await timer.resume(request.auth!.user.id, sessionIdParam(request.params)) }),
  );

  app.post('/study/active-session/:session_id/finish', { config: { idempotent: true } }, async (request, reply) => {
    const sessionId = sessionIdParam(request.params);
    const startedAt = Date.now();
    const record = await timer.finish(request.auth!.user.id, sessionId);
    request.log.info(
      `study session finish session: ${shortId(sessionId)} focused_seconds: ${record?.focused_seconds ?? 0} elapsed_ms: ${Date.now() - startedAt}`,
    );
    return reply.ok({ record });
  });

  // 계약: 멱등이라 Idempotency-Key가 필요 없다(관측 구간은 다시 계산한다).
  app.put('/study/presence', async (request, reply) => {
    const body = request.body;
    if (!isPlainObject(body)) throw errors.validation('보낼 내용이 없어요', 'session_id');
    onlyKeys(body, ['session_id']);
    if (typeof body.session_id !== 'string' || !UUID.test(body.session_id)) throw errors.validation('세션 id가 올바르지 않아요', 'session_id');
    await timer.presence(request.auth!.user.id, body.session_id.toLowerCase());
    return reply.code(204).send();
  });

  app.get('/study/records', async (request, reply) => {
    const { from, to } = request.query as { from?: unknown; to?: unknown };
    if (!isDateString(from)) throw errors.validation('시작 날짜(YYYY-MM-DD)가 필요해요', 'from');
    if (!isDateString(to)) throw errors.validation('끝 날짜(YYYY-MM-DD)가 필요해요', 'to');
    const days = daysBetween(from, to) + 1;
    if (days < 1 || days > MAX_RECORD_DAYS) throw errors.validation(`기간은 1–${MAX_RECORD_DAYS}일이에요`, 'to');
    const rows = await app.db
      .select()
      .from(studySessions)
      .where(
        and(
          eq(studySessions.userId, request.auth!.user.id),
          eq(studySessions.status, 'finished'),
          between(studySessions.studyDate, from, to),
        ),
      )
      .orderBy(asc(studySessions.startedAt), asc(studySessions.id));
    return reply.ok({ items: rows.map(toRecordView).filter((r): r is StudyRecordView => r !== null) });
  });
}
