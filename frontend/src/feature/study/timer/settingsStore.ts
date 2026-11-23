// 공부 설정(하루 목표·과목). 서버가 진실이고, 바꾸기는 서버 응답 뒤에만 반영한다.
import { useSyncExternalStore } from 'react'
import { api, errorOf, newIdempotencyKey } from '../../../core/api/client'
import type { components } from '../../../core/api/schema'
import { logger } from '../../../core/log/log'

const log = logger('StudySettings')
export type StudySettings = components['schemas']['StudySettings']

let settings: StudySettings | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export async function loadSettings(): Promise<void> {
  const res = await api.GET('/users/me/study-settings')
  if (!res.data) { log.warn('load failed', { code: errorOf(res).code }); return }
  settings = res.data.data
  emit()
}

export async function saveSettings(next: StudySettings): Promise<void> {
  const res = await api.PUT('/users/me/study-settings', { params: { header: { 'Idempotency-Key': newIdempotencyKey() } }, body: next })
  if (!res.data) throw Object.assign(new Error('save failed'), { api: errorOf(res) })
  settings = res.data.data
  emit()
}

export function useStudySettings(): StudySettings | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => settings)
}
