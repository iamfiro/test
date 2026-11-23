# 공부방 v2(카툰 카페) 비교

지시: [docs/plan/blender-room-art-prompt.md](../../plan/blender-room-art-prompt.md). 만드는 법:

    blender -b --factory-startup --python tool/blender/study_room/export_study_assets_v2.py -- --cache <폴더>
    node tool/blender/study_room/verify_study_room_glb.mjs

원본 스크립트는 PocketTime `tool/blender/study_room/`(파일 마지막 변경 f6865a86, 복사 시점 f574f242)에서
복사했다(`build_study_room.py`·`bake_and_export.py`·`export_study_assets.py`, 그대로). v2는 그 평면도·벽·창
구멍·자리 표·베이크 흐름을 쓰고 가구·소품·색·조명을 새로 만들었다(외부 에셋 없음).

## 계약 체크리스트

| 계약 | 결과 |
| --- | --- |
| 자리 `seat_00`–`seat_32` | 33개, `cafeSeats`와 위치 차 0.00cm·yaw 차 0.0000rad(가구를 자리에서 거꾸로 놓는다) |
| 노드 `study_room / room_shell / room_props / room_outdoors / seat_NN` | 유지 |
| 재질 | `KHR_materials_unlit` 2개(껍데기·소품, 바깥은 소품 텍스처), 불투명, 뒤집힌 면 0 |
| 좌표 | 원본 그대로(큰 홀 X 0–16·Y 0–6.8, 날개 X 10.4–16·Y 6.8–12.7, 천장 4.2m, 창 열림, 남·서 벽은 원본처럼 앱에 전체 높이로 내보냄) |
| 예산 | 삼각형 44,520(≤ 45,000), 텍스처 2048²·2048² JPEG, 파일 3.87MB(≤ 4.5MB), 메시 3개 |
| 앉는 치수 | 의자 방석 0.49, 책상·테이블 윗면 0.76, 소파·안락의자 0.415, 바구니 의자 0.48(원본 셸 의자 자리), 의자–책상 간격 원본과 같음 |

검사 출력: [verify_output.txt](verify_output.txt).

## 화면 비교(웹, 430×900, 기본 카툰 룩, 오후 2시 고정 `VITE_STUDY_DEV_HOUR=14`)

[compare_v1_v2.jpg](compare_v1_v2.jpg): 위에서부터 3인칭·1인칭·위에서 보기, 왼쪽 v1·오른쪽 v2.
따로: `v1_*.jpg`, `v2_*.jpg`(전체 보기 포함). 가구 프로토타입: [prototypes_v2.jpg](prototypes_v2.jpg).

## 맞추지 못했거나 판단이 필요한 것

- **명암 대비 1.5배**: 화면 명도 5–95% 폭은 v1과 비슷하다(3인칭 0.52→0.48, 위 0.48→0.40, 1인칭 0.42→0.42).
  웹 후처리(빛 번짐·우윳빛 그림자)가 밝은 쪽을 1.0에 붙여 폭이 아래쪽(그늘)으로만 늘 수 있는데, 그늘을
  더 내리면 텍스처가 탁한 주황이 되어 멈췄다. v1은 낮에 바닥이 하얗게 날아가 폭이 넓어 보였고 v2는
  바닥 타일·창 볕 무늬가 보이게 했다. 더 올리려면 `bake_and_export_v2.TONE`의 `contrast`·`floor`를
  `--from-cache`로 다시 내보내면 된다(굽기 다시 안 함).
- 전구·갓은 텍스처에서 가장 밝은 0.2%가 평균 #FFFEEE(≥ #FFE9A8 밝기)이지만 노랑보다 흰빛에 가깝다.
- 창밖 하늘 면은 넣지 않았다(웹이 그린다). 창밖 나무는 4그루 + 꽃 덤불 4 + 울타리 3.
