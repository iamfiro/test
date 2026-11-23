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

## 환경 변수

(Phase별로 추가)

## 외부 설정

(Phase별로 추가)
