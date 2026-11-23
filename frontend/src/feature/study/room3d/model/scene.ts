// 원본: lib/feature/study/room3d/model/study_room_3d_scene.dart (PocketTime f574f242)

import { Vector3 } from 'three';

import type { StudyRoomInterior } from '../domain/director';
import type { StudyRoomSeatKind } from '../domain/motion';
import { colorEquals, colorFromArgb, type StudyRoomColor } from './color';

export type { StudyRoomSeatKind } from '../domain/motion';

/** 카메라 투영 방식. */
export type StudyRoomProjection = 'orthographic' | 'perspective';

/** 화면 크기(논리 픽셀). Flutter `Size` 대신. */
export interface StudyRoomSize {
  readonly width: number;
  readonly height: number;
}

/** 화면 좌표(논리 픽셀, 왼쪽 위 원점). Flutter `Offset` 대신. */
export interface StudyRoomOffset {
  readonly x: number;
  readonly y: number;
}

/**
 * 위에서 비스듬히 내려다보는 카메라 설정. 좌표는 glTF 방 공간(m): +X 오른쪽(동), +Y 위,
 * +Z 방 앞쪽(남, 카메라 쪽).
 *
 * 화면 폭에 viewWidth m(초점 target을 지나는 평면 기준)가 꼭 맞게 잡고, 그렇게 잡은 세로가
 * minViewHeight보다 짧으면(가로로 넓은 화면) 세로를 기준으로 넓힌다.
 *
 * target은 생성 때 복사해 둔다. 바꾸지 말 것(Dart에서는 불변 값으로 쓴다).
 */
export class StudyRoomCamera {
  readonly projection: StudyRoomProjection;
  /** 수평선 아래로 내려다보는 각도(90이면 바로 위). */
  readonly pitchDegrees: number;
  /** 좌우로 돌린 각도. 0이면 방 북쪽(-Z)을 본다. */
  readonly yawDegrees: number;
  /** 원근일 때 세로 화각. */
  readonly fovYDegrees: number;
  readonly target: Vector3;
  readonly viewWidth: number;
  readonly minViewHeight: number;

  constructor({
    projection,
    pitchDegrees,
    target,
    viewWidth,
    minViewHeight,
    fovYDegrees = 40,
    yawDegrees = 0,
  }: {
    projection: StudyRoomProjection;
    pitchDegrees: number;
    target: Vector3;
    viewWidth: number;
    minViewHeight: number;
    fovYDegrees?: number;
    yawDegrees?: number;
  }) {
    this.projection = projection;
    this.pitchDegrees = pitchDegrees;
    this.yawDegrees = yawDegrees;
    this.fovYDegrees = fovYDegrees;
    this.target = target.clone();
    this.viewWidth = viewWidth;
    this.minViewHeight = minViewHeight;
  }

  /** 원본과 같이 fovYDegrees는 바꿀 수 없다(그대로 옮긴다). */
  copyWith({
    projection,
    pitchDegrees,
    yawDegrees,
    target,
    viewWidth,
    minViewHeight,
  }: {
    projection?: StudyRoomProjection;
    pitchDegrees?: number;
    yawDegrees?: number;
    target?: Vector3;
    viewWidth?: number;
    minViewHeight?: number;
  }): StudyRoomCamera {
    return new StudyRoomCamera({
      projection: projection ?? this.projection,
      pitchDegrees: pitchDegrees ?? this.pitchDegrees,
      yawDegrees: yawDegrees ?? this.yawDegrees,
      target: target ?? this.target,
      viewWidth: viewWidth ?? this.viewWidth,
      minViewHeight: minViewHeight ?? this.minViewHeight,
      fovYDegrees: this.fovYDegrees,
    });
  }

  equals(other: StudyRoomCamera): boolean {
    return (
      other.projection === this.projection &&
      other.pitchDegrees === this.pitchDegrees &&
      other.yawDegrees === this.yawDegrees &&
      other.fovYDegrees === this.fovYDegrees &&
      other.target.equals(this.target) &&
      other.viewWidth === this.viewWidth &&
      other.minViewHeight === this.minViewHeight
    );
  }
}

export interface StudyRoomLookOptions {
  fogColor?: StudyRoomColor;
  fogAmount?: number;
  fogStart?: number;
  fogEnd?: number;
  colorLevels?: number;
  dither?: number;
  brightness?: number;
  pixelated?: boolean;
  tint?: StudyRoomColor;
  saturation?: number;
  contrast?: number;
  outdoorLight?: StudyRoomColor;
}

