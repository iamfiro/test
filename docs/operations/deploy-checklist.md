---
status: in_progress
last_verified: 2026-11-23
---

# 배포 체크리스트

운영 배포는 하지 않았다. 각 Phase가 새로 필요하게 만든 항목을 여기에 쌓는다. 출시 순서: 서버 → 웹.

## 호스트·도메인

- 웹 `village.pocket-time.study` (Netlify), API·소켓 `village-api.pocket-time.study` (새 호스트 Docker).
- Cloudflare DNS 두 레코드, API 호스트 WebSocket 허용.

## 데이터베이스

- Supabase Postgres(launch.md M16, 아래 "Supabase" 절). 마이그레이션은 `server/drizzle/` 순서대로 `node dist/db/migrate.js`로 적용.
- 서버 골격·익명 계정(launch.md L1·L2, 구현됨): `idempotency_keys`(24시간 뒤 만료)·`users`·`sessions`·`account_creations`
  (IP당 시간당 새 계정 수 제한용, 24시간 뒤 서버가 지움). 사용자에 딸린 테이블은 모두 `user_id`로 `users`를
  가리키고 `ON DELETE CASCADE`다(내 데이터 지우기 = `users` 행 삭제). 만료된 세션·기록은 서버가 한 시간마다 정리한다.
- 공부방 태그(launch.md L4, 구현됨): `tags`(고유 `tags_name_key (name_key)`), `tag_aliases`(PK `alias_key`, 인덱스 `(tag_id)`),
  `user_tags`(PK `(user_id, tag_id)`, 인덱스 `(tag_id)`), `tag_suggestions`(고유 `(user_id, name_key)`, 인덱스 `(status, created_at)`).
  `user_id`는 모두 `ON DELETE CASCADE`. 배포 뒤 `dist/cli.js tags seed`로 초기 카탈로그를 넣는다(`docs/plan/study-tags.md` 2절,
  [cli.md](cli.md)). 방 태그 `room_tags`는 공부방 항목에.
- 첫 가입 온보딩(계약 0.5.0, 서버 미구현): 사용자 테이블에 `onboarding_completed_at timestamptz null`. 이 열이 생기기
  전에 가입한 사람(기존 사용자)은 성별을 골랐으면 그때 시각으로 채워 온보딩을 다시 보지 않게 한다(백필 방법은 서버 단계에서 확정).
  공개 프로필 응답에 `tags`(내 태그, 카탈로그 순서)가 실린다.
- 타이머·기록·presence(launch.md L3, 구현됨): `study_settings`(사용자당 한 행, 하루 목표·과목 목록·고른 과목·과목 색. 행이 없으면 기본값),
  `study_sessions`(진행 중·기록, 부분 고유 인덱스 `study_sessions_one_active_per_user`로 계정당 진행 중 하나, 인덱스 `(user_id, study_date)`·`(user_id, ended_at)`),
  `presence_spans`(서버가 받은 presence 시각으로 이은 관측 구간, 인덱스 `(session_id, ended_at)`),
  `ranked_segments`(인정 공부 구간 = 공부 구간 ∩ 관측 구간 ±45초, 리그·스트릭 L6의 원천. 인덱스 `(user_id, started_at)`·`(user_id, study_date)`·`(session_id)`).
  모두 `user_id` `ON DELETE CASCADE`. 새 환경 변수 없음(75초·45초는 코드 상수, PocketTimeServer와 같은 값).
- 익명 악용 대비(launch.md L2b, 구현됨): `app_settings`(긴급 스위치 key/value, 행이 없으면 켜짐), `user_restrictions`
  (계정 정지, PK `(user_id, kind)`, `user_id` `ON DELETE CASCADE`), `ip_restrictions`(IP 정지, PK `(ip, kind)`, 인덱스 `(until)`,
  기한이 지나면 서버가 지움), `reports`(신고, `reporter_user_id`·`target_user_id` 모두 `ON DELETE CASCADE`, 고유 인덱스
  `reports_one_per_reporter (reporter_user_id, target_type, target_id, content)`, 인덱스 `(target_type, target_id)`·`(target_user_id)`·`(created_at)`).
  새 환경 변수 `REPORT_HIDE_THRESHOLD`(기본 3)·`SETTINGS_CACHE_MS`(기본 5000). 금칙어 목록 `server/data/banned_words.txt`를
  서버 이미지에 함께 넣는다(없으면 서버가 시작을 거부). 운영 CLI(`dist/cli.js`) 사용법은 [cli.md](cli.md).
