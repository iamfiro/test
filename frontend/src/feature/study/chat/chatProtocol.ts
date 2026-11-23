// 채팅 실시간 이벤트 모양. 계약: docs/contracts/study-room-chat.md (초안 0.1.0).

export type ChatAuthor = { id: string; nickname: string }

export type ChatMessage = {
  id: string
  client_id: string | null
  author: ChatAuthor
  body: string
  sent_at: string
}

export type ChatErrorCode = 'RATE_LIMITED' | 'INVALID' | 'FORBIDDEN'

export type ChatClientEvent =
  | { type: 'join'; topic: string }
  | { type: 'send'; topic: string; client_id: string; body: string }

export type ChatServerEvent =
  | { type: 'joined'; topic: string; messages: ChatMessage[] }
  | { type: 'message'; topic: string; message: ChatMessage }
  | { type: 'error'; topic: string; client_id: string | null; code: ChatErrorCode }

/** 결정 9: 메시지 200자. 앞뒤 공백을 지운 길이. */
export const chatBodyMax = 200

/** 소켓 하나. 실제는 WebSocket, 개발 목은 mocks/chat.ts. */
export type ChatSocket = {
  send: (event: ChatClientEvent) => void
  close: () => void
}

export type ChatSocketHandlers = {
  onOpen: () => void
  onEvent: (event: ChatServerEvent) => void
  onClose: () => void
}

export type ChatSocketFactory = (handlers: ChatSocketHandlers) => ChatSocket
