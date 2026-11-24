import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema.js';
import { errors } from '../http/errors.js';
import { randomNickname } from '../profile/nickname.js';
import { fileReport, REPORT_DETAIL_MAX, REPORT_REASONS, type ReportReason, type ReportRow } from './reports.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = ['target_type', 'target_id', 'reason', 'detail'];
/** HTTP로 받는 대상 종류. 메시지는 L5 소켓 계약, 방 이름은 L4(방 테이블)에서 붙인다. */
const HTTP_TARGET_TYPES = new Set(['nickname']);
/** 줄바꿈·탭을 뺀 제어 문자. */
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/;

const shortId = (id: string) => id.slice(0, 4);

function serializeReport(row: ReportRow) {
  return {
    target_type: row.targetType,
    target_id: row.targetId,
    reason: row.reason,
    created_at: row.createdAt.toISOString(),
  };
}

function parseDetail(reason: ReportReason, value: unknown): string | null {
  if (value === undefined || value === null) {
    if (reason === 'other') throw errors.validation('어떤 문제인지 적어 주세요', 'detail');
    return null;
  }
  if (typeof value !== 'string') throw errors.validation('설명 값이 올바르지 않아요', 'detail');
  const detail = value.trim();
  if (detail.length === 0) {
    if (reason === 'other') throw errors.validation('어떤 문제인지 적어 주세요', 'detail');
    return null;
  }
  if ([...detail].length > REPORT_DETAIL_MAX || CONTROL.test(detail)) {
    throw errors.validation(`설명은 ${REPORT_DETAIL_MAX}자까지 쓸 수 있어요`, 'detail');
  }
  return detail;
}

export function registerReportRoutes(app: FastifyInstance): void {
  app.post('/reports', { config: { idempotent: true } }, async (request, reply) => {
    const startedAt = Date.now();
    const body = request.body;
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw errors.validation('보낼 내용이 없어요');
    const input = body as Record<string, unknown>;
    const unknown = Object.keys(input).find((key) => !ALLOWED_FIELDS.includes(key));
    if (unknown) throw errors.validation('알 수 없는 항목이에요', unknown);
    if (typeof input.target_type !== 'string' || !HTTP_TARGET_TYPES.has(input.target_type)) {
      throw errors.validation('신고할 대상 종류가 올바르지 않아요', 'target_type');
    }
    if (typeof input.target_id !== 'string' || !UUID.test(input.target_id)) {
      throw errors.validation('신고할 대상 id가 올바르지 않아요', 'target_id');
    }
    const reason = input.reason;
    if (typeof reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(reason)) {
      throw errors.validation('신고 이유가 올바르지 않아요', 'reason');
    }
    const detail = parseDetail(reason as ReportReason, input.detail);
    const targetUserId = input.target_id.toLowerCase();

    const result = await fileReport(app.db, {
      reporterUserId: request.auth!.user.id,
      targetType: 'nickname',
      targetId: targetUserId,
      reason: reason as ReportReason,
      detail,
      threshold: app.config.reportHideThreshold,
      loadTarget: async (tx) => {
        const [row] = await tx
          .select({ id: users.id, nickname: users.nickname })
          .from(users)
          .where(eq(users.id, targetUserId))
          .for('update');
        return row ? { targetUserId: row.id, content: row.nickname } : null;
      },
      // 사람이 보기 전에 서로 다른 여러 명이 같은 닉네임을 신고했다: 바로 무작위 이름으로 되돌린다(신고 기록은 남는다).
      onThreshold: async (tx, target) => {
        await tx.update(users).set({ nickname: randomNickname() }).where(eq(users.id, target.targetUserId));
        return 'nickname_reset';
      },
    });
    if (result.action) {
      request.log.warn(
        `report threshold reached target_type: nickname target: ${shortId(targetUserId)} action: ${result.action} elapsed_ms: ${Date.now() - startedAt}`,
      );
    }
    return reply.ok({ report: serializeReport(result.report) });
  });
}
