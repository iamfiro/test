// 공부를 끝낸 뒤 보여 주는 "오늘의 공부 여권"의 값. 숫자는 전부 서버가 판정한 값(끝낸 기록·통계)에서
// 가져오고 다시 계산하지 않는다. 서버에 없는 값(배운 개념 수 등)은 만들지 않는다.
import type { StudyRecord } from '../timer/timerStore'
import type { StudyStats } from '../timer/statsStore'
import type { StudySettings } from '../timer/settingsStore'

export type StudyRecap = {
  nickname: string
  /** 공부일(YYYY-MM-DD, 04:00 경계). */
  studyDate: string
  /** 방금 끝낸 기록 id에서 만든 여권 번호(예: SV-1A2B-3C4D). */
  serial: string
  todaySeconds: number
  yesterdaySeconds: number
  sessionSeconds: number
  goalSeconds: number | null
  streakDays: number
  /** 오늘 공부한 과목, 오래 한 순. 과목 없음은 subject null. */
  subjects: { subject: string | null; seconds: number }[]
  /** 지금 방에서 오늘 공부 시간 순위. 서버 랭킹(계획 5단계)이 없어 실제 흐름에서는 null이고 카드에서 칸을 숨긴다. */
  rank: { position: number; total: number } | null
  /** 3D 방에서 찍은 내 자리 사진. 방을 그릴 수 없었으면 null(빈 사진 칸에 문장(紋章)을 그린다). */
  photo: HTMLCanvasElement | null
}

export function buildRecap(input: {
  stats: StudyStats
  record: StudyRecord
  settings: StudySettings | null
  nickname: string
  photo: HTMLCanvasElement | null
}): StudyRecap {
  const { stats, record, settings } = input
  const hex = record.id.replace(/-/g, '').toUpperCase()
  return {
    nickname: input.nickname,
    studyDate: stats.today.date,
    serial: `SV-${hex.slice(0, 4)}-${hex.slice(4, 8)}`,
    todaySeconds: stats.today.seconds,
    yesterdaySeconds: stats.yesterday_seconds,
    sessionSeconds: record.focused_seconds,
    goalSeconds: settings?.daily_goal_minutes != null ? settings.daily_goal_minutes * 60 : null,
    streakDays: stats.streak_days,
    subjects: [...stats.today_by_subject].sort((a, b) => b.seconds - a.seconds),
    photo: input.photo,
    // 방 순위는 서버가 판정한다(presence 인정 시간). 랭킹 API가 생기기 전까지 비워 둔다.
    rank: null,
  }
}

export function goalReached(recap: StudyRecap): boolean {
  return recap.goalSeconds != null && recap.goalSeconds > 0 && recap.todaySeconds >= recap.goalSeconds
}
