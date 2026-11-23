# StudyVillage Agent Entry

StudyVillage는 PocketTime 앱의 "공부" 기능(3D 공부방·타이머·랭킹·채팅·소리·상점·플래너)을 떼어 낸
**독립 웹 서비스**다. 자기 웹 프론트엔드(`frontend/`)와 자기 서버(`server/`)를 가진다. 같은 운영사의
자매 서비스지만 계정·데이터는 PocketTime과 분리돼 있다. 결정과 범위는
[docs/plan/study-village.md](docs/plan/study-village.md)가 기준이다.

## 저장소 구조

| 경로 | 내용 |
| --- | --- |
| `server/` | Node 24 + TypeScript, Fastify 5, Drizzle ORM, PostgreSQL, `ws` 실시간 채널 |
| `server/docs/api/openapi.yaml` | **HTTP API 계약의 원천**. 버전은 `info.version` |
| `frontend/` | React 19 + Vite + three.js 웹 앱 |
| `docs/plan/` | 계획·결정(`study-village.md`) |
| `docs/contracts/` | 실시간(채팅·presence) 계약, OpenAPI로 표현하기 어려운 의미 규칙 |
| `docs/design-parity/` | 앱 캡처와 웹 캡처 나란히 비교 |
| `docs/operations/` | 커밋 규칙, 배포 체크리스트, 운영 CLI |
| `docs/sources.md` | PocketTime에서 가져온 코드·자산·문구의 출처와 복사 시점 커밋 |

`../PocketTime`(앱)과 `../PocketTimeServer`는 **읽기 전용 참고 자료**다. 거기에 StudyVillage 기능을
넣지 않는다. 바꿔야 할 일이 생기면 범위를 먼저 사용자에게 확인하고, 각 저장소 규칙대로 별도
worktree·브랜치에서 한다(그 저장소 main의 미커밋 변경은 건드리지 않는다, `git stash` 금지).

## 폴백·추측 금지

값이나 동작이 불명확하면 그럴듯한 기본값·휴리스틱·암묵적 폴백을 만들지 않는다. 계약·결정 문서·
원본 코드로 확인하고, 없으면 사용자에게 묻는다. 명시적 분기와 이름 붙은 설정을 쓰고, 폴백을 꼭
넣어야 하면 이유를 커밋·문서에 적는다(이유 없는 폴백은 제거 후보다).

## 서버가 판정하는 의미

랭킹 인정 시간(서버가 presence로 본 구간만), 공부일 경계(IANA 시간대의 04:00), 진행 중 세션
(계정당 하나), 방 정원·맵 검증, 도토리 잔액·구매·보유는 서버가 판정한다. 프론트엔드는 이 값을
다시 계산하지 않는다. 서버에 없는 파생값만 앱 규칙(`study_stats.dart`) 그대로 계산하고, 어긋나면
서버로 옮기는 안을 제안한다. PocketTime과 의미를 바꾸려면 먼저 묻는다.

## 조회와 쓰기

- **조회는 캐시 우선.** 유효한 캐시(메모리·HTTP ETag)를 먼저 보이고 재검증은 뒤에서 한다. 캐시 없음과
  유효한 빈 결과를 구분한다. 막연한 최신성만으로 network first를 택하지 않는다.
- **쓰기는 서버 성공 응답 뒤에만 화면 상태를 바꾼다.** optimistic 반영·오프라인 쓰기 대기열을 만들지
  않는다. 실패·오프라인이면 저장하지 않고 이유를 알리며 입력값을 보존한다.
- 모든 쓰기 요청에 `Idempotency-Key`를 붙이고, 응답이 유실되면 같은 키로 재시도한다. 서버는 키가
  필요한 쓰기에서 키가 없으면 거절한다(PocketTimeServer처럼 그냥 통과시키지 않는다).

## 계약

- API를 바꾸면 같은 커밋 묶음에서 `server/docs/api/openapi.yaml`과 `info.version`을 갱신한다.
- 프론트엔드는 계약에 없는 필드를 쓰지 않는다. 클라이언트 타입은 OpenAPI에서 생성한다.
- 실시간 이벤트(채팅·방 상태)는 `docs/contracts/`에 문서로 둔다.
- 새 테이블·인덱스·환경 변수·외부 키는 [배포 체크리스트](docs/operations/deploy-checklist.md)에 적는다.
  비밀값은 저장소에 넣지 않는다(`.env`는 git 제외, `.env.example`만 커밋).

## 인증·보안

- 웹 세션은 API 호스트 전용 `Secure`·`HttpOnly`·`SameSite=Lax` 쿠키다(`Domain` 속성 없음). 상태를
  바꾸는 요청은 CSRF 헤더를 확인한다. 소켓은 같은 쿠키와 `Origin` 허용 목록으로 인증한다.
- 토큰·코드를 URL·localStorage·sessionStorage·로그에 남기지 않는다.
- 개발 전용 로그인은 명시적 환경 변수로만 켜지고, 운영 설정에서는 서버가 시작을 거부한다.
- 채팅·사용자 입력은 텍스트로만 렌더한다(`dangerouslySetInnerHTML` 금지).

## 디자인: 앱과 똑같이