/**
 * 화면 질감. 렌더러가 해석한다.
 *
 * 거리 안개·색 단계·디더(옛 게임기 질감)는 0·256·0이면 꺼진다. pixelated면 낮은 해상도로 그려
 * 최근접으로 키우고 텍스처도 최근접으로 읽는다. 아니면 기기 해상도 가까이 그리고 텍스처를
 * 부드럽게(선형) 읽는다. 조명은 텍스처에 구워져 있어 여기서 다루지 않는다.
 */
export class StudyRoomLook {
  /** 창밖(바깥 숲·잔디)에만 더 곱할 빛. 밤에는 남색으로 바깥만 어둡게 한다. 흰색이면 방과 같다. */
  readonly outdoorLight: StudyRoomColor;
  /** 대비(1이면 그대로). */
  readonly contrast: number;
  /** 안개 색과, 가장 짙을 때 섞는 비율(0–1). */
  readonly fogColor: StudyRoomColor;
  readonly fogAmount: number;
  /** 안개가 시작하는 거리·가장 짙어지는 거리(m, 카메라 → 초점 거리 기준 상대값). */
  readonly fogStart: number;
  readonly fogEnd: number;
  /** 채널당 색 단계 수. 낮을수록 밴딩이 굵다. */
  readonly colorLevels: number;
  /** 디더 세기(0이면 끔, 1이면 4×4 Bayer 디더). */
  readonly dither: number;
  /** 텍스처에 곱할 밝기. */
  readonly brightness: number;
  /** 낮은 해상도 + 최근접(픽셀이 보이는 질감)으로 그릴지. */
  readonly pixelated: boolean;
  /** 텍스처에 곱할 빛 색(흰색이면 그대로). 노을·밤 같은 분위기를 낸다. */
  readonly tint: StudyRoomColor;
  /** 채도(1이면 그대로, 0이면 흑백, 1보다 크면 더 진하게). */
  readonly saturation: number;

  constructor({
    fogColor = colorFromArgb(0xff3b2b1f),
    fogAmount = 0,
    fogStart = -1.5,
    fogEnd = 4.0,
    colorLevels = 256,
    dither = 0,
    brightness = 1.0,
    pixelated = false,
    tint = colorFromArgb(0xffffffff),
    saturation = 1.0,
    contrast = 1.0,
    outdoorLight = colorFromArgb(0xffffffff),
  }: StudyRoomLookOptions = {}) {
    this.fogColor = fogColor;
    this.fogAmount = fogAmount;
    this.fogStart = fogStart;
    this.fogEnd = fogEnd;
    this.colorLevels = colorLevels;
    this.dither = dither;
    this.brightness = brightness;
    this.pixelated = pixelated;
    this.tint = tint;
    this.saturation = saturation;
    this.contrast = contrast;
    this.outdoorLight = outdoorLight;
  }

  copyWith(o: StudyRoomLookOptions): StudyRoomLook {
    return new StudyRoomLook({
      fogColor: o.fogColor ?? this.fogColor,
      fogAmount: o.fogAmount ?? this.fogAmount,
      fogStart: o.fogStart ?? this.fogStart,
      fogEnd: o.fogEnd ?? this.fogEnd,
      colorLevels: o.colorLevels ?? this.colorLevels,
      dither: o.dither ?? this.dither,
      brightness: o.brightness ?? this.brightness,
      pixelated: o.pixelated ?? this.pixelated,
      tint: o.tint ?? this.tint,
      saturation: o.saturation ?? this.saturation,
      contrast: o.contrast ?? this.contrast,
      outdoorLight: o.outdoorLight ?? this.outdoorLight,
    });
  }

  equals(other: StudyRoomLook): boolean {
    return (
      colorEquals(other.fogColor, this.fogColor) &&
      other.fogAmount === this.fogAmount &&
      other.fogStart === this.fogStart &&
      other.fogEnd === this.fogEnd &&
      other.colorLevels === this.colorLevels &&
      other.dither === this.dither &&
      other.brightness === this.brightness &&
      other.pixelated === this.pixelated &&
      colorEquals(other.tint, this.tint) &&
      other.saturation === this.saturation &&
      other.contrast === this.contrast &&
      colorEquals(other.outdoorLight, this.outdoorLight)
    );
  }
}

