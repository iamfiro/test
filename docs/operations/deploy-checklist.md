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

- 관리형 PostgreSQL. 마이그레이션은 `server/drizzle/` 순서대로 적용.
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

## 환경 변수

(Phase별로 추가)

## 외부 설정

(Phase별로 추가)
