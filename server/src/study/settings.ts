import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db/client.js';
import { studySettings } from '../db/schema.js';
import { errors } from '../http/errors.js';

export interface StudySettingsValue {
  daily_goal_minutes: number | null;
  subjects: string[];
  subject: string | null;
  subject_colors: Record<string, number>;
}

const FIELDS = ['daily_goal_minutes', 'subjects', 'subject', 'subject_colors'] as const;
const MAX_SUBJECTS = 50;
const MAX_SUBJECT_GRAPHEMES = 20;
const MAX_COLOR = 7;
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

export const DEFAULT_STUDY_SETTINGS: StudySettingsValue = {
  daily_goal_minutes: null,
  subjects: [],
  subject: null,
  subject_colors: {},
};

export async function readStudySettings(db: DbExecutor, userId: string): Promise<StudySettingsValue> {
  const [row] = await db.select().from(studySettings).where(eq(studySettings.userId, userId));
  if (!row) return DEFAULT_STUDY_SETTINGS;
  return {
    daily_goal_minutes: row.dailyGoalMinutes,
    subjects: row.subjects,
    subject: row.subject,
    subject_colors: row.subjectColors,
  };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 계약 `StudySettings` 규칙으로 검사하고 다듬은 값을 돌려준다. 어긋나면 그 항목 이름으로 422. */
export function parseStudySettings(body: unknown): StudySettingsValue {
  if (!isPlainObject(body)) throw errors.validation('설정 값이 없어요');
  const unknown = Object.keys(body).find((key) => !(FIELDS as readonly string[]).includes(key));
  if (unknown) throw errors.validation('알 수 없는 항목이에요', unknown);
  const missing = FIELDS.find((key) => !(key in body));
  if (missing) throw errors.validation('빠진 항목이 있어요', missing);

  const goal = body.daily_goal_minutes;
  if (goal !== null && (!Number.isInteger(goal) || (goal as number) < 60 || (goal as number) > 1440 || (goal as number) % 60 !== 0)) {
    throw errors.validation('하루 목표는 1–24시간(시간 단위)이에요', 'daily_goal_minutes');
  }

  const rawSubjects = body.subjects;
  if (!Array.isArray(rawSubjects) || rawSubjects.length > MAX_SUBJECTS) {
    throw errors.validation(`과목은 ${MAX_SUBJECTS}개까지예요`, 'subjects');
  }
  const subjects: string[] = [];
  for (const raw of rawSubjects) {
    if (typeof raw !== 'string') throw errors.validation('과목 이름이 올바르지 않아요', 'subjects');
    const name = raw.trim();
    const length = [...segmenter.segment(name)].length;
    if (length < 1 || length > MAX_SUBJECT_GRAPHEMES) {
      throw errors.validation(`과목 이름은 1–${MAX_SUBJECT_GRAPHEMES}자예요`, 'subjects');
    }
    if (subjects.includes(name)) throw errors.validation('같은 이름의 과목이 있어요', 'subjects');
    subjects.push(name);
  }

  const subject = body.subject;
  if (subject !== null && (typeof subject !== 'string' || !subjects.includes(subject))) {
    throw errors.validation('고른 과목이 과목 목록에 없어요', 'subject');
  }

  const rawColors = body.subject_colors;
  if (!isPlainObject(rawColors)) throw errors.validation('과목 색 값이 올바르지 않아요', 'subject_colors');
  const colors: Record<string, number> = {};
  for (const [name, color] of Object.entries(rawColors)) {
    if (!Number.isInteger(color) || (color as number) < 0 || (color as number) > MAX_COLOR) {
      throw errors.validation(`과목 색 번호는 0–${MAX_COLOR}이에요`, 'subject_colors');
    }
    // 계약: 목록에 없는 과목의 색은 지운다.
    if (subjects.includes(name)) colors[name] = color as number;
  }

  return { daily_goal_minutes: goal as number | null, subjects, subject: subject as string | null, subject_colors: colors };
}

export function registerStudySettingsRoutes(app: FastifyInstance): void {
  app.get('/users/me/study-settings', async (request, reply) =>
    reply.ok(await readStudySettings(app.db, request.auth!.user.id)),
  );

  app.put('/users/me/study-settings', { config: { idempotent: true } }, async (request, reply) => {
    const value = parseStudySettings(request.body);
    const row = {
      dailyGoalMinutes: value.daily_goal_minutes,
      subjects: value.subjects,
      subject: value.subject,
      subjectColors: value.subject_colors,
      updatedAt: new Date(),
    };
    await app.db
      .insert(studySettings)
      .values({ userId: request.auth!.user.id, ...row })
      .onConflictDoUpdate({ target: studySettings.userId, set: row });
    return reply.ok(value);
  });
}
