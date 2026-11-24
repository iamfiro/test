import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { parseAvatar } from './avatar.js';
import { parseNickname } from './nickname.js';
import { serializeMe, serializeProfile } from './serialize.js';

const ALLOWED_FIELDS = new Set(['nickname', 'avatar', 'gender']);

export function registerProfileRoutes(app: FastifyInstance): void {
  app.get('/users/me/profile', async (request, reply) => reply.ok({ profile: serializeProfile(request.auth!.user) }));

  app.patch('/users/me/profile', { config: { idempotent: true } }, async (request, reply) => {
    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw errors.validation('보낼 내용이 없어요');
    const input = body as Record<string, unknown>;
    const keys = Object.keys(input);
    if (keys.length === 0) throw errors.validation('바꿀 항목을 하나 이상 보내 주세요');
    const unknown = keys.find((key) => !ALLOWED_FIELDS.has(key));
    if (unknown) throw errors.validation('알 수 없는 항목이에요', unknown);

    const changes: Partial<typeof users.$inferInsert> = {};
    if ('nickname' in input) {
      const nickname = parseNickname(input.nickname);
      if (nickname === null) throw errors.validation('닉네임은 1–12자로, 줄바꿈 같은 문자는 쓸 수 없어요', 'nickname');
      changes.nickname = nickname;
    }
    if ('avatar' in input) {
      const avatar = parseAvatar(input.avatar);
      if (avatar === null) throw errors.validation('캐릭터 값이 올바르지 않아요', 'avatar');
      changes.avatar = avatar;
    }
    if ('gender' in input) {
      if (input.gender !== 'male' && input.gender !== 'female') throw errors.validation('성별 값이 올바르지 않아요', 'gender');
      changes.gender = input.gender;
    }

    const [updated] = await app.db.update(users).set(changes).where(eq(users.id, request.auth!.user.id)).returning();
    return reply.ok({ profile: serializeProfile(updated!) });
  });

  app.put('/users/me/onboarding', { config: { idempotent: true } }, async (request, reply) => {
    // 이미 남겼으면 처음 시각을 그대로 둔다.
    const [updated] = await app.db
      .update(users)
      .set({ onboardingCompletedAt: sql`coalesce(${users.onboardingCompletedAt}, now())` })
      .where(eq(users.id, request.auth!.user.id))
      .returning();
    return reply.ok(serializeMe(updated!));
  });
}
