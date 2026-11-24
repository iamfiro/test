import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** 쓰기 요청의 Idempotency-Key 기록. (scope, key)가 같으면 같은 요청이다. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    scope: text('scope').notNull(),
    key: uuid('key').notNull(),
    requestHash: text('request_hash').notNull(),
    state: text('state', { enum: ['in_progress', 'done'] }).notNull(),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    responseContentType: text('response_content_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.scope, table.key] })],
);

export interface AvatarValue {
  shape: string;
  color: string;
  eyes: string;
  mouth: string;
  accessory: string;
}

/** 계정. 로그인이 없는 데모에서는 익명 계정이고, 계정에 속한 모든 테이블은 `user_id`로 이 행을 가리켜 삭제 때 함께 지운다. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nickname: text('nickname').notNull(),
    avatar: jsonb('avatar').$type<AvatarValue>().notNull(),
    gender: text('gender', { enum: ['male', 'female'] }),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    /** 개발 전용 로그인의 subject. 운영에서는 항상 null. */
    devSubject: text('dev_subject'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('users_dev_subject_key').on(table.devSubject)],
);

/** 서버 저장 세션. 쿠키의 불투명 값은 저장하지 않고 SHA-256만 둔다. */
export const sessions = pgTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    csrfToken: text('csrf_token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId), index('sessions_expires_at_idx').on(table.expiresAt)],
);

/** IP당 새 계정 수 제한용 기록. 24시간 뒤 지운다(개인정보처리방침의 접속 IP 보관 기간). */
export const accountCreations = pgTable(
  'account_creations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('account_creations_ip_created_idx').on(table.ip, table.createdAt)],
);

/** 하루 목표·과목 목록·고른 과목(앱에서는 기기 설정, 웹은 브라우저 저장소에 사용자 데이터를 두지 않아 서버에 둔다). 행이 없으면 기본값. */
export const studySettings = pgTable('study_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  dailyGoalMinutes: integer('daily_goal_minutes'),
  subjects: jsonb('subjects').$type<string[]>().notNull(),
  subject: text('subject'),
  /** 과목 이름 → 색 번호(0–7, 앱 StudySubjectPalette 순서). */
  subjectColors: jsonb('subject_colors').$type<Record<string, number>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export interface SegmentValue {
  started_at: string;
  /** 열린 구간이면 null(진행 중 세션의 마지막 구간만). */
  ended_at: string | null;
}

/**
 * 공부 세션. 진행 중(`active`)은 계정당 하나(부분 고유 인덱스, 결정 12). 끝내면 `finished`(기록)이고,
 * 공부한 시간이 0초면 `discarded`(기록 아님, 같은 세션을 다시 끝내는 재시도에 같은 답을 주려고 남긴다).
 * 시각은 모두 서버 시각이다.
 */
export const studySessions = pgTable(
  'study_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['active', 'finished', 'discarded'] }).notNull(),
    subject: text('subject'),
    /** 이 세션의 공부일(04:00 경계)을 정하는 IANA 시간대. */
    timezone: text('timezone').notNull(),
    segments: jsonb('segments').$type<SegmentValue[]>().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }),
    focusedSeconds: integer('focused_seconds'),
    /** 시작 시각의 공부일(세션 시간대 04:00 경계). 끝낼 때 정한다. */
    studyDate: date('study_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('study_sessions_one_active_per_user').on(table.userId).where(sql`${table.status} = 'active'`),
    index('study_sessions_user_study_date_idx').on(table.userId, table.studyDate),
    index('study_sessions_user_ended_at_idx').on(table.userId, table.endedAt),
  ],
);

/**
 * presence 관측 구간: 화면이 열려 있다는 신호를 **서버가 받은 시각**으로 이은 구간. 신호 사이가 75초를 넘으면 새 구간.
 * 인정 시간 계산에만 쓰고 응답에는 내보내지 않는다.
 */
export const presenceSpans = pgTable(
  'presence_spans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => studySessions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [index('presence_spans_session_ended_idx').on(table.sessionId, table.endedAt)],
);

/**
 * 인정 공부 구간(리그 점수·스트릭의 원천): 세션의 공부 구간 ∩ (관측 구간 앞뒤 45초 여유), 지금을 넘지 않는다.
 * 세션마다 관측·상태 변경 때 다시 계산해 통째로 바꾼다(더하지 않으므로 재전송해도 늘지 않는다). 계정당 진행 중
 * 세션이 하나라 세션끼리 겹치지 않는다. 한 행은 세션 시간대의 공부일 하나 안에 있다(04:00에서 자름).
 * 리그 주는 절대 시각(`started_at`·`ended_at`)으로, 스트릭은 `study_date`로 합한다.
 */
export const rankedSegments = pgTable(
  'ranked_segments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => studySessions.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, precision: 3 }).notNull(),
    studyDate: date('study_date', { mode: 'string' }).notNull(),
    timezone: text('timezone').notNull(),
  },
  (table) => [
    index('ranked_segments_user_started_idx').on(table.userId, table.startedAt),
    index('ranked_segments_user_study_date_idx').on(table.userId, table.studyDate),
    index('ranked_segments_session_idx').on(table.sessionId),
    check('ranked_segments_positive', sql`${table.endedAt} > ${table.startedAt}`),
  ],
);

/**
 * 운영 설정(긴급 스위치). 배포 없이 CLI로 바꾸고 서버는 짧은 캐시(`SETTINGS_CACHE_MS`) 뒤 바로 따른다.
 * 키와 기본값은 `src/moderation/settings.ts`의 `SETTINGS`가 정한다. 행이 없으면 그 기본값이다.
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 운영자가 건 계정 단위 정지. 같은 종류를 다시 걸면 기한·사유를 바꾼다. */
export const userRestrictions = pgTable(
  'user_restrictions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['chat', 'room_create'] }).notNull(),
    until: timestamp('until', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind] })],
);

