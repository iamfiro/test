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
| `frontend/src/feature/study/stats/*` | `widgets/study_stats_view.dart`, `widgets/streak_flame.dart`, `timer/domain/study_stats.dart`(진행 중 몫) | f574f242 | 의미·값 이식, 불꽃은 정적 SVG |
| `frontend/src/feature/study/sound/*` | `sound/{model,viewmodel,application}/*.dart`, `widgets/study_sound_panel.dart`, `widgets/study_lp_player.dart` | f574f242 | 의미·값 이식(HTMLAudioElement로 재생) |
| `frontend/src/feature/study/room3d/SeatPlanMarker.tsx`, `StudyRoom3dView.tsx`(planView·planCamera·rise), `StudyRoomStage.tsx`(자리 순서·이동) | `room3d/widgets/study_seat_plan.dart`, `room3d/widgets/study_room_3d_view.dart`(_planCamera·_rise·_planSeats), `page/study_home_page.dart`(_seatOrder·_takenSeats·_moveSeat) | f574f242 | 의미·값 이식 |
| `frontend/public/assets/brand/study_with_me.webp` | 사용자 제공 이미지(2026-11-23, 흰색 "Study With Me" 레터링). 투명 여백을 잘라 900px 폭으로 줄임 | — | 공부 탭 맨 위 가운데 로고 |
