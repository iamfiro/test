---
status: active
last_verified: 2026-11-24
version: 0.2.0
---

# 공부방 채팅 실시간 계약

서버 구현(launch.md L5, `server/src/realtime/socket.ts`·`server/src/chat/`)과 같은 내용이다. 의미 규칙은
[결정 9](../plan/study-village.md)를 따른다. 방 멤버·상태 이벤트는 같은 연결·같은 토픽의
[방 실시간 상태 계약](study-room-live.md)에 있다. 개발 목(`frontend/src/mocks/chat.ts`)은 0.1.0 모양만 흉내 낸다.

## 0.2.0에서 바뀐 것

- 오류 코드 추가: `CHAT_DISABLED`·`RESTRICTED`·`LINK_NOT_ALLOWED`·`BANNED_WORD`·`REPEATED`. `error.topic`은 프레임을
  읽지 못하면 `null`일 수 있다.
- 서버 → 클라이언트 `message_hidden` 추가(신고로 숨김).
- 차단·신고는 소켓 이벤트가 아니라 **HTTP**다: 차단 `GET /users/me/blocks`·`PUT|DELETE /users/me/blocks/{user_id}`,
  메시지 신고 `POST /reports`(`target_type: message`). 계약은 `server/docs/api/openapi.yaml`(0.12.0, 커밋본 0.5.6).
  근거: 둘 다 성공을 확인해야 하는 쓰기라 멱등 키·CSRF·오류 봉투가 있는 HTTP 경로가 맞고(쓰기는 서버 성공 응답
  뒤에만 화면을 바꾼다), 소켓이 끊겨 있어도 차단 목록을 읽고 바꿀 수 있어야 하며, 닉네임·방 이름 신고가 이미 같은
  `POST /reports`를 쓴다. 결과(숨김)만 소켓으로 알린다.
- 연결 규칙(닫힘 코드·크기·ping·연결 수)을 적었다.

## 연결

- 주소: `wss://<API 호스트>/socket` (로컬 `ws://localhost:5191/socket`). HTTP와 같은 포트의 업그레이드.
- 인증: 세션 쿠키(`sv_session`) + `Origin` 허용 목록(`WEB_ORIGIN`, 결정 2b). 토큰을 URL·메시지에 넣지 않는다.
  쿠키가 없거나 세션이 없거나(만료·로그아웃) `Origin`이 없거나 목록 밖이면 연결을 받은 뒤 바로 **4401**로 닫는다.
  계정을 지우면 열린 소켓도 4401로 닫는다.
- 프레임은 JSON 텍스트 한 개 = 이벤트 한 개. 바이너리 프레임은 1003으로 닫는다.
- 프레임 크기 상한 4KB(넘으면 1009로 닫힘). 연결 하나가 10초에 30프레임을 넘기면 1008로 닫는다.
- 한 사람(계정)의 동시 연결은 5개까지. 넘는 새 연결은 **4429**로 닫는다(다시 연결하지 말고 다른 탭을 닫으라고 안내).
- 서버가 25초마다 ping을 보내고, 다음 ping 때까지 pong이 없으면 끊는다(브라우저는 pong을 자동으로 보낸다).
- 서버가 정상 종료(배포)하면 1001로 닫는다.
- 끊기면(4401·4429 제외) 클라이언트가 1·2·5·10초(이후 10초) 뒤 다시 연결하고 같은 토픽에 다시 들어간다.

## 토픽

| 토픽 | 뜻 |
| --- | --- |
| `room:<room_id>` | 공부방 채팅 + 방 실시간 상태. 지금 멤버만 들어가고 쓴다 |
| `lobby` | 방에 속하지 않았을 때(원본 앱과 같다). 누구나 |

연결 하나는 토픽 하나에만 들어가 있다. 다른 토픽에 `join`하면 앞 토픽에서 빠진다. 방에서 나가거나 내보내지거나
방이 지워지면 서버가 그 연결을 방 토픽에서 바로 뺀다(그 뒤 메시지가 가지 않는다).

## 클라이언트 → 서버

```json
{ "type": "join", "topic": "lobby" }
{ "type": "send", "topic": "lobby", "client_id": "<uuid>", "body": "안녕하세요" }
```

- 프레임은 연결마다 받은 순서대로 처리한다(`join` 뒤 `send`).
- `client_id`는 보낼 때마다 새 UUID. 응답을 못 받고 다시 연결하면 **같은 `client_id`로 다시 보낸다**.
  서버는 (보낸 사람, `client_id`)가 같으면 새로 저장하지 않고 이미 저장한 메시지를 **보낸 연결에만** 다시
  `message`로 알린다(제한·스위치를 다시 보지 않는다).
