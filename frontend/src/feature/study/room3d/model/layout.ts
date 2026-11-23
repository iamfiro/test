// 원본: lib/feature/study/room3d/model/study_room_layout.dart (PocketTime f574f242)

import { Vector3 } from 'three';

import { at } from '../domain/dartMath';
import type { StudyRoomSeat } from './scene';

/**
 * 지금 방에 앉은 자리. 맵의 자리(StudyRoom3dScene.seats) 중 앞에서부터 seatCount개를 쓴다.
 * 렌더러와 무관한 순수 계산이다.
 *
 * 좌표는 glTF 방 공간(m): +X 오른쪽(동), +Y 위, +Z 방 앞쪽(남, 카메라 쪽).
 */
export class StudyRoomLayout {
  private readonly mapSeats: readonly StudyRoomSeat[];

  /** 앉힌 자리 수. */
  readonly seatCount: number;

  /** 앉은 사람이 책상(테이블) 위 손을 두는 높이(바닥 기준, m). */
  static readonly deskHeight = 0.75;

  /**
   * seats명(사람 + 초대 자리)을 앉힌다. 맵 최대 인원보다 많으면 최대 인원까지만.
   * seats는 0 이상이어야 한다(원본은 디버그 assert만 둔다).
   */
  constructor({ mapSeats, seats }: { mapSeats: readonly StudyRoomSeat[]; seats: number }) {
    this.mapSeats = mapSeats;
    this.seatCount = Math.min(seats, mapSeats.length);
  }

  /** 맵 최대 인원. */
  get capacity(): number {
    return this.mapSeats.length;
  }

  seat(seat: number): StudyRoomSeat {
    this.check(seat);
    return at(this.mapSeats, seat);
  }

  /** seat 좌석 앵커(방석 윗면 가운데). */
  seatAnchor(seat: number): Vector3 {
    return this.seat(seat).anchor;
  }

  /** seat에 앉은 사람이 보는 쪽 책상 윗면 가운데(손이 놓이는 곳 근처). */
  deskFront(seat: number): Vector3 {
    const s = this.seat(seat);
    const front = s.anchor.add(s.facing.multiplyScalar(0.45));
    return new Vector3(front.x, StudyRoomLayout.deskHeight, front.z);
  }

  private check(seat: number): void {
    if (seat < 0 || seat >= this.seatCount) {
      throw new RangeError(
        `Invalid value (seat): Not in inclusive range 0..${Math.max(0, this.seatCount - 1)}: ${seat}`,
      );
    }
  }

  /** Dart `==`: 앉힌 수가 같고 같은 자리 목록 객체를 쓴다. */
  equals(other: StudyRoomLayout): boolean {
    return other.seatCount === this.seatCount && other.mapSeats === this.mapSeats;
  }
}
