// 채팅 상태. 진실은 서버가 보낸 메시지뿐이다: 내가 보낸 말도 서버가 `message`로 돌려준 뒤에만 보인다
// (optimistic 없음). 다시 연결하면 최근 50개가 다시 오므로 id로 중복을 지운다. 응답 없이 끊긴 보내기는
// 다시 연결한 뒤 같은 client_id로 다시 보낸다(서버가 같은 메시지로 알아본다).
import { useSyncExternalStore } from 'react'
import { logger } from '../../../core/log/log'
import { chatSocketFactory } from './chatSocket'
import { isRoomLiveEvent, type RoomLiveEvent } from '../live/liveProtocol'
import { chatBodyMax, chatCloseTooManyConnections, chatCloseUnauthorized, type ChatErrorCode, type ChatMessage, type ChatServerEvent, type ChatSocket, type ChatSocketFactory } from './chatProtocol'

const log = logger('Chat')

/** closed: 서버가 다시 연결하지 말라고 닫았다(4401 세션 없음·4429 연결 수 초과). */
export type ChatStatus = 'idle' | 'connecting' | 'open' | 'offline' | 'closed'

export type ChatState = {
  status: ChatStatus
  topic: string | null
  messages: ChatMessage[]
  /** 서버 응답을 기다리는 내 메시지(입력칸은 이 동안 그대로 둔다). */
  pending: { client_id: string; body: string } | null
  /** 시트가 닫힌 동안 온 남의 말 수. */
  unread: number
  /** 채팅 단추 옆에 잠깐 띄울 남의 새 말. */
  peek: ChatMessage | null
  /** 보내기 결과(입력칸이 읽고 지운다). */
  outcome: { kind: 'sent' } | { kind: 'failed'; code: ChatErrorCode | 'INVALID_LOCAL' | 'TOO_MANY_CONNECTIONS' } | null
}

/** 다시 연결 간격(계약). 넷째 이후는 마지막 값. */
export const reconnectDelaysMs = [1000, 2000, 5000, 10000]
/** 새 말 미리보기를 띄워 두는 시간. 원본 값을 확인하지 못해 이름 붙인 설정으로 둔다(보고 참고). */
export const chatPeekMs = 4000

/** id로 중복을 지우고 보낸 시각 순으로. 같은 id면 나중에 온 것으로 바꾼다. */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at) || (a.id < b.id ? -1 : 1))
}

