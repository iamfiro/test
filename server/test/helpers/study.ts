import type { FastifyInstance } from 'fastify';
import { studySessions, rankedSegments } from '../../src/db/schema.js';
import { splitByStudyDate, studyDateOf } from '../../src/study/time.js';

/**
 * 끝낸 세션 하나와 그 인정 구간([from, to] 전체)을 DB에 바로 넣는다. presence를 분마다 보내는 대신 쓰는 준비 단계다
 * (인정 구간 계산 자체는 study-timer 테스트가 검사한다). 리그 점수에 반영하려면 `app.league.sync`를 부른다.
 */
export async function seedRanked(
  app: FastifyInstance,
  userId: string,
  from: string,
  to: string,
  timezone = 'Asia/Seoul',
): Promise<string> {
  const start = Date.parse(from);
  const end = Date.parse(to);
  const [session] = await app.db
    .insert(studySessions)
    .values({
      userId,
      status: 'finished',
      subject: null,
      timezone,
      segments: [{ started_at: new Date(start).toISOString(), ended_at: new Date(end).toISOString() }],
      startedAt: new Date(start),
      endedAt: new Date(end),
      focusedSeconds: Math.floor((end - start) / 1000),
      studyDate: studyDateOf(start, timezone),
    })
    .returning({ id: studySessions.id });
  const pieces = splitByStudyDate([[start, end]], timezone);
  await app.db.insert(rankedSegments).values(
    pieces.map((p) => ({
      userId,
      sessionId: session!.id,
      startedAt: new Date(p.start),
      endedAt: new Date(p.end),
      studyDate: p.date,
      timezone,
    })),
  );
  return session!.id;
}
