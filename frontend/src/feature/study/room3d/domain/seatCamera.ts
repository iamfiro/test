// 원본: lib/feature/study/room3d/domain/study_room_seat_camera.dart (PocketTime f574f242)

import { MathUtils, Vector3 } from 'three';

import { StudyRoomCamera, type StudyRoomSeat, type StudyRoomSize } from '../model/scene';
import { at, dartMod } from './dartMath';

/**
 * 공부 화면 시점. 내 자리 둘레만 비춰서 화면에 드는 사람·자리가 적다. 렌더러는 화면 밖 자리의
 * 사람을 그리지 않는다.
 * - firstPerson: 내 눈높이에서 앞(책상 쪽)을 본다. 내 캐릭터는 그리지 않는다.
 * - thirdPerson: 내 뒤 위에서 어깨 너머로 책상을 본다. 좌우로 끌어 내 자리 둘레를 돈다.
 * - top: 천장 바로 아래에서 넓게 내 책상 둘레를 내려다본다.
 * - overview: 방 모서리 높은 곳에서 사람들이 모인 곳을 비스듬히 내려다본다.
 * - roam: 카메라가 방 안을 천천히 돌며 함께 공부하는 사람들을 비춘다.
 * - auto: 일정 시간마다 장면을 바꾸는 자동 연출.
 */
export const studyRoomCameraModeValues = ['firstPerson', 'thirdPerson', 'top', 'overview', 'roam', 'auto'] as const;
export type StudyRoomCameraMode = (typeof studyRoomCameraModeValues)[number];

/** Dart `StudyRoomCameraMode.next`: 다음 시점(마지막 다음은 처음). */
export function nextCameraMode(mode: StudyRoomCameraMode): StudyRoomCameraMode {
  const index = studyRoomCameraModeValues.indexOf(mode);
  return at(studyRoomCameraModeValues, dartMod(index + 1, studyRoomCameraModeValues.length));
}

interface Shot {
  readonly pitch: number;
  readonly fov: number;
  /** 초점까지 거리(m). */
  readonly distance: number;
  /** 1인칭: 방석 위 눈높이. 있으면 카메라가 그 눈 자리에 있다. */
  readonly eyeHeight: number | null;
  /** 3인칭·위: 초점은 방석 위 focusHeight, 앞으로 focusAhead. */
  readonly focusHeight: number;
  readonly focusAhead: number;
}

function shot(s: { pitch: number; fov: number; distance: number; eyeHeight?: number; focusHeight?: number; focusAhead?: number }): Shot {
  return {
    pitch: s.pitch,
    fov: s.fov,
    distance: s.distance,
    eyeHeight: s.eyeHeight ?? null,
    focusHeight: s.focusHeight ?? 0,
    focusAhead: s.focusAhead ?? 0,
  };
}

const focusShot = shot({ pitch: 70, fov: 40, distance: 2.2, focusHeight: 0.4, focusAhead: 0.15 });
// 눈은 방석 위 약 0.62m. 초점은 눈에서 앞 아래로 1.2m.
const firstPersonShot = shot({ pitch: 16, fov: 64, distance: 1.2, eyeHeight: 0.62 });
const thirdPersonShot = shot({ pitch: 30, fov: 52, distance: 2.3, focusHeight: 0.55, focusAhead: 0.35 });
// 초점까지 3.2m: 카메라가 바닥 위 약 4m(천장 4.2m 아래)에서 내 둘레 책상을 담는다.
const topShot = shot({ pitch: 70, fov: 40, distance: 3.2, focusHeight: 0.4, focusAhead: 0.15 });

/**
 * 자리 하나를 기준으로 시점마다 카메라를 만든다. 렌더러와 무관한 순수 계산이다.
 *
 * StudyRoomCamera는 초점·각도·화면 폭으로 카메라를 정하므로, 시점마다 정한 초점까지 거리가
 * 나오도록 화면 비율에 맞춰 폭을 고른다.
 */
