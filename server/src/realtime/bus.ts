import type { RoomChange } from '../rooms/service.js';

/**
 * 실시간 채널로 나갈 일이 생겼다는 알림(모두 커밋 뒤에 낸다). 내용은 작게(id 위주) 두고, 받는 쪽이 DB에서
 * 다시 읽는다. 서버를 늘리면(결정 M7) 이 이벤트를 Postgres `NOTIFY` 한 줄(JSON, 8000바이트 아래)로 보내고 모든
 * 서버가 `LISTEN`으로 받는 구현으로 바꾼다. 그래서 함수·Date 같은 JSON이 아닌 값을 싣지 않는다.
 */
export type LiveEvent =
  /** 타이머 시작·일시정지·재개·끝내기·presence(`TimerService.onChange`). */
  | { kind: 'timer'; userId: string; change: 'started' | 'paused' | 'resumed' | 'finished' | 'observed' }
  /** 방 변경(`RoomService.onChange`). */
  | { kind: 'room'; change: RoomChange }
  /** 닉네임·캐릭터·성별이 바뀌었다(프로필 수정, 신고 기준 도달로 닉네임 되돌림). */
  | { kind: 'profile'; userId: string }
  /** 새 채팅 메시지가 저장됐다. */
  | { kind: 'chat_message'; topic: string; messageId: string }
  /** 메시지가 숨겨졌다(신고 기준 도달). */
  | { kind: 'chat_hidden'; topic: string; messageId: string }
  /** 차단 목록이 바뀌었다. */
  | { kind: 'blocks'; userId: string }
  /** 계정을 지웠다(열린 소켓을 닫는다). */
  | { kind: 'user_deleted'; userId: string };

export interface EventBus {
  publish(event: LiveEvent): void;
  /** 반환 함수로 구독을 끊는다. */
  subscribe(handler: (event: LiveEvent) => void): () => void;
}

/** 서버 1대(결정 M7)용: 같은 프로세스의 구독자에게 바로 넘긴다. 구독자 오류는 다른 구독자를 막지 않는다. */
export class LocalEventBus implements EventBus {
  private readonly handlers = new Set<(event: LiveEvent) => void>();

  constructor(private readonly onHandlerError: (error: unknown) => void) {}

  publish(event: LiveEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        this.onHandlerError(error);
      }
    }
  }

  subscribe(handler: (event: LiveEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
