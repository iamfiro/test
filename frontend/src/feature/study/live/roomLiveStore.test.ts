import { describe, expect, it } from 'vitest'
import type { ChatServerEvent, ChatSocketHandlers } from '../chat/chatProtocol'
import { createChatStore } from '../chat/chatStore'
import type { LiveMember, LiveRoom } from './liveProtocol'
import { createRoomLiveStore, liveSessionSeconds } from './roomLiveStore'

// 사용자에게 보이는 것: 방에 들어온 사람·나간 사람이 3D 방과 명단에 바로 반영되고, 이벤트를 놓치면(seq 빈틈)
// 낡은 명단을 그리지 않고 서버 스냅샷을 다시 받아 맞춘다. 공부 중인 사람의 머리 위 시간만 흐른다.
const topic = 'room:r1'
const room: LiveRoom = { id: 'r1', name: '새벽 공부', description: null, map: 'cafe', capacity: 10, has_password: false, host_user_id: 'u1', banner: null, logo: null, tags: [] }
const avatar = { shape: 'circle', color: 'orange', eyes: 'dot', mouth: 'smile', accessory: 'none' } as LiveMember['avatar']
const member = (id: string, seat: number, over: Partial<LiveMember> = {}): LiveMember => ({
  user_id: id, nickname: `사람${id}`, avatar, gender: null, seat, is_host: seat === 0, status: 'away',
  session_seconds: 0, as_of: '2026-11-25T01:00:00.000Z', today_seconds: 0, rank: null, ...over,
})

function setup() {
  const sockets: { handlers: ChatSocketHandlers; sent: unknown[] }[] = []
  const chat = createChatStore({
    factory: () => (handlers) => {
      const s = { handlers, sent: [] as unknown[] }
      sockets.push(s)
      return { send: (e) => s.sent.push(e), close: () => {} }
    },
    newId: () => 'c1',
    setTimer: () => 0,
    clearTimer: () => {},
  })
  const live = createRoomLiveStore({ chat, now: () => Date.parse('2026-11-25T01:00:00.000Z') })
  chat.connect(topic, 'u1')
  const socket = sockets[0]!
  const emit = (e: ChatServerEvent) => socket.handlers.onEvent(e)
  socket.handlers.onOpen()
  return { chat, live, socket, emit }
}

const snapshot = (seq: number, members: LiveMember[]): ChatServerEvent =>
  ({ type: 'room_state', topic, seq, server_time: '2026-11-25T01:00:00.000Z', room, members })

describe('room live store', () => {
  it('스냅샷 뒤에 들어오고 나간 사람이 자리 순서대로 명단에 반영된다', () => {
    const t = setup()
    t.emit(snapshot(3, [member('u2', 4), member('u1', 0)]))
    t.emit({ type: 'joined', topic, messages: [] })
    expect(t.live.get().members.map((m) => m.user_id)).toEqual(['u1', 'u2'])
    t.emit({ type: 'member_joined', topic, seq: 4, member: member('u3', 2) })
    t.emit({ type: 'member_left', topic, seq: 5, user_id: 'u2', reason: 'left' })
    expect(t.live.get().members.map((m) => m.user_id)).toEqual(['u1', 'u3'])
    // 채팅은 그대로 열려 있다(같은 소켓).
    expect(t.chat.get().status).toBe('open')
  })

  it('놓친 변경이 있으면 그 변경을 그리지 않고 다시 join해 스냅샷으로 맞춘다', () => {
    const t = setup()
    t.emit(snapshot(1, [member('u1', 0)]))
    t.emit({ type: 'joined', topic, messages: [] })
    const joinsBefore = t.socket.sent.filter((e) => (e as { type: string }).type === 'join').length
    t.emit({ type: 'member_joined', topic, seq: 3, member: member('u3', 1) })
    expect(t.live.get().members.map((m) => m.user_id)).toEqual(['u1'])
    expect(t.live.get().synced).toBe(false)
    expect(t.socket.sent.filter((e) => (e as { type: string }).type === 'join').length).toBe(joinsBefore + 1)
    t.emit(snapshot(3, [member('u1', 0), member('u2', 1), member('u3', 2)]))
    expect(t.live.get().synced).toBe(true)
    expect(t.live.get().members.map((m) => m.user_id)).toEqual(['u1', 'u2', 'u3'])
  })

  it('다른 방 토픽으로 옮기면 이전 방 사람을 보이지 않는다', () => {
    const t = setup()
    t.emit(snapshot(1, [member('u1', 0), member('u2', 1)]))
    t.chat.connect('lobby', 'u1')
    expect(t.live.get().roomId).toBeNull()
    expect(t.live.get().members).toEqual([])
  })

  it('머리 위 시간은 공부 중일 때만 서버 기준 시각부터 흐른다', () => {
    const asOf = '2026-11-25T01:00:00.000Z'
    const now = Date.parse(asOf) + 65_000
    expect(liveSessionSeconds(member('a', 0, { status: 'studying', session_seconds: 100, as_of: asOf }), now, 0)).toBe(165)
    // 기기 시계가 서버보다 5초 빠르면 그만큼 뺀다.
    expect(liveSessionSeconds(member('a', 0, { status: 'studying', session_seconds: 100, as_of: asOf }), now, -5_000)).toBe(160)
    expect(liveSessionSeconds(member('a', 0, { status: 'paused', session_seconds: 100, as_of: asOf }), now, 0)).toBe(100)
  })
})
