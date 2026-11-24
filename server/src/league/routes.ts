import type { FastifyInstance } from 'fastify';
import { errors } from '../http/errors.js';
import { replyWithEtag } from '../http/etag.js';
import { isWeekStart } from './week.js';

/** 정산 잡이 마감·지연이 지났는지 다시 보는 간격. 정산은 그때 한 번만 일어나므로 조회 비용만 든다. */
const SETTLE_CHECK_INTERVAL_MS = 60_000;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export function registerLeagueRoutes(app: FastifyInstance): void {
  app.get('/study/league', async (request, reply) => replyWithEtag(request, reply, await app.league.standing(request.auth!.user.id)));

  app.get('/study/league/results/latest', async (request, reply) => {
    const result = await app.league.latestResult(request.auth!.user.id);
    if (!result) return reply.code(204).send();
    return reply.ok(result);
  });

  app.post('/study/league/results/:week_start/seen', { config: { idempotent: true } }, async (request, reply) => {
    const raw = (request.params as { week_start?: string }).week_start ?? '';
    const ms = ISO_INSTANT.test(raw) ? Date.parse(raw) : Number.NaN;
    if (Number.isNaN(ms)) throw errors.validation('주 시작 시각(ISO)이 올바르지 않아요', 'week_start');
    if (!isWeekStart(ms)) throw errors.notFound('이 주의 리그 결과가 없어요');
    await app.league.markSeen(request.auth!.user.id, ms);
    return reply.code(204).send();
  });
}

/** 서버 시작 때 밀린 주를 정산하고, 그 뒤로 1분마다 마감·지연이 지난 주가 있는지 본다. */
export function startLeagueJob(app: FastifyInstance): void {
  let running = false;
  const run = () => {
    if (running) return;
    running = true;
    const startedAt = Date.now();
    app.league
      .settleDue()
      .then((weeks) => {
        for (const week of weeks) {
          app.log.warn(`league week settled week_start: ${new Date(week).toISOString()} elapsed_ms: ${Date.now() - startedAt}`);
        }
      })
      .catch((error: unknown) => app.log.error({ err: error }, 'league settle failed'))
      .finally(() => {
        running = false;
      });
  };
  run();
  const timer = setInterval(run, SETTLE_CHECK_INTERVAL_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
}
