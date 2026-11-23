// 원본: lib/feature/study/room3d/domain/study_room_quality.dart (PocketTime f574f242)

/**
 * 3D 공부방 품질 단계. 위일수록 곱고 무겁다. 기기 성능에 맞춰 한 단계씩 낮춘다
 * (StudyRoomQualityGovernor). 모든 단계가 같은 방·같은 사람·같은 질감을 그리고, 낮은 단계는
 * 아래만 다르다.
 *
 * - renderHz: 3D를 다시 그리는 최대 횟수(끌기·동작 합쳐서). 자리 칩도 이 박자로 움직인다.
 *   모든 단계가 30 이상이다.
 * - pixelWidth: 픽셀 질감 장면(StudyRoomLook.pixelated)의 내부 가로 해상도 목표. 렌더러는
 *   기기 픽셀의 정수배가 되는 가장 가까운 값을 고른다(1080px 폰: 360 → 3배).
 * - smoothWidth: 부드러운 장면의 내부 가로 해상도 상한(px). 기기가 더 작으면 기기 해상도로 그린다.
 * - motionFps: 사람 동작을 끊어 그리는 초당 횟수. 0이면 정지 자세로 앉아 있고, 3D는 화면을
 *   움직일 때만 다시 그린다.
 *
 * Dart enum(필드 포함)과 같게 인스턴스는 넷뿐이고 같은 단계는 같은 객체다(Map 키로 쓴다).
 */
export class StudyRoomQuality {
  static readonly high = new StudyRoomQuality('high', 0, 60, 360, 720, 15);
  static readonly medium = new StudyRoomQuality('medium', 1, 30, 360, 600, 15);
  static readonly low = new StudyRoomQuality('low', 2, 30, 270, 480, 10);
  static readonly minimal = new StudyRoomQuality('minimal', 3, 30, 216, 400, 0);

  static readonly values: readonly StudyRoomQuality[] = [
    StudyRoomQuality.high,
    StudyRoomQuality.medium,
    StudyRoomQuality.low,
    StudyRoomQuality.minimal,
  ];

  private constructor(
    readonly name: 'high' | 'medium' | 'low' | 'minimal',
    readonly index: number,
    readonly renderHz: number,
    readonly pixelWidth: number,
    readonly smoothWidth: number,
    readonly motionFps: number,
  ) {}

  /** 3D 한 장에 쓸 수 있는 시간(ms). UI·래스터 모두 이 안에 끝나야 renderHz를 지킨다. */
  get frameBudgetMs(): number {
    return 1000 / this.renderHz;
  }

  /** 한 단계 아래. 맨 아래면 null. */
  get lower(): StudyRoomQuality | null {
    return this.index + 1 < StudyRoomQuality.values.length ? (StudyRoomQuality.values[this.index + 1] ?? null) : null;
  }

  /** 한 단계 위. 맨 위면 null. */
  get higher(): StudyRoomQuality | null {
    return this.index > 0 ? (StudyRoomQuality.values[this.index - 1] ?? null) : null;
  }

  /** 저장 값으로 찾는다. 모르는 값이면 null. */
  static byName(name: string | null | undefined): StudyRoomQuality | null {
    for (const quality of StudyRoomQuality.values) {
      if (quality.name === name) return quality;
    }
    return null;
  }
}
