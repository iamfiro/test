// 서버 통계(끝낸 기록)에 진행 중 세션의 흐른 몫을 앱 study_stats.dart 규칙(04:00 공부일 경계)대로 더해
// 화면 값을 만든다. 서버가 판정한 값(연속일 등)은 다시 계산하지 않고, 진행 중 몫이 바꾸는 부분만 보탠다.
import { useEffect, useState } from 'react'
import { isRunning, useTimer } from '../timer/timerStore'
import { useStats, type StudyStats } from '../timer/statsStore'
import { dateKey, splitByStudyDate, studyDateOf } from '../timer/studyDay'

/** 연속일에 드는 하루 최소 공부 시간(초). 서버 규칙: 하루 10분. */
export const streakMinSeconds = 600

export type StatsView = {
  todaySeconds: number
  yesterdaySeconds: number
  weekDays: { key: string; seconds: number }[]
  weekTotalSeconds: number
  averageSeconds: number
  streakDays: number
  subjects: { subject: string | null; seconds: number }[]
  /** 최근 16주, 오래된 날부터(16×7). */
  recent: { key: string; seconds: number }[]
  todayKey: string
}

export function useStatsView(): StatsView | null {
  const stats = useStats()
  const { session, offsetMs } = useTimer()
  const running = session != null && isRunning(session)
  const [, tick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [running])
  if (!stats) return null
  return build(stats, session ? { subject: session.subject, intervals: session.segments.map((sg) => ({ start: Date.parse(sg.started_at), end: sg.ended_at ? Date.parse(sg.ended_at) : Date.now() + offsetMs })) } : null)
}

function build(stats: StudyStats, live: { subject: string | null; intervals: { start: number; end: number }[] } | null) : StatsView {
  const liveByDay = live ? splitByStudyDate(live.intervals) : new Map<string, number>()
  const todayKey = dateKey(studyDateOf(new Date()))
  const recent = stats.recent_weeks.map((d) => ({ key: d.date, seconds: d.seconds + Math.floor((liveByDay.get(d.date) ?? 0) / 1000) }))
  const byKey = new Map(recent.map((d) => [d.key, d.seconds]))
  const monday = stats.week.days[0]!.date
  const weekDays = stats.week.days.map((d) => ({ key: d.date, seconds: byKey.get(d.date) ?? d.seconds }))
  const weekTotalSeconds = weekDays.reduce((sum, d) => sum + d.seconds, 0)
  const elapsedDays = Math.max(1, weekDays.findIndex((d) => d.key === todayKey) + 1)
  const todaySeconds = byKey.get(todayKey) ?? stats.today.seconds
  // 진행 중 몫이 오늘을 10분 이상으로 만들면 서버가 센 연속일에 오늘이 더해진다.
  const crossed = stats.today.seconds < streakMinSeconds && todaySeconds >= streakMinSeconds
  const subjects = new Map(stats.subjects_week.map((r) => [r.subject, r.seconds]))
  if (live) {
    let liveWeek = 0
    for (const [key, ms] of liveByDay) if (key >= monday) liveWeek += Math.floor(ms / 1000)
    if (liveWeek > 0) subjects.set(live.subject, (subjects.get(live.subject) ?? 0) + liveWeek)
  }
  return {
    todaySeconds,
    yesterdaySeconds: stats.yesterday_seconds,
    weekDays,
    weekTotalSeconds,
    averageSeconds: Math.floor(weekTotalSeconds / elapsedDays),
    streakDays: stats.streak_days + (crossed ? 1 : 0),
    subjects: [...subjects].map(([subject, seconds]) => ({ subject, seconds })).filter((r) => r.seconds >= 60).sort((a, b) => b.seconds - a.seconds),
    recent,
    todayKey,
  }
}
