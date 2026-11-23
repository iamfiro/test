---
status: in_progress
last_verified: 2026-11-23
sources:
  pocket_time: f574f242f29b9148f40fe7e9ad0acbe642f87985
  pocket_time_server: 8cbff239be2bae65afe8bf04b09bf5b68d7fa483
---

# StudyVillage 계획

PocketTime 앱의 공부 기능을 독립 웹 서비스로 분리한다. 이 문서의 결정은 2026-11-23 Phase 0에서
사용자가 답한 것이고, 이후 Phase는 이 문서를 따른다. 결정을 바꾸려면 이 문서를 먼저 고친다.

## 결정

| # | 주제 | 결정 |
| --- | --- | --- |
| 1 | 제품 관계 | 같은 운영사의 **자매 서비스**. PocketTime 앱의 공부 기능은 **그대로 유지**하고 축소 여부는 웹 출시 뒤 지표를 보고 따로 정한다. 이번 범위는 **웹만**(자체 모바일 앱은 나중에 검토). 앱의 "StudyVillage에서 열기" 안내는 이번 범위가 아니다 |
| 2 | 계정 | **독립 계정**: StudyVillage가 Kakao·Google·Apple 웹 로그인을 직접 처리한다. PocketTime 계정과 연결하지 않는다 → PocketTime·PocketTimeServer 저장소 변경 없음 |
| 2a | 세션 | API 호스트 전용 `Secure`·`HttpOnly`·`SameSite=Lax` 쿠키(`Domain` 없음), 서버 저장 세션(불투명 랜덤 ID의 SHA-256만 저장). 상태 변경 요청은 CSRF 헤더 확인. **마지막 사용으로부터 180일**(사용할 때마다 연장). 로그아웃·탈퇴 즉시 무효 |
| 2b | 소켓 인증 | 같은 세션 쿠키 + `Origin` 허용 목록. 토큰을 URL·JS 저장소에 두지 않는다 |
| 2c | 로컬 로그인 | 세 제공자 검증 코드는 구현하고 가짜 JWKS·가짜 Kakao API로 테스트. 로컬 화면 확인은 `DEV_LOGIN_ENABLED=true`일 때만 동작하는 개발 전용 로그인. `NODE_ENV=production`이면 이 값이 켜져 있을 때 서버가 시작을 거부한다 |
| 2d | 탈퇴 | **즉시 삭제**(유예·복구 없음). 사용자 데이터 전부: 세션·프로필·공부 기록·presence·랭킹 집계·방 소유(방 삭제)·멤버십·채팅 메시지·신고·차단·친구 관계·지갑·원장·보유품·코디·할 일·업로드 파일 |
| 3 | 기존 데이터 | **새로 시작**. PocketTimeServer의 공부 데이터는 옮기지 않는다(계약 문서상 공부방·랭킹·친구 공부가 미배포이고, 도토리는 현금 결제가 없어 대가를 치른 값이 거의 없음. 운영 DB는 확인하지 않음). 이전 도구 없음 |
| 4 | 서버 스택 | **Node 24 + TypeScript, Fastify 5, Drizzle ORM, PostgreSQL**, 실시간은 `ws` 기반 자체 채널 프로토콜. 테스트는 Vitest + 실제 Postgres(docker). 로컬은 docker compose로 postgres만 띄우고 서버는 `npm run dev`. 원본 Elixir/Mongo 코드는 의미만 옮기고 코드는 새로 쓴다 |
| 4a | 호스팅·파일 | 운영은 새 호스트의 Docker 컨테이너 + 관리형 PostgreSQL, 웹은 Netlify, 파일(방 배너·로고·음반)은 **별도 R2 버킷**. 로컬 파일은 디스크 어댑터. 이번 범위는 배포 체크리스트까지 |
| 5 | 프론트 | **React 19 + Vite + three.js**. **모바일 웹과 데스크톱 모두 1차**. 3D 품질 단계는 앱의 high/medium/low/minimal(렌더 60/30/30/30Hz, 매끈한 해상도 폭 720/600/480/400, 픽셀 폭 360/360/270/216, 동작 fps 15/15/10/0) 그대로, 프레임 시간으로 단계 조정 |
| 5a | 넓은 화면 | 3D 방은 창 전체, 앱 UI(타이머 캡슐·탭바·시트)와 2D 화면은 앱 폭(최대 430px) 컬럼을 가운데에. 양옆은 그 화면 바탕색 |
| 5b | 디자인 기준 | 복사 시점 PocketTime main 코드를 시뮬레이터로 띄운 화면. 탭바·일정 탭의 초록(#9CD15C·#7FAF61)도 코드 그대로. 앱이 바뀌면 그때 따라간다 |
| 6 | 도메인 | `pocket-time.study` 하위: 웹 `village.pocket-time.study`, API·소켓 `village-api.pocket-time.study`. 초대 링크 `https://village.pocket-time.study/r/#<token>`(토큰은 fragment). 화면 이름 표기는 "StudyVillage"(한글명·로고는 미결) |
| 7 | 수익 | **광고 없음, 현금 결제는 설계 문서까지.** 도토리는 가입 시 **시작 지급 1000개**만(원장 reason `starter`), 그 외 획득 경로 없음 |
| 8 | 공개 범위 | 모든 기능 로그인 필수. 초대 링크는 비로그인에게 방 이름·맵 미리보기·인원만 보이고 로그인으로 안내. 검색 노출은 로그인 전 첫 화면만, 나머지 `noindex` |
| 9 | 채팅 | 메시지 200자, 사용자당 10초에 5개, 입장 시 최근 50개, **보관 30일**, 멤버만 읽기·쓰기, 사용자 차단(내 화면에서 숨김)·메시지 신고 저장. 강퇴는 방장 멤버 내보내기. 관리자 화면 없음, 신고 조회·처리는 서버 CLI |
| 10 | 시간표 | 플래너의 시간표·공휴일 표시를 **뺀다**. 격자·달력은 공부 기록·할 일만 |
| 11 | Phase·출시 | 아래 Phase 순서 그대로. 출시는 서버 → 웹. 앱 안내 갱신은 결정 1에 따라 범위 밖 |
| 12 | 동시 타이머 | **계정당 진행 중 세션은 서버에 하나.** 모든 탭·기기가 같은 세션을 보고 일시정지·재개·끝내기 가능. 이미 진행 중일 때 시작하면 새로 만들지 않고 진행 중 세션을 돌려준다. 통계도 서버 기준 하나 |
| 13 | 음원 | 백색소음 7종은 CC0(sources.json 확인). 카페 음반 4곡(Pixabay)은 **사용자가 Pixabay Content License를 확인했다고 답함(2026-11-23)** → 사용 |
| 14 | 캐릭터 | boy/girl(Meshy 원본, `study_characters.glb`에 구움)은 **유료 플랜으로 만들어 사용 가능**하다고 사용자가 답함(2026-11-23) |

## 원본과 달랐던 점 (실행 프롬프트 §2 대비, 코드 기준)

- 업로드는 끝내기 순간이 아니라 outbox를 상태 변경·30초 주기·포그라운드 복귀 때 비운다. 페이로드
  `{id, started_at, ended_at, focused_seconds, study_date, segments[], timezone, owner_id}`, subject는 보내지 않는다.
- heartbeat는 `PUT /users/me/study-presence {session_id, owner_id, observed_at, status, elapsed_seconds}` 30초 주기.
- 3D 조명은 낮만이 아니라 시각에 따른 새벽·낮·노을·밤(`study_room_daylight.dart`). 카메라 모드는 6개
  (firstPerson·thirdPerson·top·overview·roam·auto). 품질 최저에서도 못 버티면 2D 방으로 바꾼다.
- 3D 방의 다른 사람 실시간 상태는 앱이 서버에서 받지 않는다(멤버 상태 unknown·0초). → 새로 설계(Phase 4).
- 채팅: 앱 클라이언트만 있고 서버에는 `/socket` 엔드포인트 자체가 없다. 앱 주석이 가리키는
  `study-room-chat.md`도 없다. 채널은 방이 없으면 `lobby` 토픽을 쓴다.
- 여러 기기: 앱은 규칙 없음, 개인 통계는 기기별 로컬 집계. → 결정 12로 서버 기준 하나.
- 사운드는 앰비언트 7개(백색소음·비·카페·연필·책장·키보드·장작) + 음악 채널 1개. live/에 워치 연동 없음.
- 캐릭터 GLB(boy/girl) 원본은 `assets/`가 아니라 `tool/blender/study_room/figures/`에 있고 앱은
  `study_characters.glb`를 쓴다.
- 광고 도토리 10개는 서버 상수(KST 자정 기준, SSV 없음). 첫 지갑은 1000개 목업 지급.
- 서버 라우트 범위: 방·코디·상점·음악 316–341, 친구·공부 소셜 346–385, 할 일 179–183, 방 이미지 90–92.
  공부 업로드·presence·랭킹이 `FRIEND_ENABLED` 킬스위치에 묶여 있다.
- 서버의 `outfit_*` 5개 컬렉션은 계정 정리 대상에 없다. → StudyVillage는 결정 2d로 전부 삭제.
- 서버 Idempotency plug는 키가 없으면 그냥 통과해 키 없는 동시 구매가 이중 차감될 수 있다(코드 추론).
  환불도 트랜잭션이 아니다. → StudyVillage는 키 필수 + Postgres 트랜잭션.
- 방 비밀번호(4–20자, 대소문자 구분)가 초대 전용 방을 대체했다. 한 사람은 방 하나에만 속한다.
- 유료 맵 library 500·rooftop 300 도토리(카페 3D + 미리보기 틴트), 모두 33석.

## 범위

| PocketTime 기능 | frontend | server |
| --- | --- | --- |
| 3D 공부방(자리·캐릭터·카메라·조명) | three.js 이식 | 방 상태·presence |
| 타이머·과목·통계·목표 | 이식. 진행 중 세션의 진실은 서버 | 활성 세션·기록·통계 신규 |
| 공부방 목록·만들기·수정·참여·초대·멤버 | 이식 | 방 도메인(정원·맵·비밀번호) |
| 방 채팅 | 이식 | 채널·계약 신규 |
| 랭킹·친구 공부 현황·공유 설정 | 이식 | 랭킹(presence 인정)·친구 관계 |
| 소리·음악(LP) | WebAudio 믹서 | 음반 카탈로그·서명 URL·파일 저장소 |
| 상점·도토리·코디·맵 | 이식(현금 결제 없음) | 지갑·상점·코디 |
| 플래너·달력·할 일 | 이식(시간표·공휴일 제외) | 할 일 |
| 계정·온보딩·프로필 | 신규(앱 로그인·온보딩 패턴) | 인증·사용자·프로필 |
| Live Activity·워치·위젯·푸시 | 제외. 탭 제목에 시간 | 없음 |
| 광고 | 제외 | — |

과목·하루 목표는 앱에서 로컬 설정이지만 StudyVillage는 브라우저 저장소에 사용자 데이터를 두지 않으므로
서버 사용자 설정으로 둔다(Phase 3).

## Phase별 완료 기준

모든 Phase: 그 Phase의 서버 계약·테스트와 화면을 함께 끝내고, 화면은 앱 캡처와 나란히 비교해 같다.

| Phase | 완료 기준 |
| --- | --- |
| 0 | 이 문서·AGENTS.md·커밋 규칙 커밋 |
| 1 서버 골격·계정 | 설정·로깅·오류 형식·Idempotency·rate limit·CORS(웹 origin만)·헬스체크. 로그인(3 제공자 + 개발 전용)·세션 갱신·만료·로그아웃·탈퇴(즉시 삭제). 프로필(닉네임·성별·캐릭터 부위). OpenAPI 0.1.0. curl/테스트로 로그인→내 정보→로그아웃·탈퇴 왕복 |
| 2 프론트 골격·3D 방(읽기) | 라우팅·로그인·세션 유지·로그아웃·오류/로딩. 서버 최소 방 조회. GLB·장면·좌석·캐릭터·카메라·시각별 조명·안개·컬링·품질 단계·탭 비활성 정지·DPR 상한·컨텍스트 소실 복구·dispose, 3D는 지연 청크. 앱과 같은 구도 비교, 첫 로드 크기·FPS 측정 |
| 3 타이머·기록·presence | 계정당 활성 세션(시작·일시정지·재개·끝내기, 서버 시각, 멱등), 기록, presence 30초, 04:00 경계, 통계 API. 프론트 미니멀 타이머·복원·탭 제목·통계·목표·과목. 04:00 경계·일시정지·두 탭 동시 상황이 서버 규칙대로 |
| 4 공부방·채팅·친구 | 방 CRUD·참여·나가기·초대·멤버·정원·맵, 배너·로고 업로드, 채팅 채널(`docs/contracts/study-room-chat.md`), 방 실시간 상태, 친구·공유 설정·친구 현황·함께 공부 요청. 브라우저 두 개(다른 계정)가 같은 방에서 서로 보고 채팅 |
| 5 랭킹·플래너·할 일 | 랭킹(기간·범위, presence 인정만), 할 일, 플래너 격자·달력 |
| 6 소리·음악 | WebAudio 믹서(앰비언트 7개·개별 볼륨), 음반 카탈로그·서명 URL·LP·입장 자동 재생(첫 제스처 뒤) |
| 7 상점·도토리·코디 | 지갑·원장·상점(기간 한정·할인·맵·음반)·구매(멱등·잔액 부족·중복 보유)·코디, 3D 캐릭터 반영 |
| 8 마감 | 성능·접근성·오류/오프라인 화면·로깅·보안 점검, 배포 체크리스트, 이 문서 최종 갱신 |

## 미결 항목

- 한글 서비스명·로고(현재 화면 표기 "StudyVillage").
- 친구를 찾는 방법: 독립 계정이라 친구 관계가 비어서 시작한다. PocketTime의 친구 초대·요청 방식을
  Phase 4 시작 전에 확인해 그대로 옮길지 묻는다.
- 방 실시간 상태 전달 방식(소켓 푸시 vs 폴링)은 Phase 4에서 지연을 재고 정한다.
- 현금 결제 설계(결제 수단)는 Phase 8 문서.

## 원본 출처

| 의미 | 원본 |
| --- | --- |
| 타이머·통계 규칙 | PocketTime `lib/feature/study/timer/domain/{study_timeline,study_stats,study_insights}.dart` |
| 3D 장면 | `lib/feature/study/room3d/` (`study_room_3d_scenes.dart`, `domain/*`), GLB `assets/study_themes/cafe_room_3d/` (f6865a86), 생성 스크립트 `tool/blender/study_room/` |
| 섬 팔레트·글래스 | `lib/feature/study/room/widgets/study_room_island.dart`, `widgets/study_glass.dart`, `lib/core/theme/` |
| 문구 | `lib/l10n/features/study_ko.arb`(412키), `todo_ko.arb`(72키) |
| 채팅 클라이언트 가정 | `lib/feature/study/chat/` |
| 사운드 | `assets/study/sounds/sources.json`(CC0), `assets/study/music/sources.json`(Pixabay) |
| 방 규칙 | PocketTimeServer `lib/pockettime_server/study/rooms.ex`, `study_maps.ex`, `docs/project/contracts/study-rooms.md` |
| 랭킹·presence·세션 | `study/rankings.ex`, `study/social.ex`, `study/sessions.ex`, `docs/project/contracts/study-social.md` |
| 지갑·상점·코디·음반 | `outfit.ex`, `outfit/catalog.ex`, `music.ex` |
| 할 일 | `todos/`, 앱 `docs/api/paths/todos.yaml` |
| API 모양 | 앱 `docs/api/paths/{study_rooms,study_social,outfit,todos}.yaml` |
| 인증 참고 | 앱 `docs/api/authentication.md` |
