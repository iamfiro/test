/**
 * 공부일 계산. 규칙은 PocketTime `lib/feature/study/timer/domain/study_stats.dart`와 같다: 하루는 시간대의 04:00에
 * 시작하고(00–04시는 전날), 주는 월요일부터다. 날짜는 'YYYY-MM-DD' 문자열, 시각은 epoch 밀리초.
 */

export const STUDY_DAY_START_HOUR = 4;

const IANA_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let found = formatters.get(timezone);
  if (!found) {
    found = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timezone, found);
  }
  return found;
}

/** IANA 시간대 이름인지(`+09:00` 같은 오프셋 표기는 받지 않는다). */
export function isTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64 || !IANA_NAME.test(value)) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(ms: number, timezone: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour!, minute: parts.minute!, second: parts.second! };
}

/** 그 순간 시간대의 UTC 오프셋(밀리초). */
function offsetMs(ms: number, timezone: string): number {
  const p = localParts(ms, timezone);
  const wholeSecond = Math.floor(ms / 1000) * 1000;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - wholeSecond;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');
const formatDate = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** 실제로 있는 날짜의 'YYYY-MM-DD'인지. */
export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function dateUtcMs(date: string): number {
  const [, y, m, d] = DATE_PATTERN.exec(date)!.map(Number) as [number, number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function addDays(date: string, days: number): string {
  const moved = new Date(dateUtcMs(date) + days * DAY_MS);
  return formatDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** b - a (일). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dateUtcMs(b) - dateUtcMs(a)) / DAY_MS);
}

/** 그 날짜가 든 주의 월요일. */
export function mondayOf(date: string): string {
  const weekday = new Date(dateUtcMs(date)).getUTCDay(); // 0=일
  return addDays(date, -((weekday + 6) % 7));
}

/** [ms]가 속한 공부일. */
export function studyDateOf(ms: number, timezone: string): string {
  const p = localParts(ms, timezone);
  const date = formatDate(p.year, p.month, p.day);
  return p.hour < STUDY_DAY_START_HOUR ? addDays(date, -1) : date;
}

/** 공부일 [date]가 시작하는 순간(그 시간대의 04:00). */
export function studyDayStart(date: string, timezone: string): number {
  const wall = dateUtcMs(date) + STUDY_DAY_START_HOUR * 60 * 60 * 1000;
  const first = wall - offsetMs(wall, timezone);
  return wall - offsetMs(first, timezone);
}

/** 구간들을 공부일별로 나눈 조각. 04:00을 넘는 구간은 자른다. */
export function splitByStudyDate(intervals: Iterable<readonly [number, number]>, timezone: string): { date: string; start: number; end: number }[] {
  const pieces: { date: string; start: number; end: number }[] = [];
  for (const [start, end] of intervals) {
    let cursor = start;
    while (cursor < end) {
      const date = studyDateOf(cursor, timezone);
      const next = studyDayStart(addDays(date, 1), timezone);
      const pieceEnd = next > cursor && next < end ? next : end;
      pieces.push({ date, start: cursor, end: pieceEnd });
      cursor = pieceEnd;
    }
  }
  return pieces;
}

/** 공부일별 합(밀리초). */
export function totalsByStudyDate(intervals: Iterable<readonly [number, number]>, timezone: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const piece of splitByStudyDate(intervals, timezone)) {
    totals.set(piece.date, (totals.get(piece.date) ?? 0) + piece.end - piece.start);
  }
  return totals;
}
