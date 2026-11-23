// 원본: lib/feature/study/room3d/domain/study_room_quality_controller.dart (PocketTime f574f242)

import { StudyRoomQuality } from './quality';
import { StudyRoomQualityGovernor, StudyRoomQualityState } from './qualityGovernor';

/** 기기의 3D 공부방 품질 상태를 읽고 쓰는 곳. */
export interface StudyRoomQualityStore {
  /** 저장된 상태. 없거나 읽을 수 없으면 null(처음 여는 기기). */
  read(): Promise<StudyRoomQualityState | null>;
  write(state: StudyRoomQualityState): Promise<void>;
}

/**
 * Flutter `ChangeNotifier`를 대신하는 작은 리스너 모음. 등록 순서대로 부르고, 같은 함수를 여러
 * 번 넣으면 그만큼 불린다(ChangeNotifier와 같다). 리스너가 던져도 나머지를 마저 부르고, 오류는
 * 다음 마이크로태스크에서 다시 던져 드러낸다(FlutterError.reportError 대신).
 */
export class StudyRoomListenable {
  private listeners: (() => void)[] = [];
  private disposedFlag = false;

  addListener(listener: () => void): void {
    if (this.disposedFlag) return;
    this.listeners.push(listener);
  }

  removeListener(listener: () => void): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) this.listeners.splice(index, 1);
  }

  protected notifyListeners(): void {
    if (this.disposedFlag) return;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  protected get disposed(): boolean {
    return this.disposedFlag;
  }

  dispose(): void {
    this.disposedFlag = true;
    this.listeners = [];
  }
}

/** 프레임 하나의 시간(밀리초). Flutter FrameTiming의 rasterFinish 시각·build·raster 길이에 해당한다. */
export interface StudyRoomFrameTiming {
  /** 단조 증가하는 프레임 끝 시각(ms). */
  readonly atMs: number;
  /** UI(장면 준비) 시간(ms). */
  readonly buildMs: number;
  /** GPU 그리기 시간(ms). */
  readonly rasterMs: number;
}

/**
 * 3D 공부방의 품질 단계를 정하고 기억한다.
 *
 * 방이 보이는 동안 프레임 시간을 StudyRoomQualityGovernor에 넘겨, 기기가 단계의 박자를 못
 * 지키면 한 단계 내리고(가장 낮은 단계에서 멈춘다), 넉넉하면 천천히 올린다. 바뀐 단계는
 * store에 남겨 다음에 방을 열 때 그 단계부터 시작한다.
 *
 * fixed를 주면 단계를 고정하고 프레임을 보지 않는다(개발 측정·테스트).
 *
 * 브라우저에는 Flutter SchedulerBinding.addTimingsCallback이 없으므로, 렌더러가 프레임마다
 * 잰 시간을 onTimings로 넘긴다(보는 중일 때만 받는다: 원본의 콜백 등록·해제와 같다).
 */
export class StudyRoomQualityController extends StudyRoomListenable {
  readonly store: StudyRoomQualityStore | null;
  private readonly fixed: StudyRoomQuality | null;
  private readonly newGovernor: (initial: StudyRoomQualityState) => StudyRoomQualityGovernor;

  /**
   * 방이 다시 보이기 시작한 뒤 프레임을 보지 않는 시간(ms). 로딩·첫 셰이더 준비·화면 전환
   * 프레임으로 단계를 내리지 않게 한다.
   */
  readonly warmUpMs: number;

  /** 원본 debugPrint 자리. 넘기지 않으면 아무것도 남기지 않는다. */
  private readonly log: ((message: string) => void) | null;

  private stateValue: StudyRoomQualityState;
  private governor: StudyRoomQualityGovernor | null = null;
  private loadedFlag: boolean;
  private loading: Promise<void> | null = null;
  private watching = false;
  private watchingSince: number | null = null;
  private debugQualityValue: StudyRoomQuality | null = null;

