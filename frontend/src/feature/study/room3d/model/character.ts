// 원본: lib/feature/study/room3d/model/study_room_character.dart (PocketTime f574f242)

import { at, dartMod, dartTruncDiv } from '../domain/dartMath';
import type { StudyRoomMood } from '../domain/motion';
import { colorEquals, type StudyRoomColor } from './color';

/** 3D 의자에 앉히는 사람 모델(캐릭터 GLB의 `char_<name>_rig`). */
export const studyRoomFigureValues = ['boy', 'girl'] as const;
export type StudyRoomFigure = (typeof studyRoomFigureValues)[number];

/**
 * 사용자 ID → 사람마다 고정된 값(FNV-1a 32비트, 0 이상 2^32 미만). 실행마다 같다.
 *
 * Dart는 `(hash * 0x01000193) & 0xffffffff`를 64비트 정수로 계산한다(hash < 2^32라 곱이 2^56
 * 아래로 넘치지 않는다). JS 실수 곱은 2^53을 넘어 아래 비트를 잃으므로 Math.imul로 곱의 아래
 * 32비트를 얻고 `>>> 0`으로 부호 없는 값으로 바꿔 Dart와 같은 값을 낸다. `^`도 JS에선 int32가
 * 되므로 `>>> 0`으로 되돌린다. 문자 단위는 Dart `codeUnits`와 같은 UTF-16 코드 단위다.
 */
export function studyRoomCharacterSeed(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash ^ userId.charCodeAt(i)) >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * 3D 의자에 앉힐 사람 한 명의 모습. 프로필 캐릭터의 부위 값(서버 wire 문자열)과 프로필 색, 사람마다
 * 고정된 값(seed), 하는 동작을 렌더러와 무관하게 담는다.
 *
 * 렌더러는 figure(남자·여자 사람 모델)를 앉힌다. 프로필 차림 성별을 골랐으면 그 모델, 아니면
 * seed로 고른다. 얼굴·옷은 모델에 그려져 있어 프로필 부위·색은 3D에 쓰지 않는다.
 */
export class StudyRoomCharacter {
  readonly shape: string;
  readonly eyes: string;
  readonly mouth: string;
  /** 꾸미기. `none`이면 아무것도 달지 않는다. */
  readonly accessory: string;
  /** 프로필 기본색. 3D에서는 상의 색이다. */
  readonly color: StudyRoomColor;
  /** 사람마다 고정된 값(사용자 ID 해시, studyRoomCharacterSeed). 사람 모델을 고른다. */
  readonly seed: number;
  /** 공부 중인지 쉬는 중인지. 자리 종류(책상·소파)와 함께 하는 일을 정한다(StudyRoomRoutine). */
  readonly mood: StudyRoomMood;
  /** 프로필 차림 성별로 정한 모델. 고르지 않았으면 null. */
  private readonly chosenFigure: StudyRoomFigure | null;

  /**
   * 의자 방석 윗면에서 머리 꼭대기까지 높이(m)보다 조금 위. 이름·시간 칩을 이 위에 띄운다.
   * `tool/blender/study_room/build_figures.py`의 앉은 높이와 맞춘다(머리카락 끝 ≈ 0.8m).
   */
  static readonly headTopMeters = 0.84;

  constructor({
    shape,
    eyes,
    mouth,
    accessory,
    color,
    seed = 0,
    mood = 'focusing',
    figure = null,
  }: {
    shape: string;
    eyes: string;
    mouth: string;
    accessory: string;
    color: StudyRoomColor;
    seed?: number;
    mood?: StudyRoomMood;
    figure?: StudyRoomFigure | null;
  }) {
    this.shape = shape;
    this.eyes = eyes;
    this.mouth = mouth;
    this.accessory = accessory;
    this.color = color;
    this.seed = seed;
    this.mood = mood;
    this.chosenFigure = figure;
  }

  /**
   * 앉힐 사람 모델. 차림 성별을 골랐으면 그것, 아니면 seed로 고른다(같은 사람은 늘 같은 모델).
   * Dart `(seed ~/ 31) % 2`: `~/`는 0 쪽으로 버리고 `%`는 늘 0 이상이라 dartTruncDiv·dartMod로 낸다.
   */
  get figure(): StudyRoomFigure {
    return (
      this.chosenFigure ??
      at(studyRoomFigureValues, dartMod(dartTruncDiv(this.seed, 31), studyRoomFigureValues.length))
    );
  }

  equals(other: StudyRoomCharacter): boolean {
    return (
      other.shape === this.shape &&
      other.eyes === this.eyes &&
      other.mouth === this.mouth &&
      other.accessory === this.accessory &&
      colorEquals(other.color, this.color) &&
      other.seed === this.seed &&
      other.mood === this.mood &&
      other.chosenFigure === this.chosenFigure
    );
  }
}