/** 운영자가 건 IP 단위 정지. 기한이 지나면 서버가 지운다(IP를 필요 이상 두지 않는다). */
export const ipRestrictions = pgTable(
  'ip_restrictions',
  {
    ip: text('ip').notNull(),
    kind: text('kind', { enum: ['chat', 'room_create', 'account_create'] }).notNull(),
    until: timestamp('until', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.ip, table.kind] }), index('ip_restrictions_until_idx').on(table.until)],
);

/**
 * 신고. `target_type`·`target_id`가 대상(메시지 id·사용자 id·방 id)이고 `target_user_id`는 그 내용의 주인이다
 * (닉네임이면 본인, 메시지면 작성자). 신고자나 주인이 계정을 지우면 함께 지운다. `content`는 신고 시점 내용
 * (닉네임·메시지·방 이름)이고, 같은 내용에 대한 미처리 신고 수가 기준(`REPORT_HIDE_THRESHOLD`)에 닿으면 처리하고
 * `handled_at`·`action`을 남긴다. 한 사람은 같은 대상의 같은 내용을 한 번만 신고한다.
 */
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type', { enum: ['message', 'nickname', 'room_name'] }).notNull(),
    targetId: text('target_id').notNull(),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    reason: text('reason').notNull(),
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    handledAt: timestamp('handled_at', { withTimezone: true, precision: 3 }),
    action: text('action'),
  },
  (table) => [
    uniqueIndex('reports_one_per_reporter').on(table.reporterUserId, table.targetType, table.targetId, table.content),
    index('reports_target_idx').on(table.targetType, table.targetId),
    index('reports_target_user_idx').on(table.targetUserId),
    index('reports_created_idx').on(table.createdAt),
  ],
);

/**
 * 태그 카탈로그(study-tags.md). `name_key`는 비교용 정규화 이름(NFC·`#` 제거·앞뒤 공백·소문자)이고,
 * 정규 이름과 별칭(`tag_aliases.alias_key`)은 서로 겹치지 않는다(겹침 검사는 CLI가 한다).
 */
export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: ['exam', 'kind'] }).notNull(),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('tags_name_key').on(table.nameKey)],
);

/** 태그 별칭(`정처기` → 정보처리기사). 자동완성에서 정규 태그로 바꿔 보인다. */
export const tagAliases = pgTable(
  'tag_aliases',
  {
    aliasKey: text('alias_key').primaryKey(),
    alias: text('alias').notNull(),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [index('tag_aliases_tag_idx').on(table.tagId)],
);

/** 내 태그(공개, 최대 5개는 서버가 확인). */
export const userTags = pgTable(
  'user_tags',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tagId] }), index('user_tags_tag_idx').on(table.tagId)],
);

/** 카탈로그에 없는 태그 제안. 운영자가 CLI로 새 태그·별칭으로 받거나 거절한다. 같은 사람의 같은 이름은 한 건. */
export const tagSuggestions = pgTable(
  'tag_suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull().default('pending'),
    /** 처리 결과: `tag:<이름>`(새 태그), `alias:<정규 이름>`(별칭), 거절이면 null. */
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('tag_suggestions_one_per_user').on(table.userId, table.nameKey),
    index('tag_suggestions_status_created_idx').on(table.status, table.createdAt),
  ],
);

/**
 * 공부방(study-room-detail.md). 방장은 첫 멤버이고 방장이 계정을 지우면 방도 지운다(cascade). 비밀번호는 방장이
 * 다시 읽어야 해서 해시가 아니라 `ROOM_PASSWORD_KEY`로 암호화한 값만 둔다(`src/rooms/password.ts`).
 */
export const studyRooms = pgTable(
  'study_rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostUserId: uuid('host_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    map: text('map', { enum: ['cafe', 'library', 'rooftop'] }).notNull(),
    capacity: integer('capacity').notNull(),
    passwordCiphertext: text('password_ciphertext'),
    /** 배너·로고 파일 id. 미디어 키는 `rooms/<id>/<slot>/<파일 id>`이고, 바꾸면 새 id(새 키)다. 없으면 null. */
    bannerId: text('banner_id'),
    logoId: text('logo_id'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    index('study_rooms_created_idx').on(table.createdAt),
    check('study_rooms_capacity_range', sql`${table.capacity} between 2 and 50`),
  ],
);

/** 방 멤버. 한 사람은 방 하나에만 속한다(고유 인덱스 `user_id`). 방장도 멤버 행이 있다. */
export const studyRoomMembers = pgTable(
  'study_room_members',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => studyRooms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.userId] }),
    uniqueIndex('study_room_members_one_room_per_user').on(table.userId),
  ],
);

/** 방 태그(방장이 고름, 최대 3개는 서버가 확인). */
export const roomTags = pgTable(
  'room_tags',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => studyRooms.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roomId, table.tagId] }), index('room_tags_tag_idx').on(table.tagId)],
);

/** 초대 링크. 방마다 마지막 것 하나만 유효하다. 토큰은 SHA-256 다이제스트만 둔다. */
export const studyRoomInvites = pgTable(
  'study_room_invites',
  {
    roomId: uuid('room_id')
      .primaryKey()
      .references(() => studyRooms.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('study_room_invites_token_hash_key').on(table.tokenHash)],
);

/** IP당 하루 방 만들기 수 제한용 기록. 24시간 뒤 지운다(접속 IP 보관 기간). */
export const roomCreations = pgTable(
  'room_creations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ip: text('ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('room_creations_ip_created_idx').on(table.ip, table.createdAt)],
);
