// 실제 채팅 소켓. 인증은 세션 쿠키 + Origin(결정 2b)이라 URL·메시지에 토큰을 넣지 않는다.
import { logger } from '../../../core/log/log'
import type { ChatServerEvent, ChatSocketFactory } from './chatProtocol'

const log = logger('ChatSocket')

function socketUrl(): string {
  const origin = import.meta.env.VITE_API_ORIGIN as string
  const url = new URL('/socket', origin)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export const webSocketFactory: ChatSocketFactory = (handlers) => {
  const ws = new WebSocket(socketUrl())
  let closed = false
  ws.addEventListener('open', () => handlers.onOpen())
  ws.addEventListener('message', (e) => {
    if (typeof e.data !== 'string') return
    try {
      handlers.onEvent(JSON.parse(e.data) as ChatServerEvent)
    } catch {
      log.warn('bad frame', { size: e.data.length })
    }
  })
  ws.addEventListener('close', (e) => {
    if (closed) return
    closed = true
    log.info('closed', { code: e.code })
    handlers.onClose(e.code)
  })
  return {
    send: (event) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event)) },
    close: () => { closed = true; ws.close() },
  }
}

/** 개발 목 모드에서만 main.tsx가 바꾼다(타이머 API의 setTransport와 같은 방식). */
let factory: ChatSocketFactory = webSocketFactory
export function setChatSocketFactory(next: ChatSocketFactory) { factory = next }
export function chatSocketFactory(): ChatSocketFactory { return factory }
