# 출처

PocketTime에서 가져온 코드 의미·자산·문구. 원본 커밋: PocketTime `f574f242`, PocketTimeServer `8cbff23`
(2026-11-23). 의미만 옮기고 코드를 새로 쓴 것도 원본 파일을 적는다.

| StudyVillage | 원본 | 원본 커밋 | 비고 |
| --- | --- | --- | --- |
| `frontend/public/assets/icons/{study_*,empty_*.svg,brand/*}`, `nav/study_tab_*.png` | PocketTime `assets/icons/` | f574f242 | 원본 그대로. 단 `nav/study_tab_*.png`는 아래 행 참고 |
| `frontend/public/assets/study_themes/cafe_room_3d/` | PocketTime `assets/study_themes/cafe_room_3d/` (생성: `tool/blender/study_room/export_study_assets.py`) | f6865a86 (자산 마지막 변경) | Draco/meshopt 압축은 사본에만(Phase 8) |
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
| `frontend/public/assets/icons/nav/study_tab_*.png` | Codex 이미지 생성(2026-11-23). 화풍 참고: `icons/study_{shop,trophy,music,camera,chat}.png`, 주제 참고: PocketTime `assets/icons/nav/study_tab_*.png` | — | 512px 원본·프롬프트는 `tool/assets/tab_icons_codex/`, 200px로 줄여 씀 |
