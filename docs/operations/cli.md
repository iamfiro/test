---
status: in_progress
last_verified: 2026-11-24
---

# 운영 CLI

관리자 화면이 없다(결정 9). 긴급 스위치·정지·신고 확인·태그 카탈로그 관리는 서버 CLI로 한다. CLI는 `DATABASE_URL`만 읽고
DB에 바로 쓴다. 서버는 설정을 짧게(`SETTINGS_CACHE_MS`, 기본 5초) 캐시하므로 바꾼 값은 그 안에 모든 서버에 적용된다.
정지·신고는 캐시 없이 바로 적용된다.

- 개발: `cd server && npm run cli -- <명령>` (`.env`의 `DATABASE_URL`)
- 운영 호스트: `node --env-file-if-exists=.env dist/cli.js <명령>` (빌드 산출물, 운영 DB 비밀값은 호스트 환경에서)

종료 코드: 0 성공, 1 실행 오류(없는 사용자 등), 2 사용법 오류(사용법을 표준 오류에 보인다).

## 긴급 스위치

| 키 | 끄면 | 기본 |
| --- | --- | --- |
| `account_create_enabled` | `POST /auth/start`의 새 익명 계정 생성이 503 `ACCOUNT_CREATE_DISABLED`. 이미 세션이 있는 사람과 같은 키 재시도는 통과 | true |
| `chat_write_enabled` | 채팅 쓰기(L5에서 연결) | true |
| `room_create_enabled` | `POST /study-rooms`가 503 `ROOM_CREATE_DISABLED`(수정·참여는 그대로) | true |

```sh
npm run cli -- settings get                          # 전부
npm run cli -- settings get account_create_enabled
npm run cli -- settings set account_create_enabled false
npm run cli -- settings set account_create_enabled true
```

행이 없으면 기본값(켜짐)이다. 값은 `true`·`false`만 받는다.

## 정지

계정 정지 종류: `chat`, `room_create`. IP 정지 종류: `chat`, `room_create`, `account_create`
(`account_create`로 정지한 IP는 새 계정을 만들지 못한다: 403 `ACCOUNT_CREATE_RESTRICTED`. `room_create`로 정지한 계정·IP는
새 공부방을 만들지 못한다: 403 `ROOM_CREATE_RESTRICTED`, 수정·참여는 그대로).
기한은 `--hours`, `--days`, `--until`(시간대가 있는 ISO 시각) 중 하나, 사유(`--reason`)는 필수다.
같은 대상·종류를 다시 걸면 기한·사유를 바꾼다. 기한이 지난 정지는 서버 정리 잡이 지운다.

```sh
npm run cli -- restrict user <user_id> chat --days 7 --reason "욕설 반복"
npm run cli -- restrict ip 203.0.113.7 account_create --hours 12 --reason "계정 대량 생성"
npm run cli -- restrict ip 203.0.113.7 room_create --until 2026-12-01T00:00:00+09:00 --reason "방 도배"
npm run cli -- unrestrict user <user_id> chat
npm run cli -- unrestrict ip 203.0.113.7 account_create
npm run cli -- restrictions list                     # 지금 걸려 있는 정지(JSON 한 줄씩)
```

IP는 `::ffff:1.2.3.4`(IPv4-mapped)를 `1.2.3.4`와 같은 것으로 본다. 이동통신·학교 공유 IP는 여러 사람이 함께 쓰므로
IP 정지는 짧게 건다. 서버가 실제 IP를 보려면 프록시 뒤에서 `TRUST_PROXY=true`여야 한다(배포 체크리스트).

## 신고 확인

```sh
npm run cli -- reports list                          # 최근 50건(새것부터)
npm run cli -- reports list --pending                # 아직 기준에 닿지 않은 것
npm run cli -- reports list --handled --type nickname --limit 100
```

한 줄에 JSON 하나: `id`, `created_at`, `target_type`(message·nickname·room_name), `target_id`, `target_user_id`(내용의 주인),
`content`(신고 시점 내용), `reason`, `detail`, `reporter_user_id`, `handled_at`, `action`.

- 같은 내용에 대한 서로 다른 사람의 신고가 `REPORT_HIDE_THRESHOLD`(기본 3)에 닿으면 서버가 바로 처리하고
  `handled_at`·`action`을 남긴다. 닉네임은 `nickname_reset`(무작위 닉네임으로 되돌림), 방 이름은 `room_name_reset`(`<방장 닉네임>의 공부방`으로
  바꿈, `target_id`는 방 id). 메시지 숨김(L5)·복구는 채팅이 붙으면 추가한다.
- 신고자·신고당한 사람이 "내 데이터 지우기"를 하면 그 신고도 함께 지워진다.
- 반복 악용이면 위 정지 명령으로 계정·IP를 정지한다.

## 태그 카탈로그·제안

카탈로그는 서버 DB에 있다(`docs/plan/study-tags.md`). 배포 뒤 한 번 `tags seed`로 2절 초기 목록을 넣는다(다시 해도 늘지 않는다).
이름·별칭은 비교 키(NFC, `#` 제거, 앞뒤 공백 제거, 소문자)로 서로 겹칠 수 없다. 태그를 이름으로 가리킨다(정규 이름이나 같은 키).

```sh
npm run cli -- tags seed
npm run cli -- tags list                             # 태그·별칭(JSON 한 줄씩)
npm run cli -- tags add exam 정보보안기사
npm run cli -- tags alias 정보보안기사 정보보안
npm run cli -- tags merge "코딩 공부" 코딩             # 코딩 공부를 단 사람·방은 코딩으로, "코딩 공부"는 코딩의 별칭이 된다
```

사용자가 카탈로그에 없는 태그를 제안하면(`POST /tag-suggestions`) 바로 태그가 되지 않고 여기서 검토한다.
같은 이름(비교 키)의 대기 중 제안은 한 번에 같은 결과로 닫힌다.

```sh
npm run cli -- suggestions list --pending            # id, created_at, name, user_id, status, resolution
npm run cli -- suggestions accept <id> exam          # 제안 이름으로 새 태그
npm run cli -- suggestions alias <id> 정보처리기사      # 제안 이름을 기존 태그의 별칭으로
npm run cli -- suggestions reject <id>
```

제안한 사람이 "내 데이터 지우기"를 하면 그 제안도 지워진다.
