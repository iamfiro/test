// 공부 태그. 내 태그는 서버가 진실이고 바꾸기는 서버 응답 뒤에만 반영한다(optimistic 없음).
// 카탈로그·자동완성 조회는 캐시 우선: 같은 검색어의 마지막 응답을 바로 보이고 뒤에서 다시 읽는다.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { api, errorOf, type ApiError } from '../../../core/api/client'
import type { components } from '../../../core/api/schema'
import { logger } from '../../../core/log/log'

const log = logger('StudyTags')
export type Tag = components['schemas']['Tag']
export const myTagCountMax = 5

let mine: Tag[] | null = null
/** 내 태그가 서버에서 바뀔 때마다 오른다. 추천 목록이 이 값으로 다시 읽는다. */
let revision = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let inflight: Promise<boolean> | null = null

/** 읽었으면 true. 실패해도 이미 가진 값은 지우지 않는다. */
export function loadMyTags(): Promise<boolean> {
  inflight ??= (async () => {
    const res = await api.GET('/users/me/tags').catch((e: unknown) => ({ data: undefined, error: e }))
    if (!res.data) { log.warn('load failed', { code: errorOf(res).code }); return false }
    mine = res.data.data.tags
    emit()
    return true
  })().finally(() => { inflight = null })
  return inflight
}

/** 응답을 못 받으면 호출한 쪽이 같은 키로 다시 부른다. 돌려주는 값은 서버가 저장한 내 태그. */
export async function saveMyTags(tagIds: string[], idempotencyKey: string): Promise<Tag[]> {
  const res = await api.PUT('/users/me/tags', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: { tag_ids: tagIds } })
    .catch((e: unknown) => ({ data: undefined, error: e }))
  if (!res.data) throw Object.assign(new Error('save failed'), { api: errorOf(res) satisfies ApiError })
  mine = res.data.data.tags
  revision += 1
  emit()
  log.info('my tags saved', { count: mine.length })
  return mine
}

export async function suggestTag(name: string, idempotencyKey: string): Promise<void> {
  const res = await api.POST('/tag-suggestions', { params: { header: { 'Idempotency-Key': idempotencyKey } }, body: { name } })
    .catch((e: unknown) => ({ data: undefined, error: e }))
  if (!res.data) throw Object.assign(new Error('suggest failed'), { api: errorOf(res) })
}

const snapshot = () => ({ mine, revision })
let last = snapshot()
export function useMyTags(): { tags: Tag[] | null; revision: number } {
  const s = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => (last.mine === mine && last.revision === revision ? last : (last = snapshot())),
  )
  return { tags: s.mine, revision: s.revision }
}

const searchCache = new Map<string, Tag[]>()

/** 카탈로그(검색어 없음) 또는 자동완성. null이면 아직 없음, failed면 캐시도 없이 실패. */
export function useTagSearch(q: string) {
  const query = q.trim()
  const [tags, setTags] = useState<Tag[] | null>(() => searchCache.get(query) ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setTags(searchCache.get(query) ?? null)
    setFailed(false)
    let alive = true
    const id = window.setTimeout(async () => {
      const res = await api.GET('/tags', { params: { query: query ? { q: query } : {} } }).catch((e: unknown) => ({ data: undefined, error: e }))
      if (!alive) return
      if (!res.data) {
        log.warn('search failed', { code: errorOf(res).code })
        if (!searchCache.has(query)) setFailed(true)
        return
      }
      searchCache.set(query, res.data.data.tags)
      setTags(res.data.data.tags)
    }, query ? 200 : 0)
    return () => { alive = false; window.clearTimeout(id) }
  }, [query])
  return { tags, failed }
}
