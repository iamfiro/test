// 원본: lib/feature/study/room3d/domain/study_room_render_stats.dart (PocketTime f574f242)

/**
 * 3D 공부방 렌더 통계(개발 측정용). 렌더러가 장면을 그릴 때마다 더한다.
 * 앱은 쓰지 않고 개발 측정에만 붙인다. 렌더러는 출시 빌드에서 기록하지 않는다.
 */
export class StudyRoomRenderStats {
  /** 3D 장면을 그린 횟수. */
  renders = 0;

  /** 그동안의 드로우콜 합. */
  drawCalls = 0;

  /** 마지막으로 그린 장면의 드로우콜. */
  lastDrawCalls = 0;

  /** 자세 계산 + 장면 인코딩에 쓴 시간 합(µs). */
  renderMicros = 0;

  /** 그동안 자세를 계산한 사람 수 합. */
  posedPeople = 0;

  /** 마지막 배치의 앉은 사람 수와, 마지막 장면에서 그린 사람 수. */
  people = 0;
  drawnPeople = 0;

  reset(): void {
    this.renders = 0;
    this.drawCalls = 0;
    this.renderMicros = 0;
    this.posedPeople = 0;
  }
}
