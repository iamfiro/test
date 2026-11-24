import type { UserRow } from '../auth/session.js';
import type { DbExecutor } from '../db/client.js';
import { userTagsOf } from '../tags/catalog.js';

/** 공개 프로필. `tags`는 내 태그(카탈로그 순서)다. */
export async function serializeProfile(db: DbExecutor, user: UserRow) {
  return {
    nickname: user.nickname,
    avatar: user.avatar,
    tags: await userTagsOf(db, user.id),
    gender: user.gender,
  };
}

export async function serializeMe(db: DbExecutor, user: UserRow) {
  return {
    id: user.id,
    profile: await serializeProfile(db, user),
    created_at: user.createdAt.toISOString(),
    onboarding_completed_at: user.onboardingCompletedAt?.toISOString() ?? null,
  };
}

export async function serializeSession(db: DbExecutor, user: UserRow, csrfToken: string) {
  return { user: await serializeMe(db, user), csrf_token: csrfToken };
}
