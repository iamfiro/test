import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db/client.js';
import { reports } from '../db/schema.js';
import { errors } from '../http/errors.js';

export type ReportTargetType = 'message' | 'nickname' | 'room_name';
export type ReportRow = typeof reports.$inferSelect;

/**
 * 신고 사유. PocketTime 앱 `ReportReason`(lib/feature/moderation/model/report_reason.dart)의 값과 같다.
 * 시간표 정확성 신고인 `wrong_info`는 공부방에 해당하는 대상이 없어 뺐다. `other`만 설명이 필요하다.
 */
export const REPORT_REASONS = ['personal_info', 'defamation', 'profanity', 'sexual', 'impersonation', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_DETAIL_MAX = 1000;

export interface ReportTarget {
  /** 신고당한 내용의 주인(닉네임이면 본인, 메시지면 작성자). */
  targetUserId: string;
  /** 신고 시점 내용(닉네임·메시지·방 이름). 같은 내용의 신고끼리 센다. */
  content: string;
}

export interface FileReportInput {
  reporterUserId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detail: string | null;
  /** 같은 내용에 대한 서로 다른 사람의 미처리 신고가 이 수에 닿으면 `onThreshold`를 부른다. */
  threshold: number;
  /** 대상 잠금 안에서 대상을 읽는다(행 잠금을 걸어 내용이 그 사이 바뀌지 않게). 없으면 null → 404. */
  loadTarget: (tx: DbExecutor) => Promise<ReportTarget | null>;
  /** 기준에 닿았을 때 같은 트랜잭션에서 할 처리(닉네임 되돌리기, 메시지 숨김). 남길 `action` 이름을 돌려준다. */
  onThreshold: (tx: DbExecutor, target: ReportTarget) => Promise<string>;
}

export interface FileReportResult {
  report: ReportRow;
  /** false면 같은 사람이 같은 내용을 이미 신고했다(아무것도 바꾸지 않음). */
  created: boolean;
  /** 이번 신고로 기준에 닿아 한 처리. 없으면 null. */
  action: string | null;
}

/**
 * 신고 저장(HTTP 닉네임 신고와 L5 소켓 메시지 신고가 함께 쓴다). 대상 단위 advisory lock 안에서
 * 저장 → 미처리 건수 확인 → 기준이면 처리하고 그 신고들을 처리됨으로 남긴다. 동시에 여러 신고가 와도 처리는 한 번이다.
 */
export async function fileReport(db: Db, input: FileReportInput): Promise<FileReportResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`report:${input.targetType}:${input.targetId}`}))`);
    const target = await input.loadTarget(tx);
    if (!target) throw errors.notFound('신고할 대상을 찾을 수 없어요');
    if (target.targetUserId === input.reporterUserId) throw errors.validation('내 것은 신고할 수 없어요', 'target_id');

    const sameContent = and(
      eq(reports.targetType, input.targetType),
      eq(reports.targetId, input.targetId),
      eq(reports.content, target.content),
    );
    const [inserted] = await tx
      .insert(reports)
      .values({
        reporterUserId: input.reporterUserId,
        targetType: input.targetType,
        targetId: input.targetId,
        targetUserId: target.targetUserId,
        content: target.content,
        reason: input.reason,
        detail: input.detail,
      })
      .onConflictDoNothing()
      .returning();
    if (!inserted) {
      const [existing] = await tx
        .select()
        .from(reports)
        .where(and(sameContent, eq(reports.reporterUserId, input.reporterUserId)));
      return { report: existing!, created: false, action: null };
    }

    const [pending] = await tx
      .select({ n: count() })
      .from(reports)
      .where(and(sameContent, isNull(reports.handledAt)));
    if (pending!.n < input.threshold) return { report: inserted, created: true, action: null };

    const action = await input.onThreshold(tx, target);
    const [handled] = await tx
      .update(reports)
      .set({ handledAt: sql`now()`, action })
      .where(and(sameContent, isNull(reports.handledAt)))
      .returning()
      .then((rows) => rows.filter((row) => row.id === inserted.id));
    return { report: handled ?? inserted, created: true, action };
  });
}