/**
 * 맵의 자리 하나: 사람이 앉는 방석 윗면 가운데(anchor)와 앉은 사람이 보는 방향.
 * 방 GLB의 `seat_NN` 노드와 1:1이다(위치 = 노드 위치, yaw = 노드의 Y축 회전).
 */
export class StudyRoomSeat {
  /**
   * @param yaw 보는 방향을 +Z에서 +X 쪽으로 돌린 각도(라디안). 보는 방향 = (sin, 0, cos).
   * @param kind 책상 앞 의자인지 소파·안락의자인지. 앉은 사람이 하는 일이 달라진다.
   */
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly yaw: number,
    readonly kind: StudyRoomSeatKind = 'desk',
  ) {}

  /** 방석 윗면 가운데(매번 새 벡터). */
  get anchor(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /** 앉은 사람이 보는 방향(바닥 평면 단위 벡터, 매번 새 벡터). */
  get facing(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
}

/**
 * 3D 공부방 장면(에셋·자리·카메라·질감)을 렌더러와 무관하게 설명한다.
 *
 * 방은 한 덩어리 맵이다. 앉을 수 있는 사람 수는 맵의 자리 수(seats)로 정해지고, 그보다 많은
 * 사람은 3D 방에 앉히지 않는다. 에셋은 조명을 구워 넣은 언릿(KHR_materials_unlit) GLB를
 * 전제로 한다. 앱은 실시간 조명·그림자를 계산하지 않고 텍스처만 그린다.
 */
export class StudyRoom3dScene {
  /** 카메라가 들어갈 수 있는 방 안. 없으면 내 자리 둘레 시점만 쓴다. */
  readonly interior: StudyRoomInterior | null;
  /** 방 `.glb` 에셋 경로(원본 Flutter 에셋 경로 그대로; 웹은 public/ 기준으로 같은 경로에 있다). */
  readonly asset: string;
  /** 사람 부품 `.glb`. 없으면 사람을 3D로 앉히지 않는다. */
  readonly characterAsset: string | null;
  /** 사람이 쓰는 물건 `.glb`. 없으면 연필만 쓴다. */
  readonly propAsset: string | null;
  /** 방 바깥 풍경 `.glb`. 없으면 방 GLB의 바깥만 그린다. */
  readonly sceneryAsset: string | null;
  /** 자리. 앞에서부터 채운다(0번이 내 자리). */
  readonly seats: readonly StudyRoomSeat[];
  /** 자리가 없을 때 쓰는 카메라. 평소에는 내 자리 둘레 시점(StudyRoomSeatCamera)으로 본다. */
  readonly camera: StudyRoomCamera;
  /** 장면 뒤(방 밖) 바탕색. */
  readonly backdrop: StudyRoomColor;
  /** 화면 질감. */
  readonly look: StudyRoomLook;

  constructor({
    asset,
    seats,
    camera,
    backdrop,
    characterAsset = null,
    propAsset = null,
    sceneryAsset = null,
    look = new StudyRoomLook(),
    interior = null,
  }: {
    asset: string;
    seats: readonly StudyRoomSeat[];
    camera: StudyRoomCamera;
    backdrop: StudyRoomColor;
    characterAsset?: string | null;
    propAsset?: string | null;
    sceneryAsset?: string | null;
    look?: StudyRoomLook;
    interior?: StudyRoomInterior | null;
  }) {
    this.asset = asset;
    this.seats = seats;
    this.camera = camera;
    this.backdrop = backdrop;
    this.characterAsset = characterAsset;
    this.propAsset = propAsset;
    this.sceneryAsset = sceneryAsset;
    this.look = look;
    this.interior = interior;
  }

  /** 맵 최대 인원. */
  get capacity(): number {
    return this.seats.length;
  }

  /** 질감만 바꾼 장면(개발 오버레이). */
  withLook(look: StudyRoomLook): StudyRoom3dScene {
    return new StudyRoom3dScene({
      asset: this.asset,
      seats: this.seats,
      camera: this.camera,
      backdrop: this.backdrop,
      characterAsset: this.characterAsset,
      propAsset: this.propAsset,
      sceneryAsset: this.sceneryAsset,
      look,
      interior: this.interior,
    });
  }
}
