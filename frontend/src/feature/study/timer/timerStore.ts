// 공부 타이머 상태. 진실은 서버의 진행 중 세션(결정 12: 계정당 하나)이고, 여기서는 그 응답만 담는다.
// 쓰기는 서버 성공 응답 뒤에만 상태를 바꾼다(optimistic 없음). 응답을 못 받으면 같은 Idempotency-Key로
// 다시 보낸다. 흐른 시간 표시는 원본 study_timeline.dart처럼 구간 합으로 계산하되, 열린 구간의 끝은
// 서버 시각(meta.timestamp로 잰 시계 차)을 기준으로 한다.
import { useSyncExternalStore } from 'react'
import { api, errorOf, newIdempotencyKey, type ApiError } from '../../../core/api/client'
import type { components } from '../../../core/api/schema'
import { logger } from '../../../core/log/log'

const log = logger('StudyTimer')

export type ActiveSession = components['schemas']['ActiveSession']
export type StudyRecord = components['schemas']['StudyRecord']

type State = {
  loaded: boolean
  session: ActiveSession | null
  /** 서버 시각 − 기기 시각(ms). 열린 구간의 흐른 시간을 서버 기준으로 그린다. */
  offsetMs: number
  busy: boolean
}

let state: State = { loaded: false, session: null, offsetMs: 0, busy: false }
const listeners = new Set<() => void>()
const set = (next: Partial<State>) => { state = { ...state, ...next }; listeners.forEach((l) => l()) }

/** 다른 탭에 "서버 상태가 바뀌었으니 다시 읽어라"를 알린다(값은 서버에서만 읽는다). */
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('studyvillage-timer')
channel?.addEventListener('message', () => { void load() })

function acceptMeta(meta: { timestamp: string }, sentAt: number, receivedAt: number) {
  // 요청 왕복의 가운데를 서버가 meta.timestamp를 찍은 순간으로 본다.
  set({ offsetMs: Date.parse(meta.timestamp) - (sentAt + receivedAt) / 2 })
}

export async function load(): Promise<void> {
  const sentAt = Date.now()
  const res = await api.GET('/study/active-session')
  if (!res.data) { log.warn('load failed', { code: errorOf(res).code }); return }
  acceptMeta(res.data.meta, sentAt, Date.now())
  set({ loaded: true, session: res.data.data.session })
}

/** 쓰기 한 번. 네트워크 실패(응답 없음)면 같은 키로 1·3초 뒤 두 번까지 다시 보낸다. */
async function write<T>(send: (key: string) => Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const key = newIdempotencyKey()
  const delays = [1000, 3000]
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await send(key)
      if (res.data !== undefined) return res.data
      throw Object.assign(new Error('api error'), { api: errorOf(res) })
    } catch (e) {
      const apiError = (e as { api?: ApiError }).api
      if (apiError || attempt >= delays.length) throw e
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
}

type SessionEnvelope = { data: { session: ActiveSession | null }; meta: { timestamp: string } }

async function mutate(send: (key: string) => Promise<{ data?: SessionEnvelope; error?: unknown; response: Response }>) {
  if (state.busy) return
  set({ busy: true })
  const sentAt = Date.now()
  try {
    const res = await write(send)
    acceptMeta(res.meta, sentAt, Date.now())
    set({ session: res.data.session, loaded: true })
    channel?.postMessage('changed')
  } finally {
    set({ busy: false })
  }
}

export function start(subject: string | null) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return mutate((key) => api.POST('/study/active-session/start', { params: { header: { 'Idempotency-Key': key } }, body: { subject, timezone } }))
}

export function pause(id: string) {
  return mutate((key) => api.POST('/study/active-session/{session_id}/pause', { params: { path: { session_id: id }, header: { 'Idempotency-Key': key } } }))
}

export function resume(id: string) {
  return mutate((key) => api.POST('/study/active-session/{session_id}/resume', { params: { path: { session_id: id }, header: { 'Idempotency-Key': key } } }))
}

export async function finish(id: string): Promise<StudyRecord | null> {
  if (state.busy) return null
  set({ busy: true })
  try {
    const res = await write((key) => api.POST('/study/active-session/{session_id}/finish', { params: { path: { session_id: id }, header: { 'Idempotency-Key': key } } }))
    set({ session: null })
    channel?.postMessage('changed')
    return res.data.record
  } finally {
    set({ busy: false })
  }
}

/** 흐른 공부 시간(ms). 일시정지 구간은 빠진다. */
export function elapsedMs(session: ActiveSession, offsetMs: number, nowLocal = Date.now()): number {
  const serverNow = nowLocal + offsetMs
  let total = 0
  for (const seg of session.segments) {
    const startMs = Date.parse(seg.started_at)
    const endMs = seg.ended_at ? Date.parse(seg.ended_at) : serverNow
    total += Math.max(0, endMs - startMs) // 원본: 음수 구간은 0으로 본다.
  }
  return total
}

export function isRunning(session: ActiveSession): boolean {
  return session.segments[session.segments.length - 1]?.ended_at == null
}

export function useTimer(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
}

/** 화면이 보이는 동안 30초마다 presence를 보낸다(랭킹 인정 시간의 근거). 다시 보이면 서버 상태를 읽는다. */
export function startPresence(): () => void {
  const beat = () => {
    const s = state.session
    if (!s || document.visibilityState !== 'visible') return
    void api.PUT('/study/presence', { body: { session_id: s.id } }).then((res) => {
      if (res.response.status === 409) void load()
    })
  }
  const id = window.setInterval(beat, 30_000)
  const onVisible = () => { if (document.visibilityState === 'visible') { void load().then(beat) } }
  document.addEventListener('visibilitychange', onVisible)
  void load().then(beat)
  return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
}
