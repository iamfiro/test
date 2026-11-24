---
status: active
last_verified: 2026-11-24
version: 0.1.0
---

# 공부방 실시간 상태 계약

방 멤버가 함께 앉아 보이고 공부 상태가 실시간으로 바뀌게 하는 소켓 이벤트(launch.md L5, 결정 M6). 서버 구현은
`server/src/realtime/live-rooms.ts`. 연결·인증·토픽 규칙은 [채팅 계약](study-room-chat.md)과 같다(같은 `/socket`,
같은 토픽 `room:<room_id>`, 멤버만).

## 원칙

- 서버가 판정한다: 상태(공부 중·쉬는 중·자리 비움), 이번 세션 흐른 초, 오늘 공부 초, 순위. 프론트는 이 값을 다시
  계산하지 않고, 흐르는 초만 `as_of` 기준으로 더해 그린다.
- 변경은 DB에 커밋된 뒤에만 보낸다(커밋 안 된 상태를 보내지 않는다).
- 방 단위로 1씩 늘어나는 `seq`. 클라이언트는 빈 `seq`(받은 것 + 1이 아닌 것)를 보면 같은 토픽에 다시 `join`해 스냅샷을
  받는다. 서버가 다시 시작하면 `seq`가 처음부터 시작할 수 있으나, 끊긴 클라이언트는 다시 `join`하므로 스냅샷의 `seq`를
  새 기준으로 삼는다.
- 서버 1대(결정 M7). 여러 대로 늘리면 서버 안 이벤트 버스(`server/src/realtime/bus.ts`)를 Postgres `LISTEN/NOTIFY`
  구현으로 바꾼다(계약은 그대로).

## 들어가기

`{ "type": "join", "topic": "room:<room_id>" }` → 멤버면 `room_state`, 그다음 채팅 `joined`. 멤버가 아니거나 방이 없으면
`error`(`FORBIDDEN`). 다시 `join`하면 그때의 스냅샷을 다시 받는다(seq 빈틈 복구).

## 서버 → 클라이언트

```json
{ "type": "room_state", "topic": "room:<id>", "seq": 12, "server_time": "<ISO>", "room": Room, "members": [Member, ...] }
{ "type": "member_joined", "topic": "room:<id>", "seq": 13, "member": Member }
{ "type": "member_updated", "topic": "room:<id>", "seq": 14, "member": Member }
{ "type": "member_left", "topic": "room:<id>", "seq": 15, "user_id": "<uuid>", "reason": "left | removed | account_deleted" }
{ "type": "room_updated", "topic": "room:<id>", "seq": 16, "room": Room }
{ "type": "room_deleted", "topic": "room:<id>", "seq": 17 }
```

- `room_state.seq`는 지금까지 보낸 마지막 변경의 번호(처음 0). 다음 변경은 `seq + 1`.
- `room_state.members`는 멤버 전원, 자리 번호 순. 차단한 사람도 빠지지 않는다(채팅만 숨김).
- `member_joined`: 새 멤버(참여·초대 수락). `member_updated`: 그 멤버 항목 전체를 바꾼다(상태·자리·닉네임·캐릭터·
  오늘 초·순위 중 무엇이든 바뀜). 흐르는 초만 늘어난 것으로는 보내지 않는다.
- `member_left`: `left`(나감), `removed`(방장이 내보냄), `account_deleted`(계정 삭제). 내보내진 사람·나간 사람도 이
  이벤트를 받은 뒤 그 토픽에서 바로 빠진다(그 뒤 방 이벤트·채팅이 가지 않는다). 그 사람은 로비로 옮긴다.
- `room_updated`: 이름·소개·정원·맵·비밀번호 유무·배너·로고·태그가 바뀜(방 이름 신고로 기본 이름이 된 경우 포함).
- `room_deleted`: 방이 지워졌다(방장이 지움·방장이 나감·방장 계정 삭제). 모든 연결이 토픽에서 빠진다.

`Room`(보는 사람과 상관없는 값만. `is_member`·`is_host`·`member_count`는 HTTP `GET /study-rooms/{id}`로):

```json
{
  "id": "<uuid>", "name": "새벽 공부", "description": "소개 | null", "map": "cafe", "capacity": 10,
  "has_password": false, "host_user_id": "<uuid>",
  "banner": { "id": "...", "url": "https://..." } | null, "logo": { ... } | null,
  "tags": [{ "id": "<uuid>", "kind": "exam | kind", "name": "수능" }]
}
```

