---
status: in_progress
last_verified: 2026-11-24
---

# 운영 CLI

관리자 화면이 없다(결정 9). 긴급 스위치·정지·신고 확인·채팅 메시지 숨김·태그 카탈로그 관리·리그 정산·주간 지표·사용자 조회·강제 탈퇴는
서버 CLI로 한다. CLI는 서버와 같은 환경 변수를 읽고(설정 검증도 같다: 빠진 값이 있으면 종료 코드 2) DB에 바로 쓴다. 서버는 설정을 짧게(`SETTINGS_CACHE_MS`, 기본 5초) 캐시하므로 바꾼 값은 그 안에 모든 서버에 적용된다.
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
  바꿈, `target_id`는 방 id), 채팅 메시지는 `message_hidden`(모두에게서 숨김, 열린 소켓에도 바로 알림).
- 신고자·신고당한 사람이 "내 데이터 지우기"를 하면 그 신고도 함께 지워진다.

### 채팅 메시지 확인·숨김·복구

```sh
npm run cli -- reports list --pending --type message   # 아직 기준에 닿지 않은 메시지 신고(content가 메시지 본문)
npm run cli -- messages show <메시지 id>               # 본문·토픽·작성자·숨김 여부
npm run cli -- messages hide <메시지 id>               # 모두에게서 숨김, 그 메시지의 미처리 신고는 handled(action message_hidden)
npm run cli -- messages restore <메시지 id>            # 숨김(자동 숨김 포함)을 되돌림
```

CLI는 서버와 다른 프로세스라 열려 있는 소켓에 바로 알리지 못한다: CLI로 숨기거나 되돌린 것은 사람들이 그 토픽에
다시 들어올 때(다시 연결·방 이동)부터 반영된다. 메시지는 30일 뒤 서버가 지운다(숨긴 것도). 작성자 정지는
`restrict user <작성자 id> chat ...`(`target_user_id`가 작성자).
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

## 리그 정산

정산은 서버가 시작할 때(밀린 주를 오래된 것부터)와 1분마다 스스로 돈다. 리그 주는 `Asia/Seoul` 월요일 04:00부터이고 마감 +
`LEAGUE_SETTLE_DELAY`(기본 10분)가 지나야 정산한다. 서버가 꺼져 있었거나 바로 확인하고 싶을 때 수동으로 돌린다. 서버와 함께 돌아도
정산 잠금(`pg_advisory_xact_lock`)과 주 상태로 한 번만 반영된다(이미 정산한 주는 건너뛴다).

```sh
npm run cli -- league settle                         # "settled week_start: <ISO>" 줄 또는 "nothing due"
npm run cli -- league weeks                          # 최근 8주: week_start, status(open·settled), settled_at, 리그별 그룹 수·인원
npm run cli -- league weeks --limit 20
```

마감이 지나지 않은 주를 앞당겨 정산하는 방법은 없다(그 주 점수가 굳어 버린다). 출시 전 리허설(launch.md 6절 리그)은 실제 주 마감 뒤에 한다.

## 주간 지표

study-league.md §7의 성공 지표. 주는 공부일(인정 구간의 `study_date`) 월–일이고 기본은 끝난 지난 주다.

```sh
npm run cli -- metrics week                          # 지난 주
npm run cli -- metrics week --week 2026-12-07        # 그 날짜가 든 주
```

JSON 한 줄: `active_users`(그 주 인정 공부가 있는 사람, 비율의 분모), `studied_3_days`·`studied_3_days_ratio`(10분 이상인 날이 3일
이상), `streak_7`·`streak_30`과 비율(그 주 안에 스트릭 7·30일에 닿아 있던 사람), `league_participants`·`league_groups`(그 리그 주의
리그별 그룹 인원·그룹 수), `league_memberships_now`(지금 리그 소속 행 수). 도토리 지급 합계는 보상이 없어(launch.md M1) 내지 않는다.
기준선은 리그 출시 전 2주.

## 사용자 조회·강제 탈퇴

계정은 익명이라 이메일이 없다(`email`은 항상 null, 로그인을 붙이면 `ab***@domain`으로 가려서 보인다). 출력에는 다음 명령에 쓸 수 있게
전체 id가 나온다(서버 로그의 "식별자 앞 4자" 규칙은 로그에만 적용). 운영 기록·대화에 옮길 때는 앞 4자만 쓴다.

```sh
npm run cli -- users find 3f2a                       # id 앞부분(16진수 4자 이상), 최대 20명: id, nickname, created_at
npm run cli -- users find --nickname "졸린 수달"       # 닉네임이 같은 사람
npm run cli -- users show <user_id>                  # 방(방장 여부)·진행 중 정지·리그·스트릭(서울 기준)·세션 수·받은/한 신고 수
npm run cli -- users delete <user_id> --yes          # 강제 탈퇴: 내 데이터 지우기와 같다(방장인 방 삭제, 모든 행 cascade). 되돌릴 수 없다
```

강제 탈퇴는 세션이 지워져 그 사람의 다음 요청이 401이 된다. CLI는 서버와 다른 프로세스라 열린 소켓·방 실시간 명단에는 바로 알리지
못한다(다시 연결할 때 끊기고, 방 명단은 그 방에 다시 들어올 때 빠진다). 바로 끊어야 하면 먼저 `restrict user <id> chat ...`로
채팅을 막는다.