  constructor({
    store = null,
    fixed = null,
    governor,
    warmUpMs = 2000,
    log = null,
  }: {
    store?: StudyRoomQualityStore | null;
    fixed?: StudyRoomQuality | null;
    governor?: (initial: StudyRoomQualityState) => StudyRoomQualityGovernor;
    warmUpMs?: number;
    log?: ((message: string) => void) | null;
  } = {}) {
    super();
    this.store = store;
    this.fixed = fixed;
    this.newGovernor = governor ?? ((initial) => new StudyRoomQualityGovernor({ initial }));
    this.warmUpMs = warmUpMs;
    this.log = log;
    this.stateValue = new StudyRoomQualityState({ quality: fixed ?? StudyRoomQuality.high });
    this.loadedFlag = fixed !== null || store === null;
  }

  get quality(): StudyRoomQuality {
    return this.debugQualityValue ?? this.stateValue.quality;
  }

  /** 개발 오버레이가 고른 단계. 있으면 측정·자동 조절보다 앞선다(저장하지 않는다). */
  get debugQuality(): StudyRoomQuality | null {
    return this.debugQualityValue;
  }

  /** 개발 오버레이에서 품질 단계를 고정한다. null이면 원래대로. */
  debugOverride(quality: StudyRoomQuality | null): void {
    if (this.debugQualityValue === quality) return;
    this.debugQualityValue = quality;
    this.notifyListeners();
  }

  /** 저장된 상태를 읽었는지(읽기 전에는 quality가 기본값이다). */
  get loaded(): boolean {
    return this.loadedFlag;
  }

  get state(): StudyRoomQualityState {
    return this.stateValue;
  }

  /** 저장된 상태를 읽는다. 여러 번 불러도 한 번만 읽는다. */
  load(): Promise<void> {
    return (this.loading ??= this.doLoad());
  }

  private async doLoad(): Promise<void> {
    const store = this.store;
    if (this.fixed !== null || store === null) return;
    let saved: StudyRoomQualityState | null = null;
    try {
      saved = await store.read();
    } catch (error) {
      this.log?.(`study room quality read failed: ${String(error)}`);
    }
    if (this.disposed) return;
    this.loadedFlag = true;
    if (saved !== null && !saved.equals(this.stateValue)) {
      this.stateValue = saved;
      this.governor = null;
    }
    this.notifyListeners();
  }

  /** 방이 보이는 동안 프레임 시간을 받는다. 고정 단계면 받지 않는다. */
  startWatching(): void {
    if (this.fixed !== null || this.watching || this.disposed) return;
    this.watching = true;
    this.watchingSince = null;
  }

  /** 방이 가려지면(다른 탭·백그라운드·2D) 그만 받는다. 멈춘 동안은 평가하지 않는다. */
  stopWatching(): void {
    if (!this.watching) return;
    this.watching = false;
    this.governor?.pause();
  }

  /** 지금 프레임 시간을 받는 중인지. */
  get isWatching(): boolean {
    return this.watching;
  }

  /** 원본 `_onTimings`(타이밍 콜백). 보는 중일 때만 프레임을 넣는다. */
  onTimings(timings: readonly StudyRoomFrameTiming[]): void {
    if (!this.watching) return;
    for (const timing of timings) {
      this.addFrame(timing);
    }
  }

  /**
   * 프레임 하나를 평가에 넣는다. atMs는 단조 증가하는 프레임 시각이다. 보기 시작한 뒤 첫
   * 프레임부터 warmUpMs 동안은 넣지 않는다(원본은 @visibleForTesting).
   */
  addFrame({ atMs, buildMs, rasterMs }: StudyRoomFrameTiming): void {
    if (this.fixed !== null || this.debugQualityValue !== null || !this.loadedFlag) return;
    const since = (this.watchingSince ??= atMs);
    if (atMs - since < this.warmUpMs) return;
    const governor = (this.governor ??= this.newGovernor(this.stateValue));
    if (!governor.addFrame({ atMs, buildMs, rasterMs })) return;
    this.stateValue = governor.state;
    this.log?.(`study room quality → ${this.stateValue.quality.name}`);
    this.notifyListeners();
    void this.save();
  }

  private async save(): Promise<void> {
    try {
      await this.store?.write(this.stateValue);
    } catch (error) {
      this.log?.(`study room quality write failed: ${String(error)}`);
    }
  }

  override dispose(): void {
    this.stopWatching();
    super.dispose();
  }
}