- 공부방·초대(launch.md L4, 구현됨): `study_rooms`(방장 `host_user_id` `ON DELETE CASCADE`, 인덱스 `(created_at)`, 정원 검사 제약,
  비밀번호는 AES-256-GCM 암호문 `password_ciphertext`만), `study_room_members`(PK `(room_id, user_id)`, 고유
  `study_room_members_one_room_per_user (user_id)`로 한 사람 한 방), `room_tags`(PK `(room_id, tag_id)`, 인덱스 `(tag_id)`),
  `study_room_invites`(방마다 하나, PK `room_id`, 고유 `token_hash`(SHA-256), 7일 만료, 만료분은 서버가 지움),
  `room_creations`(IP당 하루 방 만들기 수 제한용, 24시간 뒤 서버가 지움). 방·멤버·태그·초대는 방 삭제 때 cascade.
  새 환경 변수: `ROOM_PASSWORD_KEY`(필수, `openssl rand -base64 32`. 방 비밀번호 암호화 키. 바꾸면 기존 방 비밀번호를 읽지 못하니
  비밀값 저장소에서 잃지 않게 둔다), `INVITE_WEB_ORIGIN`(초대 링크 `https://<웹>/r#<token>`의 웹 주소, `WEB_ORIGIN`이 하나면
  생략 가능하고 여럿이면 필수), `ROOM_CREATE_PER_IP_PER_DAY`(기본 10).
- 방 배너·로고(launch.md L4a, 구현됨): `study_rooms.banner_id`·`logo_id`(파일 id). 파일은 R2 키 `rooms/<room_id>/{banner,logo}/<id>`에
  `Content-Type`(서버가 파일 앞부분으로 정함)·`Cache-Control: public, max-age=31536000, immutable`로 올리고, 바꾸거나 방을 지우거나
  방장이 계정을 지우면 이전 키를 지운다(지우기에 실패하면 서버 오류 로그 `media delete failed key: ...`에 키가 남는다).
  새 환경 변수: `MEDIA_STORAGE`(`disk`|`r2`, 기본 `disk`, 운영은 `r2`가 아니면 시작 거부), `MEDIA_PUBLIC_BASE_URL`(필수, 응답에 싣는
  미디어 절대 URL의 앞부분. 운영 `https://media.pocket-time.study`, 로컬 `http://localhost:5191/media`), `R2_ACCOUNT_ID`·
  `R2_ACCESS_KEY_ID`·`R2_SECRET_ACCESS_KEY`·`R2_BUCKET`(`r2`일 때 필수. 토큰 권한은 그 버킷의 객체 읽기·쓰기만), `MEDIA_DIR`
  (`disk`일 때 파일 위치, 기본 `server/var/media`, git 제외. 개발 서버가 `/media/*`로 내준다).
- 실시간 채널·채팅(launch.md L5, 구현됨): `chat_messages`(작성자 `author_user_id` `ON DELETE CASCADE`, 고유
  `chat_messages_author_client_key (author_user_id, client_id)`로 재전송 멱등, 인덱스 `(topic, created_at)`·`(created_at)`, 30일 지나면
  서버가 지움, 숨김 `hidden_at`), `chat_blocks`(PK `(user_id, blocked_user_id)`, 둘 다 `ON DELETE CASCADE`, 인덱스 `(blocked_user_id)`),
  `study_room_members.seat`(3D 자리 번호, 고유 `study_room_members_room_seat (room_id, seat)`, 검사 `seat >= 0`. 마이그레이션이 기존 멤버를
  방마다 방장 먼저·들어온 순으로 0번부터 앉힌다). 새 환경 변수 없음. 호스트·프록시(Cloudflare 포함)가 `/socket` WebSocket 업그레이드를
  API와 같은 호스트·포트로 넘겨야 하고, 유휴 제한이 서버 ping 25초보다 길어야 한다(Cloudflare 100초). 채팅 IP 쓰기 제한·IP 정지도
  `TRUST_PROXY`에 달려 있다. 서버 1대 전제(결정 M7): 늘리면 실시간 이벤트를 `LISTEN/NOTIFY`로 바꿔야 하므로, Supabase는 세션 모드
  연결을 쓴다.
- 리그·스트릭(launch.md L6, 구현됨): `league_memberships`(사용자당 한 행, 리그·적용 시작 주), `league_weeks`(PK `week_start`,
  `open`→`settled`), `league_groups`(주·리그마다 최대 30명, 인덱스 `(week_start, league, created_at)`, `member_count`는 탈퇴해도 줄지
  않음), `league_group_members`(PK `(week_start, user_id)`, 인덱스 `(group_id, score_seconds desc, last_scored_at)`·`(user_id)`),
  `league_results`(PK `(week_start, user_id)`로 정산 멱등, 인덱스 `(user_id, week_start)`). 사용자 행은 모두 `user_id` `ON DELETE CASCADE`.
  스트릭은 테이블 없이 `ranked_segments`로 계산한다. 새 환경 변수: `ENTRY_ID_HMAC_SECRET`(필수, 32자 이상, 순위표 항목 id HMAC 키.
  바꾸면 그 주 항목 id만 바뀐다), `LEAGUE_PROMOTE_MIN`(초, 기본 25200)·`LEAGUE_STAY_MIN`(초, 기본 12600)·`LEAGUE_SETTLE_DELAY`(초, 기본 600).
  정산은 서버가 시작할 때(밀린 주를 순서대로)와 1분마다 확인해 돈다(`pg_advisory_xact_lock`으로 하나만). 서버가 마감 뒤 오래
  꺼져 있으면 다시 켤 때 밀린 주가 한꺼번에 정산된다. 수동 실행·주간 지표·사용자 조회·강제 탈퇴는 운영 CLI([cli.md](cli.md)).

