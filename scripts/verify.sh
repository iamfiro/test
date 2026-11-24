#!/usr/bin/env bash
# 로컬 검증 프로필. 한 번에 하나만 돌린다(맥북 에어 비용). 사용: ./scripts/verify.sh docs|server|web
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  docs)
    git diff --check
    ;;
  server)
    (cd server && npm run db:up >/dev/null && npm run typecheck && npm test)
    ;;
  web)
    (cd frontend && npm run typecheck && npm test)
    ;;
  *)
    echo "사용: $0 docs|server|web" >&2
    exit 2
    ;;
esac
