import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, errors } from './errors.js';

declare module 'fastify' {
  interface FastifyReply {
    /** 성공 봉투 `{data, error: null, meta}`로 답한다. */
    ok(data: unknown, status?: number): FastifyReply;
  }
}

function meta(request: FastifyRequest) {
  return { requestId: request.id, timestamp: new Date().toISOString() };
}

function toAppError(error: FastifyError | AppError | Error): AppError {
  if (error instanceof AppError) return error;
  const fastifyError = error as FastifyError;
  switch (fastifyError.code) {
    case 'FST_ERR_CTP_BODY_TOO_LARGE':
      return errors.payloadTooLarge();
    case 'FST_ERR_CTP_INVALID_JSON_BODY':
    case 'FST_ERR_CTP_EMPTY_JSON_BODY':
    case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
    case 'FST_ERR_CTP_INVALID_CONTENT_LENGTH':
      return errors.validation('요청 본문을 읽을 수 없어요');
    default:
      return errors.internal();
  }
}

export function registerEnvelope(app: FastifyInstance): void {
  app.decorateReply('ok', function ok(this: FastifyReply, data: unknown, status = 200) {
    return this.code(status).send({ data, error: null, meta: meta(this.request) });
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.setNotFoundHandler((request, reply) => {
    const error = errors.notFound();
    return reply.code(error.status).send({
      data: null,
      error: { code: error.code, message: error.message },
      meta: meta(request),
    });
  });

  app.setErrorHandler((rawError, request, reply) => {
    const error = toAppError(rawError as Error);
    if (error.status >= 500) {
      request.log.error({ err: rawError }, `request failed code: ${error.code}`);
    }
    for (const [name, value] of Object.entries(error.headers ?? {})) reply.header(name, value);
    return reply.code(error.status).send({
      data: null,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      meta: meta(request),
    });
  });
}
