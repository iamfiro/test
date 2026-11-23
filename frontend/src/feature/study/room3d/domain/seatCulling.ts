// 원본: lib/feature/study/room3d/domain/study_room_seat_culling.dart (PocketTime f574f242)

import { Box3, Matrix4, Vector3, Vector4 } from 'three';

import type { StudyRoomLayout } from '../model/layout';
import type { StudyRoomCameraRig } from './cameraRig';

/** 방석 앵커 기준 자리 상자(m): 앉은 사람과 의자, 기지개로 팔을 머리 위로 뻗은 자세까지. */
const seatBounds = new Box3(new Vector3(-0.75, -0.5, -0.75), new Vector3(0.75, 1.5, 0.75));

/**
 * 화면에 보이는 자리만 고른다. 렌더러는 고른 자리의 사람만 그리고 자세도 그 사람만 계산하며,
 * 자리 칩도 같은 결과로 만든다. 엔진과 무관한 순수 계산이다.
 *
 * 자리 하나는 방석 앵커 기준 상자(seatBounds)로 본다. 사람이 어느 쪽을 보든 들어가게 가로는
 * 대칭이다. 상자 꼭짓점 8개가 모두 시야 사각뿔의 같은 면 바깥(카메라 뒤, 또는 화면 가장자리 ±1을
 * margin만큼 넓힌 평면 바깥)에 있으면 보이지 않는다고 본다. 동차 좌표로 평면을 따지므로 카메라
 * 뒤 꼭짓점도 정확히 다룬다.
 */
export const StudyRoomSeatCulling = {
  /** 방석 앵커 기준 자리 상자(m). 복사본을 준다. */
  get seatBounds(): Box3 {
    return seatBounds.clone();
  },

  /** 화면 가장자리 여유(클립 공간 비율). 0.1이면 화면 높이의 5%씩. */
  defaultMargin: 0.1,

  /** layout의 자리마다 보이는지. 길이는 `layout.seatCount`. */
  visibleSeats(layout: StudyRoomLayout, rig: StudyRoomCameraRig, { margin = 0.1 }: { margin?: number } = {}): boolean[] {
    const viewProjection = rig.viewProjection;
    const corner = new Vector4();
    const limit = 1 + margin;
    const result: boolean[] = [];
    for (let seat = 0; seat < layout.seatCount; seat++) {
      result.push(visible(viewProjection, layout.seatAnchor(seat), corner, limit));
    }
    return result;
  },
} as const;

function visible(viewProjection: Matrix4, center: Vector3, corner: Vector4, limit: number): boolean {
  const min = seatBounds.min;
  const max = seatBounds.max;
  let behind = 0;
  let left = 0;
  let right = 0;
  let below = 0;
  let above = 0;
  for (let i = 0; i < 8; i++) {
    corner.set(
      center.x + ((i & 1) === 0 ? min.x : max.x),
      center.y + ((i & 2) === 0 ? min.y : max.y),
      center.z + ((i & 4) === 0 ? min.z : max.z),
      1,
    );
    corner.applyMatrix4(viewProjection);
    const w = corner.w;
    const x = corner.x;
    const y = corner.y;
    if (w <= 0) behind++;
    if (x < -limit * w) left++;
    if (x > limit * w) right++;
    if (y < -limit * w) below++;
    if (y > limit * w) above++;
  }
  return behind < 8 && left < 8 && right < 8 && below < 8 && above < 8;
}
