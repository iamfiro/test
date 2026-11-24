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
- 공부방 태그(계약 0.4.0, 서버 미구현): `tags`·`tag_aliases`·`user_tags`·`room_tags`·`tag_suggestions`,
  인덱스 `room_tags(tag_id)`. 배포 뒤 서버 CLI로 초기 카탈로그 시드(`docs/plan/study-tags.md` 2절).
- 첫 가입 온보딩(계약 0.5.0, 서버 미구현): 사용자 테이블에 `onboarding_completed_at timestamptz null`. 이 열이 생기기
  전에 가입한 사람(기존 사용자)은 성별을 골랐으면 그때 시각으로 채워 온보딩을 다시 보지 않게 한다(백필 방법은 서버 단계에서 확정).
  공개 프로필 응답에 `tags`(내 태그, 카탈로그 순서)가 실린다.

## 환경 변수

(Phase별로 추가)

## 외부 설정

(Phase별로 추가)