- `body`는 앞뒤 공백을 지운 뒤 1–200자, 줄바꿈 말고 제어 문자 금지. 저장·전달은 지운 값이다.
- `send`는 그 토픽에 `join`하지 않아도 되지만 멤버여야 한다(방 토픽).

## 서버 → 클라이언트

```json
{ "type": "joined", "topic": "lobby", "messages": [Message, ...] }
{ "type": "message", "topic": "lobby", "message": Message }
{ "type": "message_hidden", "topic": "lobby", "message_id": "<uuid>" }
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

- 방 토픽에 `join`하면 `room_state`(study-room-live.md)를 먼저, 그다음 `joined`를 받는다. 로비는 `joined`만.
- `joined.messages`는 최근 50개, 오래된 것부터. 숨긴 것·30일 지난 것·내가 차단한 사람의 것은 빠진다. 다시
  연결할 때도 같은 규칙의 목록을 보내므로 클라이언트는 `id`로 중복을 지운다(`joined` 직전에 온 `message`가 목록에
  다시 있을 수 있다).
- `message`는 토픽의 모든 사람(보낸 사람 포함)에게 간다. 단 **그 작성자를 차단한 사람에게는 보내지 않는다**.
  `client_id`는 보낸 사람이 자기 요청의 응답을 알아보는 데만 쓴다. 클라이언트는 이 이벤트를 받은 뒤에만 입력칸을
  비운다(optimistic 표시 없음). `author.nickname`은 보낼 때의 지금 닉네임이다.
- `message_hidden`: 그 메시지를 지금 화면에서 지운다(신고 기준 도달). 다시 `join`하면 목록에도 없다.
- `error.code`(실패한 메시지는 저장하지 않는다. 클라이언트는 입력값을 그대로 둔다)
  - `INVALID`: 길이가 1–200자가 아니거나 `client_id`가 UUID가 아니거나 프레임 모양이 틀렸다(JSON 아님·모르는
    `type`·토픽 형식). 프레임을 읽지 못했으면 `topic`·`client_id`가 `null`.
  - `FORBIDDEN`: 그 토픽의 멤버가 아니다(없는 방도 같다). `join`에도 온다.
  - `RATE_LIMITED`: 사용자당 10초에 5개, 또는 같은 IP에서 10초에 5개를 넘었다.
  - `CHAT_DISABLED`: 운영자가 채팅 쓰기를 잠시 껐다(긴급 스위치 `chat_write_enabled`). 읽기는 된다.
  - `RESTRICTED`: 운영자가 이 계정이나 IP의 채팅을 정지했다.
  - `LINK_NOT_ALLOWED`: 링크(`http://`, `www.`, `abc.com` 같은 주소)를 쓸 수 없다.
  - `BANNED_WORD`: 금칙어(닉네임·방 이름과 같은 서버 목록)가 들어 있다. 무엇이 걸렸는지는 알리지 않는다.
  - `REPEATED`: 바로 앞(5분 안) 내 메시지와 같은 글이다(공백·기호·대소문자 차이는 같은 글).
  검사 순서: 멤버 → 형식 → 재전송(같은 `client_id`) → 스위치 → 정지 → 쓰기 제한 → 링크 → 금칙어 → 같은 글.

## 보관·숨김·차단·신고

- 보관 30일. 그보다 오래된 메시지는 `joined`에 오지 않고 서버 정리 잡이 지운다. 작성자가 계정을 지우면 그 사람의
  메시지도 지운다.
- 차단(HTTP, 위 0.2.0 절): 내 화면에서만 숨긴다. 차단한 사람의 메시지를 서버가 나에게 보내지 않는다(`joined`·`message`).
  한쪽 방향이다(상대는 내 메시지를 받는다). 방 실시간 명단에서는 빼지 않는다. 차단·해제는 열린 소켓에도 바로 적용된다.
- 신고(HTTP `POST /reports`, `target_type: message`): 서로 다른 사람의 신고가 기준(`REPORT_HIDE_THRESHOLD`, 기본 3)에
  닿으면 서버가 바로 숨기고 토픽에 `message_hidden`을 보낸다. 운영자는 CLI(`docs/operations/cli.md`)로 신고를 보고
  숨기거나 되돌린다. CLI로 숨기거나 되돌린 것은 열린 소켓에 알리지 않고 다음 `join`부터 반영된다(CLI는 서버와 다른
  프로세스라서다).
