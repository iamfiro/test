import { addDays, mondayOf, studyDateOf, studyDayStart } from '../study/time.js';

/**
 * 리그 주(study-league.md §1, 결정 L1): 그룹 전원이 같은 마감을 갖도록 서비스 시간대 하나로 정한다.
 * `Asia/Seoul` 월요일 04:00 ~ 다음 월요일 04:00. 값은 epoch 밀리초다.
 */
export const LEAGUE_TIMEZONE = 'Asia/Seoul';

/** [ms]가 든 리그 주의 시작. */
export function weekStartOf(ms: number): number {
  return studyDayStart(mondayOf(studyDateOf(ms, LEAGUE_TIMEZONE)), LEAGUE_TIMEZONE);
}

/** 리그 주 [weekStart]의 마감(다음 주 시작). */
export function weekEndOf(weekStart: number): number {
  return studyDayStart(addDays(studyDateOf(weekStart, LEAGUE_TIMEZONE), 7), LEAGUE_TIMEZONE);
}

/** [weekStart] 다음(양수)·이전(음수) 리그 주의 시작. */
export function shiftWeek(weekStart: number, weeks: number): number {
  return studyDayStart(addDays(studyDateOf(weekStart, LEAGUE_TIMEZONE), 7 * weeks), LEAGUE_TIMEZONE);
}

/** 그 순간이 리그 주 시작 시각인지(경로 값 확인). */
export const isWeekStart = (ms: number) => weekStartOf(ms) === ms;

/** 구간 [start, end)가 걸친 리그 주 시작들(오름차순). */
export function weeksOverlapping(start: number, end: number): number[] {
  const weeks: number[] = [];
  for (let week = weekStartOf(start); week < end; week = weekEndOf(week)) weeks.push(week);
  return weeks;
}
