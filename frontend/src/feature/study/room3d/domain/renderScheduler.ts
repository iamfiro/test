// 원본: lib/feature/study/room3d/domain/study_room_render_scheduler.dart (PocketTime f574f242)

const microsecondsPerSecond = 1000000;

/**
 * 밀리초 → 정수 마이크로초. Dart Duration은 정수 마이크로초라서, 장면 번호(`~/`)·상한 간격
 * 계산을 같은 정수 단위에서 해야 Dart와 같은 경계가 나온다(브라우저 시각은 소수 ms).
 */
function toMicros(ms: number): number {
  return Math.round(ms * 1000);
}

function toMs(micros: number): number {
  return micros / 1000;
}

/**
 * 3D 장면을 언제 다시 그릴지 정한다. 엔진·위젯과 무관한 순수 계산이다.
 *
 * 다시 그릴 이유는 둘이다: 카메라가 바뀜(스크롤·화면 크기·배치), 사람 동작이 다음 장면이 됨.
 * 둘을 한 박자로 묶어 마지막으로 그린 뒤 `1 / capHz`초가 지나기 전에는 그리지 않는다. 동작은
 * motionFps로 끊은 장면 번호가 바뀔 때만 다시 그린다.
 *
 * 시각 두 가지를 받는다(모두 ms, Dart Duration 대신).
 * - frameTimeMs: vsync 타임스탬프(requestAnimationFrame 시각 등, 상한 계산용).
 * - motionTimeMs: 동작 시계(화면이 꺼져 있던 동안은 흐르지 않는 시계).
 */
export class StudyRoomRenderScheduler {
  private capHzValue: number;
  private motionFpsValue: number;
  private animatingFlag = false;
  private cameraDirtyFlag = true;
  /** 마지막으로 그린 frameTime(µs). */
  private lastRender: number | null = null;
  private renderedMotionFrame: number | null = null;

  /** vsync 간격의 흔들림(µs). 120Hz에서 상한 30Hz면 4프레임째(33.3ms)에 그리도록 조금 봐준다. */
  private static readonly slackMicros = 2000;

  constructor({ capHz, motionFps }: { capHz: number; motionFps: number }) {
    StudyRoomRenderScheduler.check(capHz, motionFps);
    this.capHzValue = capHz;
    this.motionFpsValue = motionFps;
  }

  get capHz(): number {
    return this.capHzValue;
  }

  get motionFps(): number {
    return this.motionFpsValue;
  }

  /** 사람 동작을 재생하는지(앉은 사람이 있고, 움직임 줄이기가 꺼져 있고, 단계가 동작을 켬). */
  get animating(): boolean {
    return this.animatingFlag && this.motionFpsValue > 0;
  }

  /** 카메라가 바뀌어 아직 그리지 않았는지. */
  get cameraDirty(): boolean {
    return this.cameraDirtyFlag;
  }

  /** 그려야 할 것이 있는지(상한과 무관). */
  needsRender(motionTimeMs: number): boolean {
    return (
      this.cameraDirtyFlag ||
      this.renderedMotionFrame === null ||
      (this.animating && this.motionFrameAt(motionTimeMs) !== this.renderedMotionFrame)
    );
  }

  configure({ capHz, motionFps, animating }: { capHz?: number; motionFps?: number; animating?: boolean }): void {
    const cap = capHz ?? this.capHzValue;
    const fps = motionFps ?? this.motionFpsValue;
    StudyRoomRenderScheduler.check(cap, fps);
    if (fps !== this.motionFpsValue) this.renderedMotionFrame = null;
    this.capHzValue = cap;
    this.motionFpsValue = fps;
    if (animating !== undefined && animating !== this.animatingFlag) {
      this.animatingFlag = animating;
      this.renderedMotionFrame = null;
    }
  }

  /** 카메라가 바뀌었다(스크롤·크기·배치). */
  invalidateCamera(): void {
    this.cameraDirtyFlag = true;
  }

  /** 마지막으로 그린 뒤 상한 간격이 지났는지. */
  capAllows(frameTimeMs: number): boolean {
    const last = this.lastRender;
    if (last === null) return true;
    return toMicros(frameTimeMs) - last >= this.minIntervalMicros - StudyRoomRenderScheduler.slackMicros;
  }

  /** Dart: Duration(microseconds: (1e6 / capHz).round()). 양수라 Math.round와 Dart round가 같다. */
  private get minIntervalMicros(): number {
    return Math.round(microsecondsPerSecond / this.capHzValue);
  }

  /** 상한 간격(ms). */
  get minIntervalMs(): number {
    return toMs(this.minIntervalMicros);
  }

  /** 상한 때문에 기다려야 하는 남은 시간(ms). 지금 그려도 되면 0. */
  untilCapAllows(frameTimeMs: number): number {
    const last = this.lastRender;
    if (last === null) return 0;
    const wait = last + this.minIntervalMicros - StudyRoomRenderScheduler.slackMicros - toMicros(frameTimeMs);
    return wait < 0 ? 0 : toMs(wait);
  }

  /** 이 vsync에 그려야 하는지. */
  shouldRender({ frameTimeMs, motionTimeMs }: { frameTimeMs: number; motionTimeMs: number }): boolean {
    return this.needsRender(motionTimeMs) && this.capAllows(frameTimeMs);
  }

  /**
   * motionTime의 동작 장면 번호. 동작을 재생하지 않으면 0(정지 자세).
   * Dart: `inMicroseconds * motionFps ~/ 1e6`(곱이 먼저, ~/는 0 쪽으로 버림).
   */
  motionFrameAt(motionTimeMs: number): number {
    if (!this.animating) return 0;
    return Math.trunc((toMicros(motionTimeMs) * this.motionFpsValue) / microsecondsPerSecond);
  }

  /** 장면 번호 → 동작 초(사람 자세를 계산할 시각). */
  motionSecondsOf(motionFrame: number): number {
    return this.animating ? motionFrame / this.motionFpsValue : 0;
  }

  /** 동작만 재생 중일 때, 다음 장면까지 남은 동작 시간(ms). 동작이 없으면 null. */
  untilNextMotionFrame(motionTimeMs: number): number | null {
    if (!this.animating) return null;
    const next = this.motionFrameAt(motionTimeMs) + 1;
    const due = Math.ceil((next * microsecondsPerSecond) / this.motionFpsValue);
    return toMs(due - toMicros(motionTimeMs));
  }

  /** 그렸다. motionFrame은 이번에 쓴 장면 번호. */
  didRender({ frameTimeMs, motionFrame }: { frameTimeMs: number; motionFrame: number }): void {
    this.lastRender = toMicros(frameTimeMs);
    this.cameraDirtyFlag = false;
    this.renderedMotionFrame = motionFrame;
  }

  private static check(capHz: number, motionFps: number): void {
    if (capHz <= 0) throw new RangeError(`Invalid argument (capHz): must be > 0: ${capHz}`);
    if (motionFps < 0) {
      throw new RangeError(`Invalid argument (motionFps): must be >= 0: ${motionFps}`);
    }
  }
}
