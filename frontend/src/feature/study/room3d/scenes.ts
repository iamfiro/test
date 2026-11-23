// 원본: lib/feature/study/room3d/study_room_3d_scenes.dart (PocketTime f574f242)

import { Vector3 } from 'three';

import { StudyRoomFloorArea, StudyRoomInterior } from './domain/director';
import { colorFromArgb } from './model/color';
import { StudyRoom3dScene, StudyRoomCamera, StudyRoomLook, StudyRoomSeat } from './model/scene';

/**
 * 기본 분위기: 오후 햇살이 은은하게 번지는 따뜻한 카페. 바탕을 한 톤 낮추고 노란 끼만 살짝 덜어
 * 분홍기를 아주 조금 남긴다. 멀리 있는 라운지·창가는 옅은 살구빛 안개로 감싸고, 내 둘레(초점 1m
 * 안)는 또렷하다.
 */
const ambient = new StudyRoomLook({
  brightness: 0.95,
  tint: colorFromArgb(0xffffedf0),
  fogColor: colorFromArgb(0xffefd9d6),
  fogAmount: 0.3,
  fogStart: 1.2,
  fogEnd: 9.0,
  saturation: 0.9,
});

/**
 * `build_study_room.py`의 `SEATS`(GLB `seat_NN`)와 같은 순서·값.
 * 0–11 공용 테이블(0번 내 자리, 1번은 맞은편: 마주 보는 짝끼리 가운데부터),
 * 12–18 남쪽 개인 책상,
 * 19–23 라운지(코냑 소파·셸 의자), 24–28 라운지(회색 소파·안락의자),
 * 29–30 날개 독서 의자, 31–32 서쪽 안락의자.
 */
const cafeSeats: readonly StudyRoomSeat[] = [
  new StudyRoomSeat(4.825, 0.49, -4.28, -0.048),
  new StudyRoomSeat(4.825, 0.49, -2.51, -3.0943),
  new StudyRoomSeat(5.89, 0.49, -4.28, 0.1178),
  new StudyRoomSeat(5.979, 0.49, -2.503, -3.1134),
  new StudyRoomSeat(3.807, 0.49, -4.28, -0.0771),
  new StudyRoomSeat(3.8, 0.49, -2.501, -3.07),
  new StudyRoomSeat(6.964, 0.49, -4.28, -0.1185),
  new StudyRoomSeat(7.005, 0.49, -2.473, 3.0659),
  new StudyRoomSeat(2.729, 0.49, -4.28, 0.0146),
  new StudyRoomSeat(2.776, 0.49, -2.493, -3.1397),
  new StudyRoomSeat(8.039, 0.49, -4.28, -0.1148),
  new StudyRoomSeat(8.062, 0.49, -2.492, -3.0579),
  new StudyRoomSeat(5.562, 0.49, -0.9, 0.1275),
  new StudyRoomSeat(4.413, 0.49, -0.9, 0.0183),
  new StudyRoomSeat(6.75, 0.49, -0.9, 0.0587),
  new StudyRoomSeat(2.584, 0.49, -0.9, -0.071),
  new StudyRoomSeat(7.939, 0.49, -0.9, -0.138),
  new StudyRoomSeat(1.298, 0.49, -0.9, 0.0495),
  new StudyRoomSeat(9.154, 0.49, -0.9, 0.153),
  new StudyRoomSeat(13.6, 0.415, -5.67, 0.0, 'lounge'),
  new StudyRoomSeat(14.213, 0.415, -5.67, 0.0, 'lounge'),
  new StudyRoomSeat(12.987, 0.415, -5.67, 0.0, 'lounge'),
  new StudyRoomSeat(12.259, 0.48, -4.56, 1.7453, 'lounge'),
  new StudyRoomSeat(14.94, 0.48, -4.545, -1.4835, 'lounge'),
  new StudyRoomSeat(13.3, 0.415, -2.15, 0.0, 'lounge'),
  new StudyRoomSeat(13.913, 0.415, -2.15, 0.0, 'lounge'),
  new StudyRoomSeat(12.687, 0.415, -2.15, 0.0, 'lounge'),
  new StudyRoomSeat(12.0, 0.415, -1.15, 1.5708, 'lounge'),
  new StudyRoomSeat(14.6, 0.415, -1.15, -1.5708, 'lounge'),
  new StudyRoomSeat(13.45, 0.415, -8.65, 0.0, 'lounge'),
  new StudyRoomSeat(15.0, 0.48, -8.59, 0.0, 'lounge'),
  new StudyRoomSeat(0.67, 0.415, -2.6, 1.5708, 'lounge'),
  new StudyRoomSeat(0.67, 0.415, -4.35, 1.5708, 'lounge'),
];

/**
 * 앱에 들어 있는 3D 공부방 장면. 모델 원본은 PocketTime `tool/blender/study_room/`의 스크립트로
 * 다시 만들 수 있다(`export_study_assets.py -- room`). 에셋 경로는 원본 그대로이며 웹에서는
 * `public/assets/...`에 같은 경로로 있다.
 */
export const StudyRoom3dScenes = {
  ambient,
  cafeSeats,

  /**
   * 낮의 라운지 카페(손그림 평면도 기준 L자 방). 공용 테이블·개인 책상·소파 라운지에 33자리가
   * 있다. 카메라는 내 자리 둘레(1인칭·3인칭·머리 위)만 비춘다.
   */
  cafe: new StudyRoom3dScene({
    asset: 'assets/study_themes/cafe_room_3d/study_room.glb',
    characterAsset: 'assets/study_themes/cafe_room_3d/study_characters.glb',
    propAsset: 'assets/study_themes/cafe_room_3d/study_props.glb',
    sceneryAsset: 'assets/study_themes/cafe_room_3d/study_scenery.glb',
    // 창밖 하늘: 옅은 살구빛.
    backdrop: colorFromArgb(0xfff3e1dc),
    seats: cafeSeats,
    look: ambient,
    // 벽 안쪽 바닥: 큰 홀(16×6.8m)과 동쪽 날개. 천장 4.2m.
    interior: new StudyRoomInterior({
      areas: [new StudyRoomFloorArea(0.1, -6.7, 15.9, -0.1), new StudyRoomFloorArea(10.5, -12.6, 15.9, -6.7)],
      ceiling: 4.2,
    }),
    camera: new StudyRoomCamera({
      projection: 'perspective',
      pitchDegrees: 52,
      fovYDegrees: 38,
      target: new Vector3(6.0, 0.4, -3.4),
      viewWidth: 6.0,
      minViewHeight: 0,
    }),
  }),
} as const;
