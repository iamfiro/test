import type { UserRow } from '../auth/session.js';

export function serializeProfile(user: UserRow) {
  return {
    nickname: user.nickname,
    avatar: user.avatar,
    // 내 태그는 태그 카탈로그(L4)가 생기면 채운다. 그 전에는 고를 방법이 없어 항상 빈 목록이다.
    tags: [] as unknown[],
    gender: user.gender,
  };
}

export function serializeMe(user: UserRow) {
  return {
    id: user.id,
    profile: serializeProfile(user),
    created_at: user.createdAt.toISOString(),
    onboarding_completed_at: user.onboardingCompletedAt?.toISOString() ?? null,
  };
}

export function serializeSession(user: UserRow, csrfToken: string) {
  return { user: serializeMe(user), csrf_token: csrfToken };
}