- PocketTime 앱(복사 시점 main 코드를 iOS 시뮬레이터로 띄운 화면)의 공부 화면을 **그대로** 구현한다.
  배치·정보 순서·색·글꼴 크기·굵기·여백·모서리·그림자·글래스·아이콘·일러스트·애니메이션·문구를 같게.
  새로 디자인하거나 "웹답게" 바꾸지 않는다.
- 값은 눈대중이 아니라 앱 코드에서 가져온다: `lib/core/theme/`(colors·tokens·typography), 공부 위젯의
  상수(`study_room_island.dart`의 섬 팔레트, `study_glass.dart` 등). 이미지·아이콘·GLB는 원본 파일을
  복사한다. 문구는 앱 ARB(`lib/l10n/features/study_ko.arb`, `todo_ko.arb`)의 한국어를 그대로 쓴다.
  사용자 노출 문구에서 '수업' 대신 '일정'을 쓴다.
- 화면마다 구현 전 시뮬레이터(이미 켜진 iPhone 17을 공유, 새로 부팅 금지)로 앱 화면을 캡처하고, 구현
  뒤 같은 폭 웹 캡처와 나란히 비교해 차이를 고친다. 비교는 `docs/design-parity/`에 남긴다.
- 웹에서만 다를 수밖에 없는 것(hover·포커스, 넓은 화면 배치, 브라우저 제약)만 예외로 두고
  `docs/design-parity/exceptions.md`에 결정과 이유를 적는다. 넓은 화면: 3D는 창 전체, 앱 UI와 2D 화면은
  앱 폭(최대 430px) 컬럼을 가운데에 두고 양옆은 그 화면의 바탕색.
- 앱에 없는 화면(웹 로그인 등)은 앱의 기존 컴포넌트·패턴(로그인·온보딩)을 따른다.
- 그라데이션 광원·범용 아이콘 같은 "AI 티" 금지. 앱에 없는 새 이미지가 꼭 필요할 때만 Codex에 발주
  (`~/.codex/plugins/.plugin-appserver/codex-cli/bin/codex exec ...`)하고, 실패하면 대체하지 말고 알린다.
- 빈 상태·실패·권한 없음 그림은 앱의 상태 그림 SVG(`assets/icons/empty_*.svg`)를 쓴다.
- 작업 중에는 `.claude/launch.json`의 프론트엔드 개발 서버를 켜 두고 직접 확인한다.

## 로깅

- 중앙 로거만 쓴다. 서버는 Fastify의 pino 로거, 프론트엔드는 `src/core/log.ts`. `console.log` 직접 사용 금지.
- 형식: 동작 설명 + `key: value` + `elapsed_ms`. 레벨 trace~fatal, 운영은 warn 이상.
- API 로그는 메서드·경로 템플릿·상태 코드·응답 크기·소요 시간만. 쿠키·Authorization·본문 전체 금지.
  이메일은 `ab***@domain`, 식별자는 앞 4자만.

## 테스트

- 서버: 권한·만료·재시도(멱등)·경합·계약 응답 모양을 **먼저** 테스트로 쓰고 실패를 확인한 뒤 구현한다.
  실제 Postgres(docker)로 돌리고 외부 서비스(OAuth 제공자·R2)는 어댑터 대역으로 바꾼다.
- 프론트: 사용자에게 보이는 동작만 단언한다(로그인 유지, 타이머 복원, 채팅 중복 제거, 구매 후 잔액).
  three.js 내부 호출·색·여백·문구 상수를 고정하는 테스트는 만들지 않는다. 렌더는 개발 서버에서 직접
  보고 스크린샷으로 남긴다.
- "이 테스트가 실패하면 사용자에게 무엇이 보이나"에 답이 없으면 만들지 않는다. 시각은 고정하고 임의
  sleep 금지. 실패를 숨기려는 삭제·skip 금지. 버그를 찾으면 `KNOWN BUG`로 드러낸다.

## 로컬 검증 비용 (맥북 에어)

- 빌드·테스트·타입 검사를 동시에 돌리지 않는다. 변경 파일과 직접 관련된 테스트부터 실행한다.
- `./scripts/verify.sh docs|server|web` 프로필을 쓴다. 전체 테스트는 요청이 있거나 영향 범위를
  좁힐 수 없을 때만, 이유를 밝히고 한다. 통과한 검증을 새 근거 없이 반복하지 않는다.

## 커밋

- [커밋 규칙](docs/operations/commit-conventions.md)(PocketTime과 같은 Conventional Commits allow-list).
  `./scripts/verify-commit-message.sh --title "..."`로 검사한다.
- 논리 단위(서버 도메인·계약·프론트 로직·프론트 UI·테스트·자산)로 잘게 나누고, 각 커밋이 그 시점에
  빌드되게 순서를 정한다. 현재 작업과 무관한 변경·비밀값·생성물·포맷 churn을 섞지 않는다.
- PocketTime에서 복사한 코드·자산은 출처 파일과 원본 커밋을 커밋 body와 `docs/sources.md`에 남긴다.
- 원격 저장소 생성·푸시, 운영 배포·운영 DB·DNS·결제·스토어 작업은 하지 않는다(사용자 확인 필요).

## 완료 보고

된 것 / 안 된 것 / 검증하지 못한 것(실기기·실제 브라우저·여러 탭·운영 환경), 만든 커밋, 미푸시·
미배포, 배포 시 필요한 테이블·인덱스·환경 변수·외부 설정, 원본과 달랐던 점, 새 미결 결정.
