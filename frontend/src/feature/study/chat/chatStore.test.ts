import { describe, expect, it } from 'vitest'
import type { ChatMessage, ChatServerEvent, ChatSocketHandlers } from './chatProtocol'
import { createChatStore } from './chatStore'

// 사용자에게 보이는 것: 다시 연결해도 같은 말이 두 번 보이지 않고, 보낸 말은 서버가 받은 뒤에 한 번만 보이며,
// 끊긴 사이에 보낸 말은 다시 연결되면 이어서 보내진다. 시트가 닫혀 있으면 남의 새 말 수가 쌓인다.
const me = { id: 'me-1', nickname: '추운 비버' }
const other = { id: 'other-1', nickname: '다람쥐' }
const msg = (id: string, author = other, client_id: string | null = null, at = `2026-11-23T07:00:0${id.length % 10}Z`): ChatMessage =>
  ({ id, client_id, author, body: `말 ${id}`, sent_at: at })

function setup() {
  const sockets: { handlers: ChatSocketHandlers; sent: unknown[]; closed: boolean }[] = []
  const timers: (() => void)[] = []
  let ids = 0
  const store = createChatStore({
    factory: () => (handlers) => {
      const s = { handlers, sent: [] as unknown[], closed: false }
      sockets.push(s)
      return { send: (e) => s.sent.push(e), close: () => { s.closed = true } }
    },
    newId: () => `c${++ids}`,
    setTimer: (fn) => { timers.push(fn); return timers.length },
    clearTimer: () => {},
  })
  const last = () => sockets[sockets.length - 1]!
  const emit = (e: ChatServerEvent) => last().handlers.onEvent(e)
  const join = (messages: ChatMessage[]) => { last().handlers.onOpen(); emit({ type: 'joined', topic: 'lobby', messages }) }
  return { store, sockets, timers, last, emit, join }
}

describe('chat store', () => {
  it('다시 연결해 받은 최근 목록과 이미 받은 말이 겹치면 한 번만 보인다', () => {
    const t = setup()
    t.store.connect('lobby', me.id)
    expect(t.store.get().status).toBe('connecting')
    t.join([msg('a'), msg('bb')])
    expect(t.store.get().status).toBe('open')
    t.emit({ type: 'message', topic: 'lobby', message: msg('ccc') })
    t.last().handlers.onClose(1006)
    t.timers.shift()!()
    t.join([msg('a'), msg('bb'), msg('ccc')])
    expect(t.store.get().messages.map((m) => m.id)).toEqual(['a', 'bb', 'ccc'])
  })

  it('보낸 말은 서버가 돌려주기 전에는 보이지 않고, 돌려준 뒤 한 번만 보인다', () => {
    const t = setup()
    t.store.connect('lobby', me.id)
    t.join([])
    expect(t.store.send('  안녕  ')).toBe(true)
    expect(t.store.get().messages).toEqual([])
    expect(t.store.get().pending?.body).toBe('안녕')
    t.emit({ type: 'message', topic: 'lobby', message: { ...msg('m1', me, 'c1'), body: '안녕' } })
    t.emit({ type: 'message', topic: 'lobby', message: { ...msg('m1', me, 'c1'), body: '안녕' } })
    expect(t.store.get().messages.map((m) => m.body)).toEqual(['안녕'])
    expect(t.store.get().pending).toBeNull()
    expect(t.store.get().outcome).toEqual({ kind: 'sent' })
  })

  it('응답 전에 끊기면 다시 연결한 뒤 같은 client_id로 다시 보낸다', () => {
    const t = setup()
    t.store.connect('lobby', me.id)
    t.join([])
    t.store.send('안녕')
    t.last().handlers.onClose(1006)
    expect(t.store.get().status).toBe('offline')
    t.timers.shift()!()
    t.join([])
    expect(t.last().sent).toContainEqual({ type: 'send', topic: 'lobby', client_id: 'c1', body: '안녕' })
  })

  it('서버가 거절하면 입력값을 지우지 않도록 실패를 알린다', () => {
    const t = setup()
    t.store.connect('lobby', me.id)
    t.join([])
    t.store.send('안녕')
    t.emit({ type: 'error', topic: 'lobby', client_id: 'c1', code: 'RATE_LIMITED' })
    expect(t.store.get().pending).toBeNull()
    expect(t.store.get().outcome).toEqual({ kind: 'failed', code: 'RATE_LIMITED' })
    expect(t.store.get().messages).toEqual([])
  })

  it('시트가 닫혀 있을 때 온 남의 말만 안 읽은 수로 센다', () => {
    const t = setup()
    t.store.connect('lobby', me.id)
    t.join([msg('old')])
    t.emit({ type: 'message', topic: 'lobby', message: msg('n1') })
    t.emit({ type: 'message', topic: 'lobby', message: msg('n1') })
    t.emit({ type: 'message', topic: 'lobby', message: msg('mine', me) })
    expect(t.store.get().unread).toBe(1)
    expect(t.store.get().peek?.id).toBe('n1')
    t.store.setSheetOpen(true)
    expect(t.store.get().unread).toBe(0)
    t.emit({ type: 'message', topic: 'lobby', message: msg('n22') })
    expect(t.store.get().unread).toBe(0)
  })

  it('신고로 숨겨진 말은 목록에서 사라진다', () => {
    const t = setup()
    t.store.connect('lobby', me.id)
    t.join([msg('a'), msg('bb')])
    t.emit({ type: 'message_hidden', topic: 'lobby', message_id: 'a' })
    expect(t.store.get().messages.map((m) => m.id)).toEqual(['bb'])
  })

  it('서버가 세션 없음(4401)으로 닫으면 끊김을 보이고 다시 연결을 되풀이하지 않는다', () => {
    const t = setup()
    t.store.connect('lobby', me.id)
    t.join([])
    t.last().handlers.onClose(4401)
    expect(t.store.get().status).toBe('closed')
    expect(t.timers).toHaveLength(0)
  })
})
