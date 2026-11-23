// 원본: lib/feature/study/timer/domain/study_stats.dart studyDateOf·studyDayStart·splitByStudyDate (PocketTime f574f242).
// 기기 로컬 시간대 기준(원본과 같음). 서버 통계에 없는 진행 중 세션 몫을 화면에 더할 때만 쓴다.

/** 하루를 나누는 기준 시각: 새벽 4시. 00–04시 공부는 전날로 센다. */
export const studyDayStartHour = 4

/** moment가 속한 공부 날짜(로컬 자정). */
export function studyDateOf(moment: Date): Date {
  const d = new Date(moment.getFullYear(), moment.getMonth(), moment.getDate())
  if (moment.getHours() < studyDayStartHour) d.setDate(d.getDate() - 1)
  return d
}

/** 공부 날짜 date가 시작하는 로컬 시각. */
export function studyDayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), studyDayStartHour)
}

export function dateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/** 구간들을 공부 날짜(YYYY-MM-DD)별 ms로 나눠 합한다. 기준 시각을 넘는 구간은 쪼갠다. */
export function splitByStudyDate(intervals: Iterable<{ start: number; end: number }>): Map<string, number> {
  const totals = new Map<string, number>()
  for (const { start, end } of intervals) {
    let cursor = start
    while (cursor < end) {
      const date = studyDateOf(new Date(cursor))
      const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      const next = studyDayStart(nextDate).getTime()
      const pieceEnd = Math.min(next, end)
      const key = dateKey(date)
      totals.set(key, (totals.get(key) ?? 0) + (pieceEnd - cursor))
      cursor = pieceEnd
    }
  }
  return totals
}
