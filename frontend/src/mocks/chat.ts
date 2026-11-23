// 개발 목: 채팅 계약(docs/contracts/study-room-chat.md) 모양만 흉내 낸다. 보관·속도 제한·멤버 확인 같은
// 서버 의미는 계산하지 않는다. 화면 확인용으로 처음 보낸 말에 다른 사람이 한 번 답한다.
import type { ChatMessage, ChatServerEvent, ChatSocketFactory } from '../feature/study/chat/chatProtocol'

const history = new Map<string, ChatMessage[]>()
const peer = { id: '00000000-0000-4000-8000-0000000000a2', nickname: '졸린 다람쥐' }
const me = { id: '00000000-0000-4000-8000-000000000001', nickname: '추운 비버' }
let peerReplied = false

export const mockChatSocketFactory: ChatSocketFactory = (handlers) => {
  let open = false
  let topic: string | null = null
  const timers: number[] = []
  const later = (ms: number, fn: () => void) => { timers.push(window.setTimeout(() => { if (open) fn() }, ms)) }
  const emit = (e: ChatServerEvent) => handlers.onEvent(e)
  const publish = (t: string, m: ChatMessage) => {
    history.set(t, [...(history.get(t) ?? []), m].slice(-50))
    emit({ type: 'message', topic: t, message: m })
  }

  // 연결 중 안내가 보이도록 조금 늦게 연다.
  timers.push(window.setTimeout(() => { open = true; handlers.onOpen() }, 700))

  return {
    send(event) {
      if (!open) return
      if (event.type === 'join') {
        topic = event.topic
        later(150, () => emit({ type: 'joined', topic: event.topic, messages: history.get(event.topic) ?? [] }))
        return
      }
      if (event.topic !== topic) return
      const body = event.body.trim()
      if (body.length < 1 || body.length > 200) {
        later(100, () => emit({ type: 'error', topic: event.topic, client_id: event.client_id, code: 'INVALID' }))
        return
      }
      const existing = history.get(event.topic)?.find((m) => m.client_id === event.client_id)
      later(150, () => publish(event.topic, existing ?? { id: crypto.randomUUID(), client_id: event.client_id, author: me, body, sent_at: new Date().toISOString() }))
      if (!peerReplied) {
        peerReplied = true
        later(3000, () => publish(event.topic, { id: crypto.randomUUID(), client_id: null, author: peer, body: '반가워요! 오늘도 같이 열공해요', sent_at: new Date().toISOString() }))
      }
    },
    close() {
      open = false
      timers.forEach((id) => window.clearTimeout(id))
    },
  }
}