type Deps = {
  factory: () => ChatSocketFactory
  newId: () => string
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

const initial: ChatState = { status: 'idle', topic: null, messages: [], pending: null, unread: 0, peek: null, outcome: null }

export function createChatStore(deps: Deps) {
  let state = initial
  const listeners = new Set<() => void>()
  const set = (next: Partial<ChatState>) => { state = { ...state, ...next }; listeners.forEach((l) => l()) }

  let socket: ChatSocket | null = null
  let meId: string | null = null
  let attempt = 0
  let reconnectTimer: unknown = null
  let peekTimer: unknown = null
  let sheetOpen = false
  /** 방 실시간 상태(room_state·member_* 등, study-room-live.md)를 받는 쪽(live/roomLiveStore.ts). */
  const roomListeners = new Set<(event: RoomLiveEvent) => void>()

  function onEvent(event: ChatServerEvent) {
    // 프레임을 못 읽은 오류는 topic이 null이다(client_id로 내 보내기를 알아본다).
    if (event.topic !== state.topic && !(event.type === 'error' && event.topic === null)) return
    // 방 토픽에는 방 실시간 상태도 온다. 채팅은 다루지 않고 받는 쪽에 그대로 넘긴다.
    if (isRoomLiveEvent(event)) {
      roomListeners.forEach((l) => l(event))
      return
    }
    switch (event.type) {
      case 'joined': {
        attempt = 0
        set({ status: 'open', messages: mergeMessages(state.messages, event.messages) })
        const p = state.pending
        if (p) {
          // 이미 저장됐으면 최근 목록에 들어 있다.
          const saved = event.messages.some((m) => m.client_id === p.client_id && m.author.id === meId)
          if (saved) set({ pending: null, outcome: { kind: 'sent' } })
          else socket?.send({ type: 'send', topic: event.topic, client_id: p.client_id, body: p.body })
        }
        return
      }
      case 'message': {
        const m = event.message
        const known = state.messages.some((x) => x.id === m.id)
        set({ messages: mergeMessages(state.messages, [m]) })
        const mine = m.author.id === meId
        if (mine && state.pending && m.client_id === state.pending.client_id) {
          set({ pending: null, outcome: { kind: 'sent' } })
        }
        if (!mine && !known && !sheetOpen) {
          set({ unread: state.unread + 1, peek: m })
          if (peekTimer != null) deps.clearTimer(peekTimer)
          peekTimer = deps.setTimer(() => { peekTimer = null; set({ peek: null }) }, chatPeekMs)
        }
        return
      }
      case 'message_hidden': {
        set({ messages: state.messages.filter((m) => m.id !== event.message_id), peek: state.peek?.id === event.message_id ? null : state.peek })
        return
      }
      case 'error': {
        log.warn('server error', { code: event.code })
        if (state.pending && event.client_id === state.pending.client_id) {
          set({ pending: null, outcome: { kind: 'failed', code: event.code } })
        }
        return
      }
    }
  }

  function open() {
    const topic = state.topic
    if (topic == null) return
    set({ status: state.status === 'offline' ? 'offline' : 'connecting' })
    const s = deps.factory()({
      onOpen: () => s.send({ type: 'join', topic }),
      onEvent,
      onClose: (code) => {
        if (socket !== s) return
        socket = null
        if (code === chatCloseUnauthorized || code === chatCloseTooManyConnections) {
          log.warn('closed by server', { code })
          set({
            status: 'closed',
            pending: null,
            outcome: state.pending ? { kind: 'failed', code: code === chatCloseTooManyConnections ? 'TOO_MANY_CONNECTIONS' : 'FORBIDDEN' } : state.outcome,
          })
          return
        }
        set({ status: 'offline' })
        const delay = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)]!
        attempt++
        reconnectTimer = deps.setTimer(() => { reconnectTimer = null; open() }, delay)
      },
    })
    socket = s
  }

  return {
    get: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },

    /** 내 id와 토픽(방이 없으면 lobby)으로 붙는다. 같은 토픽이면 그대로 둔다. */
    connect(topic: string, myId: string) {
      if (state.topic === topic && meId === myId && socket) return
      this.disconnect()
      meId = myId
      attempt = 0
      set({ ...initial, topic })
      open()
    },

    disconnect() {
      if (reconnectTimer != null) { deps.clearTimer(reconnectTimer); reconnectTimer = null }
      if (peekTimer != null) { deps.clearTimer(peekTimer); peekTimer = null }
      const s = socket
      socket = null
      s?.close()
      set({ ...initial })
    },

    /** 시트를 열면 안 읽은 수와 미리보기를 지운다. */
    setSheetOpen(open: boolean) {
      sheetOpen = open
      if (open) set({ unread: 0, peek: null })
    },

    /** 보낸다. 연결 전·응답 대기 중이면 false. 길이가 맞지 않으면 실패 결과를 남긴다. */
    send(raw: string): boolean {
      const body = raw.trim()
      if (body.length === 0 || body.length > chatBodyMax) {
        set({ outcome: { kind: 'failed', code: 'INVALID_LOCAL' } })
        return false
      }
      if (state.status !== 'open' || state.pending || !socket || state.topic == null) return false
      const client_id = deps.newId()
      set({ pending: { client_id, body }, outcome: null })
      socket.send({ type: 'send', topic: state.topic, client_id, body })
      return true
    },

    clearOutcome() { if (state.outcome) set({ outcome: null }) },

    /** 방 실시간 이벤트를 받는다(지금 토픽 것만). 돌려준 함수로 끊는다. */
    onRoomEvent(listener: (event: RoomLiveEvent) => void): () => void {
      roomListeners.add(listener)
      return () => { roomListeners.delete(listener) }
    },

    /** 같은 토픽에 다시 join해 스냅샷(room_state·joined)을 다시 받는다(seq 빈틈·차단 해제 뒤). 열려 있을 때만. */
    rejoin(): boolean {
      if (state.status !== 'open' || !socket || state.topic == null) return false
      socket.send({ type: 'join', topic: state.topic })
      return true
    },

    /** 서버가 차단을 받아들인 뒤: 그 사람의 말을 지금 화면에서도 지운다(그 뒤 말은 서버가 보내지 않는다). */
    hideAuthor(userId: string) {
      set({ messages: state.messages.filter((m) => m.author.id !== userId), peek: state.peek?.author.id === userId ? null : state.peek })
    },
  }
}

export type ChatStore = ReturnType<typeof createChatStore>

export const chatStore: ChatStore = createChatStore({
  factory: chatSocketFactory,
  newId: () => crypto.randomUUID(),
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (h) => window.clearTimeout(h as number),
})

export function useChat(store: ChatStore = chatStore): ChatState {
  return useSyncExternalStore(store.subscribe, store.get)
}
