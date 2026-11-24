// 지금 내 방의 실시간 상태(docs/contracts/study-room-live.md). 소켓은 채팅 저장소의 것을 그대로 쓴다: 방 토픽에
// join하면 서버가 `room_state` 스냅샷을 먼저, 그다음 채팅 `joined`를 보내고, 그 뒤 변경 이벤트가 방 단위 `seq`로 온다.
// 진실은 서버가 보낸 값뿐이다: 상태·흐른 초·오늘 초·순위는 다시 계산하지 않고, 흐르는 초만 `as_of`부터 더해 그린다.
// 받은 seq + 1이 아닌 변경이 오면(빈틈) 그 변경은 버리고 같은 토픽에 다시 join해 스냅샷을 새로 받는다.
import { useSyncExternalStore } from 'react'
import { logger } from '../../../core/log/log'
import { chatStore, type ChatStore } from '../chat/chatStore'
import type { LiveMember, LiveRoom, RoomLiveEvent } from './liveProtocol'

const log = logger('RoomLive')

export type RoomLiveState = {
  /** 지금 붙은 방(채팅 토픽 `room:<id>`). 로비거나 연결 전이면 null. */
  roomId: string | null
  /** 스냅샷을 받았으면 true. 다시 join해 기다리는 동안에는 마지막 값을 그대로 두고 false. */
  synced: boolean
  room: LiveRoom | null
  /** 자리 번호 순. */
  members: LiveMember[]
  /** 서버 시각 - 이 기기 시각(ms). 흐르는 초를 서버 시계로 맞춘다. */
  clockOffsetMs: number
}

type Deps = { chat: Pick<ChatStore, 'get' | 'subscribe' | 'onRoomEvent' | 'rejoin'>; now: () => number }

const empty: RoomLiveState = { roomId: null, synced: false, room: null, members: [], clockOffsetMs: 0 }
const roomIdOf = (topic: string | null) => (topic != null && topic.startsWith('room:') ? topic.slice('room:'.length) : null)
const bySeat = (a: LiveMember, b: LiveMember) => a.seat - b.seat

export function createRoomLiveStore(deps: Deps) {
  let state = empty
  let seq: number | null = null
  const listeners = new Set<() => void>()
  const changeListeners = new Set<(event: RoomLiveEvent) => void>()
  const set = (next: Partial<RoomLiveState>) => { state = { ...state, ...next }; listeners.forEach((l) => l()) }

  // 토픽이 바뀌면(방에 들어가고 나감) 이전 방 값을 버린다.
  const followTopic = () => {
    const roomId = roomIdOf(deps.chat.get().topic)
    if (roomId === state.roomId) return
    seq = null
    set({ ...empty, roomId })
  }

  const resync = (why: string) => {
    seq = null
    if (state.synced) set({ synced: false })
    log.info('resync', { reason: why })
    deps.chat.rejoin()
  }

  const upsert = (m: LiveMember) => [...state.members.filter((x) => x.user_id !== m.user_id), m].sort(bySeat)

  const onEvent = (e: RoomLiveEvent) => {
    followTopic()
    if (state.roomId == null || e.topic !== `room:${state.roomId}`) return
    if (e.type === 'room_state') {
      seq = e.seq
      set({ synced: true, room: e.room, members: [...e.members].sort(bySeat), clockOffsetMs: Date.parse(e.server_time) - deps.now() })
      changeListeners.forEach((l) => l(e))
      return
    }
    // 스냅샷 전 변경은 버린다(곧 올 스냅샷에 들어 있다). 이미 받은 번호면 겹친 것이다.
    if (seq == null || e.seq <= seq) return
    if (e.seq !== seq + 1) { resync(`gap ${seq}->${e.seq}`); return }
    seq = e.seq
    switch (e.type) {
      case 'member_joined':
      case 'member_updated':
        set({ members: upsert(e.member) })
        break
      case 'member_left':
        set({ members: state.members.filter((m) => m.user_id !== e.user_id) })
        break
      case 'room_updated':
        set({ room: e.room })
        break
      case 'room_deleted':
        set({ room: null, members: [] })
        break
    }
    changeListeners.forEach((l) => l(e))
  }

  deps.chat.subscribe(followTopic)
  deps.chat.onRoomEvent(onEvent)

  return {
    get: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
    /** 적용된 변경(스냅샷 포함)마다 부른다. 명단 다시 읽기·내 방 목록 무효화처럼 다른 화면이 따라갈 때 쓴다. */
    onChange(l: (event: RoomLiveEvent) => void): () => void {
      changeListeners.add(l)
      return () => { changeListeners.delete(l) }
    },
  }
}

export type RoomLiveStore = ReturnType<typeof createRoomLiveStore>

export const roomLiveStore: RoomLiveStore = createRoomLiveStore({ chat: chatStore, now: () => Date.now() })

export function useRoomLive(store: RoomLiveStore = roomLiveStore): RoomLiveState {
  return useSyncExternalStore(store.subscribe, store.get)
}

/**
 * 머리 위·프로필에 그릴 이번 세션 초. 공부 중일 때만 `as_of`부터 흐른 시간을 더한다(쉬는 중·자리 비움은 그대로).
 * nowMs는 이 기기 시각, clockOffsetMs로 서버 시계에 맞춘다.
 */
export function liveSessionSeconds(m: LiveMember, nowMs: number, clockOffsetMs: number): number {
  if (m.status !== 'studying') return m.session_seconds
  const elapsed = (nowMs + clockOffsetMs - Date.parse(m.as_of)) / 1000
  return m.session_seconds + Math.max(0, Math.floor(elapsed))
}

/** 서버가 매긴 순위 순(순위 없는 사람은 빠진다). 다시 정렬 기준을 만들지 않고 rank 값만 쓴다. */
export function rankedMembers(members: readonly LiveMember[]): LiveMember[] {
  return members.filter((m) => m.rank != null).sort((a, b) => a.rank! - b.rank!)
}

/** 공부 카드의 방 순위 줄: 내 서버 rank와 순위에 든 사람 수. 내가 순위에 없으면 null. */
export function myLiveRank(members: readonly LiveMember[], myId: string): { position: number; total: number } | null {
  const me = members.find((m) => m.user_id === myId)
  if (me?.rank == null) return null
  return { position: me.rank, total: rankedMembers(members).length }
}