`Member`:

```json
{
  "user_id": "<uuid>",
  "nickname": "추운 비버",
  "avatar": { "shape": "circle", "color": "orange", "eyes": "dot", "mouth": "smile", "accessory": "none" },
  "gender": "male | female | null",
  "seat": 0,
  "is_host": true,
  "status": "studying | paused | away",
  "session_seconds": 1530,
  "as_of": "<ISO>",
  "today_seconds": 5400,
  "rank": 1
}
```

- `user_id`: 사용자 id(HTTP 방 명단 `RoomMember.user_id`·채팅 `author.id`와 같은 값, 내보내기·차단·프로필 시트에 쓴다).
- `seat`: 3D 맵의 자리 번호 0–32(웹 `frontend/src/feature/study/room3d/scenes.ts`의 `cafeSeats` 순서 = 원본 GLB
  `seat_NN`). 들어올 때 서버가 빈 자리 중 가장 작은 번호를 준다(방장은 0). 옮기기는 HTTP
  `PUT /study-rooms/{room_id}/seat`. 방 안에서 겹치지 않는다. 화면이 "내 자리를 0번 카메라 자리로" 돌려 그리는 것은
  화면 몫이다.
- `status`(앱 `studyPresenceOf`·`StudyPresence`와 같은 뜻):
  - `away`(자리 비움): 진행 중 세션이 없거나, 세션은 있지만 서버가 presence를 75초 넘게 받지 못했다.
  - `studying`(공부 중): 세션이 흐르고 presence가 이어진다.
  - `paused`(쉬는 중): 세션이 일시정지이고 presence가 이어진다.
  presence 끊김은 서버가 몇 초(지금 5초)마다 다시 보므로 75초보다 조금 늦게 `away`가 올 수 있다.
- `session_seconds`: 이번 세션의 공부한 초(일시정지 구간 제외)를 `as_of`(서버 시각) 기준으로 잰 값. 세션이 없으면 0.
  `status`가 `studying`일 때만 클라이언트가 `as_of`부터 흐른 시간을 더해 그린다(머리 위 시간). `paused`·`away`는 그대로.
  클라이언트 시계와 서버 시계의 차이는 `room_state.server_time`으로 맞춘다.
- `today_seconds`: 그 사람의 오늘(그 사람의 시간대 04:00 경계, 진행 중 세션이 있으면 그 세션의 시간대, 없으면 마지막으로
  끝낸 세션의 시간대) **끝낸 기록**의 합. 진행 중 세션은 들어 있지 않다(`session_seconds`가 따로 있다). 공부일이 바뀌면
  서버가 다시 보낸다. 기록이 한 번도 없으면 0.
- `rank`: 방 안 실시간 순위(앱 `studyLiveRankingEntries`): `away`가 아니고 이번 세션 1초 이상인 사람을 `session_seconds`
  (지금 시각 기준)가 긴 순으로 1부터. 같으면 닉네임, 그다음 `user_id` 순(보는 사람과 상관없이 같다. 앱의 "같으면 나 먼저"는
  서버가 하지 않는다). 순위가 없으면 `null`. 흐르는 사람이 멈춘 사람을 앞지르면 서버가 다시 매겨 `member_updated`로
  보낸다(몇 초 늦을 수 있다). 프론트는 이 값으로만 순위를 그린다(시간으로 다시 정렬하지 않는다).

## 원천(무엇이 이벤트를 만드나)

| 원천 | 이벤트 |
| --- | --- |
| 타이머 시작·일시정지·재개·끝내기 | `member_updated`(상태·흐른 초·오늘 초·순위) |
| presence 수신 / 75초 끊김 | 상태나 순위가 바뀔 때만 `member_updated` |
| 참여·초대 수락 | `member_joined` |
| 자리 옮기기 | `member_updated` |
| 나가기·내보내기·계정 삭제 | `member_left` |
| 프로필 수정(닉네임·캐릭터·성별), 닉네임 신고로 되돌림 | `member_updated` |
| 방 수정·사진 바꿈·방 이름 신고로 되돌림 | `room_updated` |
| 방 삭제 | `room_deleted` |
| 다른 사람의 순위·상태 변화에 따른 내 순위 변화 | `member_updated` |
