// 서버 통계(끝낸 기록 기준). 조회는 캐시 우선: 메모리에 있으면 먼저 보이고 뒤에서 다시 읽는다.
import { useSyncExternalStore } from 'react'
import { api, errorOf } from '../../../core/api/client'
import type { components } from '../../../core/api/schema'
import { logger } from '../../../core/log/log'

const log = logger('StudyStats')
export type StudyStats = components['schemas']['StudyStats']

let stats: StudyStats | null = null
const listeners = new Set<() => void>()

/** 새로 읽은 통계. 실패하면 null(이미 가진 값은 지우지 않는다). */
export async function loadStats(): Promise<StudyStats | null> {
  const res = await api.GET('/study/stats', { params: { query: { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } } })
  if (!res.data) { log.warn('load failed', { code: errorOf(res).code }); return null }
  stats = res.data.data
  listeners.forEach((l) => l())
  return stats
}

export function useStats(): StudyStats | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => stats)
}
