# syntax=docker/dockerfile:1
# StudyVillage API 서버 이미지(launch.md 4절, 결정 M7: 컨테이너 1대). 빌드: `docker build -t studyvillage-server server/`
# 실행 환경 변수는 호스트 비밀 저장소에서 넣는다(.env는 이미지에 넣지 않는다). 마이그레이션은 배포 전에 따로:
#   docker run --rm --env-file <운영 환경> <이미지> node dist/db/migrate.js
# 운영 CLI: docker exec <컨테이너> node dist/cli.js <명령>

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY --from=build /app/dist ./dist
# 마이그레이션(dist/db/migrate.js가 ../../drizzle을 본다)과 금칙어 목록(없으면 서버가 시작을 거부한다).
COPY drizzle ./drizzle
COPY data ./data
USER node
EXPOSE 5191
# 헬스체크는 호스트가 `GET /healthz`(DB 확인 포함, 200/503)로 한다. slim 이미지에는 curl이 없어 HEALTHCHECK를 두지 않는다.
CMD ["node", "dist/main.js"]
