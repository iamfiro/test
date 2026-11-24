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
  accountRateLimited: (retryAfterSeconds: number) =>
    new AppError(429, 'ACCOUNT_RATE_LIMITED', '이 네트워크에서 새로 시작한 사람이 너무 많아요. 잠시 뒤 다시 시도해 주세요', undefined, {
      'retry-after': String(retryAfterSeconds),
    }),
  accountCreateDisabled: () =>
    new AppError(503, 'ACCOUNT_CREATE_DISABLED', '지금은 새로 시작할 수 없어요. 잠시 뒤 다시 시도해 주세요'),
  accountCreateRestricted: () =>
    new AppError(403, 'ACCOUNT_CREATE_RESTRICTED', '이 네트워크에서는 새로 시작할 수 없어요'),
  sessionNotActive: () =>
    new AppError(409, 'SESSION_NOT_ACTIVE', '진행 중인 공부가 아니에요. 화면을 새로 고쳐 주세요'),
  roomHostOnly: () => new AppError(403, 'STUDY_ROOM_HOST_ONLY', '방장만 할 수 있어요'),
  roomWrongPassword: () => new AppError(403, 'STUDY_ROOM_WRONG_PASSWORD', '비밀번호가 맞지 않아요'),
  roomMapNotOwned: () => new AppError(403, 'STUDY_ROOM_MAP_NOT_OWNED', '아직 쓸 수 없는 맵이에요'),
  roomFull: () => new AppError(409, 'STUDY_ROOM_FULL', '정원이 찼어요'),
  roomAlreadyMember: (roomId: string, isHost: boolean) =>
    new AppError(409, 'STUDY_ROOM_ALREADY_MEMBER', '공부방은 하나만 참여할 수 있어요', { room_id: roomId, is_host: isHost }),
  roomNotMember: () => new AppError(403, 'STUDY_ROOM_NOT_MEMBER', '이 공부방 멤버가 아니에요'),
  roomSeatTaken: () => new AppError(409, 'STUDY_ROOM_SEAT_TAKEN', '다른 사람이 앉은 자리예요'),
  roomCapacityBelowMembers: () =>
    new AppError(409, 'STUDY_ROOM_CAPACITY_BELOW_MEMBERS', '지금 멤버 수보다 정원을 작게 할 수 없어요'),
  roomCreateDisabled: () => new AppError(503, 'ROOM_CREATE_DISABLED', '지금은 공부방을 만들 수 없어요. 잠시 뒤 다시 시도해 주세요'),
  roomCreateRestricted: () => new AppError(403, 'ROOM_CREATE_RESTRICTED', '공부방을 만들 수 없는 상태예요'),
  roomCreateRateLimited: (retryAfterSeconds: number) =>
    new AppError(429, 'ROOM_CREATE_RATE_LIMITED', '오늘 이 네트워크에서 만든 공부방이 너무 많아요', undefined, {
      'retry-after': String(retryAfterSeconds),
    }),
  payloadTooLarge: () => new AppError(413, 'PAYLOAD_TOO_LARGE', '요청이 너무 커요'),
  serviceUnavailable: () => new AppError(503, 'SERVICE_UNAVAILABLE', '서비스를 잠시 쓸 수 없어요'),
  internal: () => new AppError(500, 'INTERNAL_ERROR', '문제가 생겼어요. 잠시 뒤 다시 시도해 주세요'),
};