export const StudyRoomSeatCamera = {
  /**
   * 집중 모드로 다가갈 때 출발하는 구도: 머리 바로 위에서 가까이 내려다본다. 위에서 보기
   * 시점보다 낮아서, 화면에 맞춰 조금 물러나도 천장(4.2m) 아래에 머문다.
   */
  focusBase(seat: StudyRoomSeat, size: StudyRoomSize): StudyRoomCamera {
    return camera(focusShot, seat, size, seat.yaw);
  },

  /**
   * 웹 전용(공부 요약 카드 사진): 앉은 사람을 책상 너머 앞에서 조금 내려다보며 상반신을 담는다.
   * 카메라 yaw를 자리 yaw 그대로 두면(다른 시점은 +180) 사람 얼굴 쪽에서 본다.
   */
  /** 사진 카메라에서 사람까지 거리(m). 이보다 0.75m 넘게 앞(카메라 쪽)에 있는 벽은 가까운 면으로 잘라 낸다. */
  portraitDistance: 2.4,

  portrait(seat: StudyRoomSeat, size: StudyRoomSize, s = { pitch: 10, fov: 30, distance: 2.4, height: 0.52 }): StudyRoomCamera {
    const aspect = size.width / size.height;
    return new StudyRoomCamera({
      projection: 'perspective',
      pitchDegrees: s.pitch,
      yawDegrees: MathUtils.radToDeg(seat.yaw),
      fovYDegrees: s.fov,
      target: seat.anchor.add(new Vector3(0, s.height, 0)),
      viewWidth: s.distance * 2 * Math.tan(MathUtils.degToRad(s.fov) / 2) * aspect,
      minViewHeight: 0,
    });
  },

  /**
   * orbitDegrees: 3인칭에서 내 자리 둘레로 돈 각도(끌어서 돌린다). 다른 시점은 무시한다.
   * pitchDegrees·distanceScale(웹 전용, 사용자 결정 2026-11-23): 3인칭에서 위아래로 끌어 내려다보는 각도,
   * 휠·두 손가락으로 거리를 바꾼다. 카메라가 천장(4.2m) 위로 나가지 않게 거리를 줄인다.
   */
  of(
    mode: StudyRoomCameraMode,
    seat: StudyRoomSeat,
    size: StudyRoomSize,
    { orbitDegrees = 0, pitchDegrees = 0, distanceScale = 1 }: { orbitDegrees?: number; pitchDegrees?: number; distanceScale?: number } = {},
  ): StudyRoomCamera {
    let s = mode === 'firstPerson' ? firstPersonShot : mode === 'thirdPerson' ? thirdPersonShot : topShot;
    const orbit = mode === 'thirdPerson' ? MathUtils.degToRad(orbitDegrees) : 0.0;
    if (mode === 'thirdPerson' && (pitchDegrees !== 0 || distanceScale !== 1)) {
      const pitch = Math.min(80, Math.max(5, s.pitch + pitchDegrees));
      let distance = s.distance * distanceScale;
      // 눈 높이 = 방석 + 초점 높이 + 거리·sin(각도). 천장 아래 3.9m까지.
      const room = 3.9 - seat.y - s.focusHeight;
      distance = Math.min(distance, room / Math.max(0.05, Math.sin(MathUtils.degToRad(pitch))));
      s = { ...s, pitch, distance };
    }
    return camera(s, seat, size, seat.yaw + orbit);
  },

  /** 두 카메라 사이(시점을 바꾸거나 집중 모드로 다가갈 때). 좌우 각도는 짧은 쪽으로 돈다. */
  lerp(a: StudyRoomCamera, b: StudyRoomCamera, t: number): StudyRoomCamera {
    const mix = (x: number, y: number) => x + (y - x) * t;
    // Dart `%`는 늘 0 이상이라 dartMod로 맞춘다(JS `%`는 음수가 나온다).
    let dyaw = dartMod(b.yawDegrees - a.yawDegrees, 360);
    if (dyaw > 180) dyaw -= 360;
    return new StudyRoomCamera({
      projection: b.projection,
      pitchDegrees: mix(a.pitchDegrees, b.pitchDegrees),
      yawDegrees: a.yawDegrees + dyaw * t,
      fovYDegrees: mix(a.fovYDegrees, b.fovYDegrees),
      target: a.target.clone().add(b.target.clone().sub(a.target).multiplyScalar(t)),
      viewWidth: mix(a.viewWidth, b.viewWidth),
      minViewHeight: mix(a.minViewHeight, b.minViewHeight),
    });
  },
} as const;

/** shot을 yaw 쪽에서 본 카메라. 초점은 자리가 보는 쪽 기준이라 yaw가 달라도 내 자리를 가운데 둔다. */
function camera(s: Shot, seat: StudyRoomSeat, size: StudyRoomSize, yaw: number): StudyRoomCamera {
  const facing = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const pitch = MathUtils.degToRad(s.pitch);
  const forward = new Vector3(facing.x * Math.cos(pitch), -Math.sin(pitch), facing.z * Math.cos(pitch));
  let target: Vector3;
  if (s.eyeHeight !== null) {
    target = seat.anchor.add(new Vector3(0, s.eyeHeight, 0)).add(forward.clone().multiplyScalar(s.distance));
  } else {
    // 돌아도 초점은 내 책상 앞(자리가 보는 쪽) 그대로라 내 자리를 가운데 두고 돈다.
    target = seat.anchor.add(new Vector3(0, s.focusHeight, 0)).add(seat.facing.multiplyScalar(s.focusAhead));
  }
  // 원근: 초점까지 거리 = (폭 / 화면 비율) / (2·tan(fov/2)).
  const aspect = size.width / size.height;
  const width = s.distance * 2 * Math.tan(MathUtils.degToRad(s.fov) / 2) * aspect;
  return new StudyRoomCamera({
    projection: 'perspective',
    pitchDegrees: s.pitch,
    // 카메라 yaw 0은 -Z를 본다. 앉은 사람이 보는 쪽(+Z에서 yaw만큼)을 보려면 π를 더한다.
    yawDegrees: MathUtils.radToDeg(yaw) + 180,
    fovYDegrees: s.fov,
    target,
    viewWidth: width,
    minViewHeight: 0,
  });
}
