// 공부방 목록. 조회는 캐시 우선: 같은 조건(scope·q)의 마지막 응답을 바로 보이고 뒤에서 다시 읽는다.
// 검색은 서버가 거른다(계약 listStudyRooms의 q). 화면은 거르지 않는다.
import { useEffect, useState } from 'react'
import { api, errorOf } from '../../../core/api/client'
import type { components } from '../../../core/api/schema'
import { logger } from '../../../core/log/log'

const log = logger('StudyRooms')
export type Room = components['schemas']['Room']
type Scope = 'mine' | 'all'

const cache = new Map<string, Room[]>()

export function useRooms(scope: Scope, q: string) {
  const query = q.trim()
  const key = `${scope}:${query}`
  const [rooms, setRooms] = useState<Room[] | null>(() => cache.get(key) ?? null)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    setRooms(cache.get(key) ?? null)
    setFailed(false)
    let alive = true
    // 입력 중에는 250ms 멈춘 뒤에만 서버에 묻는다.
    const id = window.setTimeout(async () => {
      const res = await api.GET('/study-rooms', { params: { query: query ? { scope, q: query } : { scope } } })
      if (!alive) return
      if (!res.data) {
        log.warn('list failed', { code: errorOf(res).code })
        if (!cache.has(key)) setFailed(true)
        return
      }
      cache.set(key, res.data.data.rooms)
      setRooms(res.data.data.rooms)
    }, query ? 250 : 0)
    return () => { alive = false; window.clearTimeout(id) }
  }, [key, scope, query, reload])

  return { rooms, failed, retry: () => setReload((n) => n + 1) }
}
