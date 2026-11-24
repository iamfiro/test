// 채팅 실시간 이벤트 모양. 계약: docs/contracts/study-room-chat.md (0.2.0). 같은 소켓·토픽으로 오는 방 실시간 상태
// (room_state 등, study-room-live.md)는 live/liveProtocol.ts에 있고 채팅 저장소가 그대로 넘긴다(live/roomLiveStore.ts).
import type { RoomLiveEvent } from '../live/liveProtocol'

export type ChatAuthor = { id: string; nickname: string }

export type ChatMessage = {
  id: string
  client_id: string | null
  author: ChatAuthor
  body: string
  sent_at: string
}

export type ChatErrorCode =
  | 'RATE_LIMITED' | 'INVALID' | 'FORBIDDEN'
  | 'CHAT_DISABLED' | 'RESTRICTED' | 'LINK_NOT_ALLOWED' | 'BANNED_WORD' | 'REPEATED'

export type ChatClientEvent =
  | { type: 'join'; topic: string }
  | { type: 'send'; topic: string; client_id: string; body: string }

export type ChatServerEvent =
  | { type: 'joined'; topic: string; messages: ChatMessage[] }
  | { type: 'message'; topic: string; message: ChatMessage }
  | { type: 'message_hidden'; topic: string; message_id: string }
  | { type: 'error'; topic: string | null; client_id: string | null; code: ChatErrorCode }
  | RoomLiveEvent

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
  /** code: WebSocket 닫힘 코드(계약: 4401 인증 없음·4429 연결 수 초과는 다시 연결하지 않는다). */
  onClose: (code: number) => void
}

export type ChatSocketFactory = (handlers: ChatSocketHandlers) => ChatSocket

/** 다시 연결하지 않는 닫힘 코드(계약 "연결"). */
export const chatCloseUnauthorized = 4401
export const chatCloseTooManyConnections = 4429
