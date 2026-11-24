# 출처

PocketTime에서 가져온 코드 의미·자산·문구. 원본 커밋: PocketTime `f574f242`, PocketTimeServer `8cbff23`
(2026-11-23). 의미만 옮기고 코드를 새로 쓴 것도 원본 파일을 적는다.

| StudyVillage | 원본 | 원본 커밋 | 비고 |
| --- | --- | --- | --- |
| `frontend/public/assets/icons/{study_*,empty_*.svg,brand/*}`, `nav/study_tab_*.png` | PocketTime `assets/icons/` | f574f242 | 원본 그대로. 단 `nav/study_tab_*.png`는 아래 행 참고 |
| `frontend/public/assets/study_themes/cafe_room_3d/` | PocketTime `assets/study_themes/cafe_room_3d/` (생성: `tool/blender/study_room/export_study_assets.py`) | f6865a86 (자산 마지막 변경) | Draco/meshopt 압축은 사본에만(Phase 8). `study_room_v2.glb`는 아래 v2 스크립트로 새로 만든 것 |
| `tool/blender/study_room/{build_study_room,bake_and_export,export_study_assets}.py` | PocketTime `tool/blender/study_room/` 같은 이름 | f6865a86 (파일 마지막 변경, 복사 시점 f574f242) | 원본 그대로(v1 `study_room.glb` 재현용) |
| `tool/blender/study_room/{cozy_kit,build_study_room_v2,bake_and_export_v2,export_study_assets_v2,preview_prototypes}.py`, `verify_study_room_glb.mjs` | 위 원본 스크립트(평면도·벽·창 구멍·자리 표·베이크 흐름) | f6865a86 | v2 카툰 카페: 가구·소품·색·조명을 새로 모델링. 외부 에셋 없음 |
| `frontend/public/assets/study/sounds/` | PocketTime `assets/study/sounds/` + `sources.json` | f574f242 | CC0 1.0 |
| `frontend/public/assets/study/music/` | PocketTime `assets/study/music/` + `sources.json` | f574f242 | Pixabay, 사용자 확인(2026-11-23) |
| `frontend/public/assets/study_outfit/`, `study_shop/` | PocketTime 같은 경로 | f574f242 | |
| `frontend/public/fonts/TmoneyRoundWindExtraBold.otf` | PocketTime `assets/fonts/` | f574f242 | |
| `frontend/src/l10n/{study,todo}_ko.json` | PocketTime `lib/l10n/features/{study,todo}_ko.arb` | f574f242 | 문구 원천 |
| `frontend/src/core/theme/tokens.css` | `lib/core/theme/*`, `room/widgets/study_room_island.dart` 팔레트 | f574f242 | 값 복사 |
| `frontend/src/core/ui/Island*.tsx` | `room/widgets/study_room_island.dart` (Surface·Button·IconButton·Background) | f574f242 | 의미 이식 |
| `frontend/src/feature/study/shell/StudyTabBar.tsx` | `widgets/study_tab_bar.dart` | f574f242 | 의미 이식 |
| `frontend/src/core/ui/Toast.tsx` | `lib/shared/widgets/app_toast.dart` | f574f242 | 값 복사 |
| `frontend/src/feature/auth/LoginPage.tsx` | `lib/feature/auth/page/login_page.dart`, `widgets/*_login_button.dart` | f574f242 | 패턴 |
| `frontend/src/feature/study/room3d/{model,domain,scenes.ts}` | `lib/feature/study/room3d/{model,domain}/*.dart`, `study_room_3d_scenes.dart` | f574f242 | 의미 이식(Dart 정수·나머지 규칙 유지) |
| `frontend/src/feature/study/room3d/three/retroMaterial.ts` | `packages/flutter_scene/shaders/pocket_retro.frag`, `flutter_scene_retro_look.dart` | f574f242 | 셰이더 그대로 |
| `frontend/src/feature/study/room3d/three/{ThreeStudyRoomRenderer,characterKit}.ts` | `infrastructure/flutter_scene/flutter_scene_{study_room_renderer,character_kit}.dart` | f574f242 | flutter_scene → three.js |
| `frontend/src/feature/study/room3d/{StudyRoom3dView,StudyRoomSky}.tsx`, `skyStars.json` | `widgets/study_room_3d_view.dart`, `widgets/study_room_sky.dart` | f574f242 | 별 위치는 Dart `Random`으로 뽑은 값 |
| `frontend/src/feature/study/timer/timerStore.ts` | `timer/domain/study_timeline.dart`(구간 합) | f574f242 | 진실은 서버 세션(결정 12) |
| `frontend/public/assets/icons/nav/study_tab_*.png` | Codex 이미지 생성(2026-11-23, 공부방은 푸른 지구 `tab_rooms_globe.png`). 화풍 참고: `icons/study_{shop,trophy,music,camera,chat}.png`, 주제 참고: PocketTime `assets/icons/nav/study_tab_*.png` | — | 512px 원본·프롬프트는 `tool/assets/tab_icons_codex/`, 200px로 줄여 씀 |
| `frontend/public/assets/study_recap/doodle_{arrow,star,note,flower,sparkle}.webp` | Codex 이미지 생성(2026-11-23, 공부 요약 시트 손그림 낙서 7종 중 청록·노랑 5종만 씀) | — | 원본 PNG 7종·프롬프트(`doodle_prompt.txt`)는 `tool/assets/recap_codex/`, cwebp q90 |
| 글꼴 Gaegu(`@fontsource/gaegu` 5.3.0, OFL-1.1) | npm | — | 공부 요약 시트 손글씨 라벨·값 |
| `frontend/public/assets/study_recap/{board,clip,ticket,paperclip,tape}.webp` | Codex 이미지 생성(2026-11-23~24, 공부 요약 시트). 화풍 참고: `icons/study_{trophy,camera}.png`, 구성 참고: 사용자가 준 클립보드 프로필 레퍼런스(캐릭터·로고 제외). 판(집게 없음)·집게·티켓은 `recap_v3_prompt.txt`로 다시 그림(찌그러진 집게를 따로 그리고, 티켓을 차분한 승차권으로) | — | 원본 PNG·프롬프트는 `tool/assets/recap_codex/`, cwebp q90으로 줄여 씀 |
| `frontend/src/feature/study/stats/*` | `widgets/study_stats_view.dart`, `widgets/streak_flame.dart`, `timer/domain/study_stats.dart`(진행 중 몫) | f574f242 | 의미·값 이식, 불꽃은 정적 SVG |
| `frontend/src/feature/study/sound/*` | `sound/{model,viewmodel,application}/*.dart`, `widgets/study_sound_panel.dart`, `widgets/study_lp_player.dart` | f574f242 | 의미·값 이식(HTMLAudioElement로 재생) |
| `frontend/src/feature/study/room3d/SeatPlanMarker.tsx`, `StudyRoom3dView.tsx`(planView·planCamera·rise), `StudyRoomStage.tsx`(자리 순서·이동) | `room3d/widgets/study_seat_plan.dart`, `room3d/widgets/study_room_3d_view.dart`(_planCamera·_rise·_planSeats), `page/study_home_page.dart`(_seatOrder·_takenSeats·_moveSeat) | f574f242 | 의미·값 이식 |
| `frontend/public/assets/brand/study_with_me.webp` | 사용자 제공 이미지(2026-11-23, 흰색 "Study With Me" 레터링). 투명 여백을 잘라 900px 폭으로 줄임 | — | 공부 탭 맨 위 가운데 로고 |
| `server/src/profile/nickname.ts`(관형형 형용사·동물 단어 목록, 닉네임 규칙), `server/src/profile/avatar.ts`(캐릭터 값 목록) | PocketTimeServer `lib/pockettime_server/friends/nickname.ex`, `avatar.ex` | 8cbff23 | 의미·단어 목록 이식(코드는 새로 씀). 처음 가입한 사람에게 "추운 비버" 같은 이름과 무작위 캐릭터를 준다 |
| `server/src/moderation/reports.ts`(`REPORT_REASONS`), 계약 `ReportReason` | PocketTime `lib/feature/moderation/model/report_reason.dart`, PocketTimeServer `lib/pockettime_server/moderation/category.ex` | f574f242, 8cbff23 | 신고 사유 값·문구 이식(시간표용 `wrong_info` 제외, `other`만 설명 필수, 설명 1000자) |
| `server/src/rooms/*`(비밀번호 되돌릴 수 있는 암호화·방장만 읽기, 초대 링크 7일·최신 하나만 유효·SHA-256·조각 토큰, 참여·수락 시간당 30회, 내보내기는 차단 아님, 방장 탈퇴 시 방 삭제), 방 이름 신고 처리 이름 | PocketTimeServer `docs/project/contracts/study-rooms.md`, PocketTime `lib/l10n/features/study_ko.arb`(`studyRoomNameDefault` "{nickname}의 공부방") | 8cbff23(파일 07d9f76), f574f242 | 의미 이식(코드는 새로 씀). 암호화 키는 `ROOM_PASSWORD_KEY`(PocketTime은 `secret_key_base`) |
| `server/src/realtime/live-rooms.ts`(상태 공부 중·쉬는 중·자리 비움, 실시간 순위: 머리 위 시간 긴 순·0초 제외), `server/src/chat/*`(최근 50개, 10초 5개, 30일, client_id 멱등) | PocketTime `lib/feature/study/page/study_home_page.dart`(`studyPresenceOf`), `lib/feature/study/widgets/study_live_ranking_sheet.dart`(`studyLiveRankingEntries`), `lib/feature/study/theme/model/study_participant.dart`(`StudyPresence`), 결정 9(`docs/plan/study-village.md`) | f574f242 | 의미 이식(코드는 새로 씀). 순위 동점은 앱의 "나 먼저" 대신 닉네임·id 순(서버는 보는 사람마다 다르게 매기지 않는다). presence 75초 끊김을 자리 비움으로 더함 |
| `frontend/public/og.png` | StudyVillage 랜딩 화면을 1200×630으로 찍은 것(헤드리스 Chrome, 2026-11-25) | — | 공유 미리보기(OG). 새로 그린 그림이 아니라 실제 화면 |
| 파비콘(`index.html` → `assets/icons/nav/study_tab_study.png`) | 위 공부 탭 아이콘 그대로 | — | 새 파일 없음, 같은 파일을 가리킨다 |
