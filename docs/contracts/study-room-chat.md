---
status: draft
last_verified: 2026-11-23
version: 0.1.0
---

# 공부방 채팅 실시간 계약 (초안)

F 단계(프론트 우선) 초안이다. 프론트는 개발 빌드 목 어댑터(`frontend/src/mocks/chat.ts`)로 이 모양만
흉내 내고, Phase 4에서 서버가 이 문서대로 구현하면서 확정한다. 의미 규칙은
[결정 9](../plan/study-village.md)를 따른다.

## 연결

- 주소: `wss://<API 호스트>/socket` (로컬 `ws://localhost:5191/socket`).
- 인증: 세션 쿠키 + `Origin` 허용 목록(결정 2b). 토큰을 URL·메시지에 넣지 않는다.
- 프레임은 JSON 텍스트 한 개 = 이벤트 한 개.
- 끊기면 클라이언트가 1·2·5·10초(이후 10초) 뒤 다시 연결하고 같은 토픽에 다시 들어간다.

## 토픽

| 토픽 | 뜻 |
| --- | --- |
| `room:<room_id>` | 공부방 채팅. 멤버만 읽고 쓴다 |
| `lobby` | 방에 속하지 않았을 때(원본 앱과 같다) |

## 클라이언트 → 서버

```json
{ "type": "join", "topic": "lobby" }
{ "type": "send", "topic": "lobby", "client_id": "<uuid>", "body": "안녕하세요" }
```

- `client_id`는 보낼 때마다 새 UUID. 응답을 못 받고 다시 연결하면 **같은 `client_id`로 다시 보낸다**.
  서버는 (보낸 사람, `client_id`)가 같으면 새로 저장하지 않고 이미 저장한 메시지를 다시 알린다.
- `body`는 앞뒤 공백을 지운 뒤 1–200자.

## 서버 → 클라이언트

```json
{ "type": "joined", "topic": "lobby", "messages": [Message, ...] }
{ "type": "message", "topic": "lobby", "message": Message }
{ "type": "error", "topic": "lobby", "client_id": "<uuid> | null", "code": "RATE_LIMITED" }
```

`Message`:

```json
{
  "id": "<uuid>",
  "client_id": "<uuid> | null",
  "author": { "id": "<uuid>", "nickname": "추운 비버" },
  "body": "안녕하세요",
  "sent_at": "2026-11-23T07:38:00.000Z"
}
```

- `joined.messages`는 최근 50개, 오래된 것부터. 다시 연결할 때도 같은 목록을 보내므로 클라이언트는
  `id`로 중복을 지운다.
- `message`는 토픽의 모든 사람(보낸 사람 포함)에게 간다. `client_id`는 보낸 사람이 자기 요청의 응답을
  알아보는 데만 쓴다. 클라이언트는 이 이벤트를 받은 뒤에만 입력칸을 비운다(optimistic 표시 없음).
- `error.code`
  - `RATE_LIMITED`: 사용자당 10초에 5개를 넘었다.
  - `INVALID`: 길이가 1–200자가 아니다.
  - `FORBIDDEN`: 그 토픽의 멤버가 아니다.
  실패한 메시지는 저장하지 않는다. 클라이언트는 입력값을 그대로 둔다.

## 보관·숨김

- 보관 30일. 그보다 오래된 메시지는 `joined`에 오지 않는다.
- 차단한 사람의 메시지는 서버가 그 사람에게 보내지 않는다(차단·신고 이벤트는 Phase 4에서 추가).