## Supabase (DB, launch.md M16)

- 프로젝트 지역은 API 호스트와 같은 지역. Supabase의 Auth·Storage·Realtime·Data API(PostgREST)는 쓰지 않는다.
- 연결: 서버는 상시 컨테이너 1대(M7)이고 트랜잭션마다 advisory lock(타이머 계정 잠금·리그 배정·정산)을 쓴다. **직접 연결**
  (`db.<ref>.supabase.co:5432`, IPv6. API 호스트가 IPv6를 못 쓰면 IPv4 add-on) 또는 **Supavisor 세션 모드**(풀러 호스트 `:5432`,
  사용자 `postgres.<ref>`)로 붙는다. 트랜잭션 모드(`:6543`)는 쓰지 않는다(상시 서버 한 대라 이점이 없고, 서버를 늘릴 때 쓸
  `LISTEN/NOTIFY` 같은 세션 기능이 막힌다). 서버 풀은 최대 10연결, 마이그레이션 1, CLI 10이므로 플랜의 연결 한도 안인지 본다.
- TLS: Database Settings의 SSL 설정에서 CA 인증서를 내려받아 PEM 내용을 그대로 `DATABASE_CA_CERT`에 넣는다(여러 줄 그대로).
  서버·CLI·마이그레이션이 이 CA로 서버 인증서와 호스트 이름을 검증하고(`rejectUnauthorized`), 운영에서 이 값이 없으면 시작을
  거부한다. `DATABASE_URL`에는 `sslmode` 같은 TLS 매개변수를 넣지 않는다(넣으면 시작 거부: pg가 연결 문자열 값으로 CA 설정을
  덮어쓴다). 같은 설정에서 SSL 강제(Enforce SSL)를 켠다.
- Data API: 끈다(Settings → API). 끄지 못하면 `public` 스키마의 모든 테이블에 RLS를 켠다(정책 없음 = anon·authenticated 차단).
  서버는 테이블 소유자 역할로 붙으므로 RLS에 막히지 않는다. 새 테이블을 추가할 때마다 같은 확인을 한다.
- 접속 제한: API 호스트에 고정 출구 IP가 있으면 Network Restrictions에 그 IP만 허용. DB 비밀번호는 길게, 연결 문자열은 호스트
  비밀 저장소에만.
- 백업: 플랜의 일일 백업과 보관 기간을 확인한다. 시점 복구(PITR)는 유료 add-on이라 출시 전에 켤지 정한다. 배포 전마다 최근 백업 시각을 본다.

## 배포 순서 (서버)

1. 이미지: `docker build -t studyvillage-server:<git sha> server/`(node:24-slim 멀티스테이지, 비루트 `node`, `dist/`·`drizzle/`·`data/`만,
   포트 `PORT` 기본 5191, `NODE_ENV=production`). 이미지 태그로 배포·롤백한다.
2. Supabase 최근 백업 확인.
3. 마이그레이션: 새 이미지로 `docker run --rm --env-file <운영 환경> studyvillage-server:<sha> node dist/db/migrate.js`(직접 연결 또는
   세션 모드, `DATABASE_CA_CERT` 포함). 마이그레이션은 앞으로만이고 이전 코드가 새 스키마에서 돌 수 있어야 한다.
4. 서버 교체: 새 컨테이너 시작 → `GET /healthz`가 200(DB 확인 포함, 실패면 503) → 트래픽 전환 → 이전 컨테이너에 SIGTERM(소켓을
   1001로 닫고 끝난다, 클라이언트는 다시 붙는다). 둘이 겹치는 짧은 동안은 실시간 이벤트가 서로의 연결에 가지 않는다(서버 안 버스, M7).
   리그 정산은 둘이 함께 돌아도 잠금으로 한 번만 된다. 헬스체크는 호스트가 `/healthz`를 1분마다 본다(이미지에 HEALTHCHECK 없음).
5. 시작 뒤: 밀린 리그 주가 있으면 정산하고 `league week settled` 로그를 남긴다. `docker exec <컨테이너> node dist/cli.js league weeks`로 확인.
   첫 배포면 `node dist/cli.js tags seed`.
6. 롤백: 이전 이미지 태그로 4를 다시 한다. 마이그레이션은 되돌리지 않는다.

## 환경 변수

(Phase별로 추가)

## 외부 설정

(Phase별로 추가)
