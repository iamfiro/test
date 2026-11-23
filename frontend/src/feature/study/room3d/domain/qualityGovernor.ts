// 원본: lib/feature/study/room3d/domain/study_room_quality_governor.dart (PocketTime f574f242)

import { at, dartClamp, dartCompare } from './dartMath';
import { StudyRoomQuality } from './quality';

/** 기기에 저장해 두는 품질 상태. 다음에 방을 열 때 이 단계부터 시작한다. */
export class StudyRoomQualityState {
  readonly quality: StudyRoomQuality;

  /**
   * 단계별로 기준을 넘어 내려온 횟수. StudyRoomQualityGovernor.lockStrikes번이면 그 단계로는
   * 다시 올라가지 않는다.
   */
  readonly strikes: ReadonlyMap<StudyRoomQuality, number>;

  constructor({
    quality = StudyRoomQuality.high,
    strikes = new Map(),
  }: { quality?: StudyRoomQuality; strikes?: ReadonlyMap<StudyRoomQuality, number> } = {}) {
    this.quality = quality;
    this.strikes = strikes;
  }

  /** Dart `==`(단계 같음 + strikes mapEquals). */
  equals(other: StudyRoomQualityState): boolean {
    if (other.quality !== this.quality) return false;
    if (other.strikes.size !== this.strikes.size) return false;
    for (const [key, value] of this.strikes) {
      if (!other.strikes.has(key) || other.strikes.get(key) !== value) return false;
    }
    return true;
  }
}

/**
 * 프레임 시간을 보고 품질 단계를 정한다. 엔진·위젯과 무관한 순수 계산이다.
 *
 * 3D 방이 보이는 동안의 프레임(addFrame)을 모아 evaluateEveryMs마다 최근 window개의 p90을 본다.
 * 기준은 지금 단계의 프레임 예산(frameBudgetMs, 30Hz면 33ms)에 비례한다.
 * - 내림: build 또는 raster p90이 예산의 limitRatio를 넘으면 바로 한 단계 내린다. 바꾼 뒤
 *   cooldownMs 동안은 다시 보지 않는다. 가장 낮은 단계에서는 더 내리지 않는다.
 * - 올림(보수적): upgradeAfterMs 동안 매번 build·raster p90이 위 단계 예산의 comfortRatio
 *   안이었고, 위 단계가 이 기기에서 lockStrikes번 넘은 적이 없을 때만 한 단계 올린다.
 *
 * 시각·길이는 모두 밀리초(Dart Duration 대신).
 */
export class StudyRoomQualityGovernor {
  readonly window: number;
  readonly minFrames: number;
  readonly evaluateEveryMs: number;
  readonly cooldownMs: number;
  readonly upgradeAfterMs: number;
  readonly limitRatio: number;
  readonly comfortRatio: number;
  readonly lockStrikes: number;

  private stateValue: StudyRoomQualityState;
  private readonly build: number[] = [];
  private readonly raster: number[] = [];
  private lastEvaluation: number | null = null;
  private lastChange: number | null = null;
  private comfortSince: number | null = null;

  constructor({
    initial = new StudyRoomQualityState(),
    window = 90,
    minFrames = 45,
    evaluateEveryMs = 2000,
    cooldownMs = 3000,
    upgradeAfterMs = 60000,
    limitRatio = 0.85,
    comfortRatio = 0.5,
    lockStrikes = 2,
  }: {
    initial?: StudyRoomQualityState;
    window?: number;
    minFrames?: number;
    evaluateEveryMs?: number;
    cooldownMs?: number;
    upgradeAfterMs?: number;
    limitRatio?: number;
    comfortRatio?: number;
    lockStrikes?: number;
  } = {}) {
    this.stateValue = initial;
    this.window = window;
    this.minFrames = minFrames;
    this.evaluateEveryMs = evaluateEveryMs;
    this.cooldownMs = cooldownMs;
    this.upgradeAfterMs = upgradeAfterMs;
    this.limitRatio = limitRatio;
    this.comfortRatio = comfortRatio;
    this.lockStrikes = lockStrikes;
  }

  get state(): StudyRoomQualityState {
    return this.stateValue;
  }

  /** 프레임 하나. atMs는 단조 증가하는 시각(프레임 끝 시각 등). 상태가 바뀌면 true. */
  addFrame({ atMs, buildMs, rasterMs }: { atMs: number; buildMs: number; rasterMs: number }): boolean {
    this.build.push(buildMs);
    this.raster.push(rasterMs);
    if (this.build.length > this.window) {
      this.build.splice(0, this.build.length - this.window);
      this.raster.splice(0, this.raster.length - this.window);
    }
    const lastChange = this.lastChange;
    if (lastChange !== null && atMs - lastChange < this.cooldownMs) return false;
    const lastEvaluation = this.lastEvaluation;
    if (lastEvaluation !== null && atMs - lastEvaluation < this.evaluateEveryMs) {
      return false;
    }
    if (this.build.length < this.minFrames) return false;
    this.lastEvaluation = atMs;
    return this.evaluate(atMs);
  }

  /** 3D가 멈춰 있던 동안(다른 탭·백그라운드)의 공백을 평가에 넣지 않는다. */
  pause(): void {
    this.build.length = 0;
    this.raster.length = 0;
    this.lastEvaluation = null;
    this.comfortSince = null;
  }

  private evaluate(atMs: number): boolean {
    const raster = p90(this.raster);
    const build = p90(this.build);
    const limit = this.stateValue.quality.frameBudgetMs * this.limitRatio;
    if (raster > limit || build > limit) {
      this.comfortSince = null;
      return this.downgrade(atMs);
    }
    const higher = this.stateValue.quality.higher;
    const comfort = higher === null ? 0 : higher.frameBudgetMs * this.comfortRatio;
    if (higher !== null && raster <= comfort && build <= comfort) {
      const since = (this.comfortSince ??= atMs);
      if (atMs - since >= this.upgradeAfterMs) return this.upgrade(atMs);
    } else {
      this.comfortSince = null;
    }
    return false;
  }

  private downgrade(atMs: number): boolean {
    const current = this.stateValue.quality;
    const lower = current.lower;
    if (lower === null) return false;
    const strikes = new Map(this.stateValue.strikes);
    strikes.set(current, (this.stateValue.strikes.get(current) ?? 0) + 1);
    this.stateValue = new StudyRoomQualityState({ quality: lower, strikes });
    this.changed(atMs);
    return true;
  }

  private upgrade(atMs: number): boolean {
    const higher = this.stateValue.quality.higher;
    if (higher === null || (this.stateValue.strikes.get(higher) ?? 0) >= this.lockStrikes) {
      return false;
    }
    this.stateValue = new StudyRoomQualityState({ quality: higher, strikes: this.stateValue.strikes });
    this.changed(atMs);
    return true;
  }

  private changed(atMs: number): void {
    this.lastChange = atMs;
    this.comfortSince = null;
    this.build.length = 0;
    this.raster.length = 0;
  }
}

/** p90: Dart `List<double>.sort()`(compareTo 순서)로 정렬한 뒤 ceil(0.9·n)번째. */
function p90(values: readonly number[]): number {
  const sorted = [...values].sort(dartCompare);
  const rank = dartClamp(Math.ceil(0.9 * sorted.length), 1, sorted.length);
  return at(sorted, Math.max(0, rank - 1));
}
