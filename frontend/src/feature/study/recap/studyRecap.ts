// 공부를 끝낸 뒤 보여 주는 "공부 여권" 카드의 값. 숫자는 전부 서버가 판정한 값(끝낸 기록·통계)에서
// 가져오고 다시 계산하지 않는다. 끝낸 직후라 진행 중 세션 몫은 없다.
import type { StudyRecord } from '../timer/timerStore'
import type { StudyStats } from '../timer/statsStore'
import type { StudySettings } from '../timer/settingsStore'
import { subjectColorOf } from '../timer/subjectPalette'

export type StudyRecap = {
  nickname: string
  /** 공부일(YYYY-MM-DD, 04:00 경계). */
  studyDate: string
  todaySeconds: number
  yesterdaySeconds: number
  goalSeconds: number | null
  streakDays: number
  /** 오늘 가장 오래 한 과목. 과목 없음 기록뿐이면 subject null. */
  topSubject: { subject: string | null; fill: string; ink: string }
  /** 3D 방에서 찍은 내 자리 사진. 방을 그릴 수 없었으면 null(사진 칸 없이 그린다). */
  photo: HTMLCanvasElement | null
}

/** 과목 없음 색: 원본 팔레트의 회색. */
const noSubject = { fill: '#ECEBF1', ink: '#5C5B63' }

export function buildRecap(input: {
  stats: StudyStats
  record: StudyRecord
  settings: StudySettings | null
  nickname: string
  photo: HTMLCanvasElement | null
}): StudyRecap {
  const { stats, record, settings } = input
  // today_by_subject는 서버가 0초 과목을 뺀 목록이다. 끝낸 기록이 있으니 비어 있으면 그 기록 과목을 쓴다.
  const top = [...stats.today_by_subject].sort((a, b) => b.seconds - a.seconds)[0]?.subject ?? record.subject
  return {
    nickname: input.nickname,
    studyDate: stats.today.date,
    todaySeconds: stats.today.seconds,
    yesterdaySeconds: stats.yesterday_seconds,
    goalSeconds: settings?.daily_goal_minutes != null ? settings.daily_goal_minutes * 60 : null,
    streakDays: stats.streak_days,
    topSubject: { subject: top, ...(top == null || settings == null ? noSubject : subjectColorOf(settings, top)) },
    photo: input.photo,
  }
}

export function goalReached(recap: StudyRecap): boolean {
  return recap.goalSeconds != null && recap.goalSeconds > 0 && recap.todaySeconds >= recap.goalSeconds
}
