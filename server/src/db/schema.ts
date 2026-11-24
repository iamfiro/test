import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
