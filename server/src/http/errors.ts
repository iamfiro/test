/** 응답 봉투의 `error`로 나가는 오류. `code`는 계약의 안정적인 기계용 코드다. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  notFound: (message = '찾을 수 없어요') => new AppError(404, 'RESOURCE_NOT_FOUND', message),
  unauthorized: () => new AppError(401, 'UNAUTHORIZED', '로그인이 필요해요'),
  csrfRejected: (message = '요청을 확인할 수 없어요') => new AppError(403, 'CSRF_REJECTED', message),
  validation: (message: string, field?: string) =>
    new AppError(422, 'VALIDATION_ERROR', message, field ? { field } : undefined),
  idempotencyKeyRequired: () =>
    new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key 헤더(UUID)가 필요해요', { field: 'Idempotency-Key' }),
  idempotencyKeyReused: () =>
    new AppError(409, 'IDEMPOTENCY_KEY_REUSED', '같은 Idempotency-Key에 다른 요청을 보냈어요'),
  idempotencyInProgress: () =>
    new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', '같은 요청을 처리하고 있어요. 잠시 뒤 다시 시도해 주세요'),
  rateLimited: (retryAfterSeconds: number) =>
    new AppError(429, 'RATE_LIMIT_EXCEEDED', '요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요', undefined, {
      'retry-after': String(retryAfterSeconds),
    }),
  payloadTooLarge: () => new AppError(413, 'PAYLOAD_TOO_LARGE', '요청이 너무 커요'),
  serviceUnavailable: () => new AppError(503, 'SERVICE_UNAVAILABLE', '서비스를 잠시 쓸 수 없어요'),
  internal: () => new AppError(500, 'INTERNAL_ERROR', '문제가 생겼어요. 잠시 뒤 다시 시도해 주세요'),
};
