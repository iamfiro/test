import type { LeagueConfig } from '../config.js';

/** 리그와 그룹 규칙(study-league.md §1). 순위·구역은 서버만 판정한다. */
export type League = 'general' | 'top';
export type Zone = 'promote' | 'stay' | 'relegate';
export type Outcome = 'promoted' | 'stayed' | 'relegated';

/** 그룹 최대 인원. */
export const GROUP_SIZE = 30;
/** 승급·강등 구역 비율(그룹 인원의 20%, 올림). */
const ZONE_RATIO = 0.2;

/** 구역 인원: 그룹 인원(`member_count`, 탈퇴해도 줄지 않음)의 20% 올림. */
export const zoneCount = (groupSize: number) => Math.ceil(groupSize * ZONE_RATIO);

/**
 * 지금 순위로 주를 마치면 가는 곳.
 * - 일반: 상위 20%(올림)이면서 점수 ≥ `LEAGUE_PROMOTE_MIN`이면 승급, 아니면 잔류(강등 없음).
 * - 카페인(top): 하위 20%(올림)이거나 점수 < `LEAGUE_STAY_MIN`이면 강등, 아니면 잔류(승급 없음).
 * 그룹 인원이 1명이어도 같은 규칙이다.
 */
export function zoneOf(league: League, rank: number, groupSize: number, scoreSeconds: number, config: LeagueConfig): Zone {
  const count = zoneCount(groupSize);
  if (league === 'general') return rank <= count && scoreSeconds >= config.promoteMinSeconds ? 'promote' : 'stay';
  return rank > groupSize - count || scoreSeconds < config.stayMinSeconds ? 'relegate' : 'stay';
}

export const outcomeOf = (zone: Zone): Outcome => (zone === 'promote' ? 'promoted' : zone === 'relegate' ? 'relegated' : 'stayed');

export function nextLeague(league: League, outcome: Outcome): League {
  if (outcome === 'promoted') return 'top';
  if (outcome === 'relegated') return 'general';
  return league;
}
