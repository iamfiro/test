// 원본: lib/feature/study/room3d/domain/study_room_camera_rig.dart (PocketTime f574f242)

import { MathUtils, Matrix4, Vector3, Vector4 } from 'three';

import type { StudyRoomCamera, StudyRoomOffset, StudyRoomSize } from '../model/scene';

/**
 * vector_math `makeViewMatrix(eye, target, up)`과 같은 뷰 행렬.
 *
 * three의 Matrix4.lookAt은 카메라의 월드 회전(역행렬 쪽)만 만들고 퇴화한 경우 축을 살짝 바꾸므로
 * 쓰지 않고, vector_math와 같은 순서로 직접 계산한다: z = normalize(eye - target),
 * x = normalize(up × z), y = normalize(z × x), 이동 = (-x·eye, -y·eye, -z·eye).
 * vector_math는 column-major `setValues`로 x·y·z를 행에 넣는다. three `Matrix4.set`은 행 순서로
 * 받으므로 아래처럼 행을 적으면 같은 행렬(같은 elements 배열)이 된다.
 */
export function makeViewMatrix(eye: Vector3, target: Vector3, up: Vector3): Matrix4 {
  const z = eye.clone().sub(target).normalize();
  const x = up.clone().cross(z).normalize();
  const y = z.clone().cross(x).normalize();
  const ex = -x.dot(eye);
  const ey = -y.dot(eye);
  const ez = -z.dot(eye);
  return new Matrix4().set(x.x, x.y, x.z, ex, y.x, y.y, y.z, ey, z.x, z.y, z.z, ez, 0, 0, 0, 1);
}

/**
 * StudyRoomCamera를 화면 크기에 맞춘 뷰·투영 행렬로 바꾼다. 렌더러와 무관하다.
 *
 * 클립 공간은 x 오른쪽, y 위, 깊이 0(가까움)~1(멂)이다(Impeller·Vulkan·Metal과 같다).
 * three WebGL 기본(깊이 -1~1)과 깊이 범위만 다르고 x·y는 같다. 같은 행렬로 장면을 그리고 좌석을
 * 화면 좌표로 옮기므로 오버레이가 의자에서 어긋나지 않는다.
 *
 * viewSize는 가로·세로가 0보다 커야 한다(원본은 디버그 assert만 둔다).
 */
export class StudyRoomCameraRig {
  static readonly near = 0.1;
  static readonly far = 100;
  private static readonly orthoDistance = 30;

  /**
   * 가로 화면에서 최소 세로 길이에 곱하는 값. 세로 기준 최소 높이를 그대로 쓰면 넓은 화면
   * 가운데 방이 작게만 보이므로, 가로에서는 더 가까이 당겨 크게 보인다.
   */
  private static readonly landscapeZoom = 0.55;

  constructor(
    readonly camera: StudyRoomCamera,
    readonly viewSize: StudyRoomSize,
  ) {}

  private get aspect(): number {
    return this.viewSize.width / this.viewSize.height;
  }

  /** 초점 평면에서 보이는 세로 길이(m). */
  get visibleHeight(): number {
    return Math.max(
      this.camera.viewWidth / this.aspect,
      this.camera.minViewHeight * (this.aspect > 1 ? StudyRoomCameraRig.landscapeZoom : 1),
    );
  }

  /** 카메라가 바라보는 방향(단위 벡터). */
  get forward(): Vector3 {
    const pitch = MathUtils.degToRad(this.camera.pitchDegrees);
    const yaw = MathUtils.degToRad(this.camera.yawDegrees);
    return new Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ).normalize();
  }

  private get distance(): number {
    switch (this.camera.projection) {
      case 'orthographic':
        return StudyRoomCameraRig.orthoDistance;
      case 'perspective':
        return this.visibleHeight / (2 * Math.tan(MathUtils.degToRad(this.camera.fovYDegrees) / 2));
    }
  }

  /** 카메라 눈 위치(방 공간, 매번 새 벡터). */
  get eye(): Vector3 {
    const d = this.forward.multiplyScalar(this.distance);
    return this.camera.target.clone().sub(d);
  }

  get view(): Matrix4 {
    return makeViewMatrix(this.eye, this.camera.target, new Vector3(0, 1, 0));
  }

  get projection(): Matrix4 {
    switch (this.camera.projection) {
      case 'orthographic':
        return this.orthographic();
      case 'perspective':
        return this.perspective();
    }
  }

  /** projection × view. */
  get viewProjection(): Matrix4 {
    return new Matrix4().multiplyMatrices(this.projection, this.view);
  }

  private perspective(): Matrix4 {
    const near = StudyRoomCameraRig.near;
    const far = StudyRoomCameraRig.far;
    const f = 1 / Math.tan(MathUtils.degToRad(this.camera.fovYDegrees) / 2);
    // 행 순서(setEntry(row, col)와 같은 자리).
    return new Matrix4().set(
      f / this.aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, far / (near - far), (near * far) / (near - far),
      0, 0, -1, 0,
    );
  }

  private orthographic(): Matrix4 {
    const near = StudyRoomCameraRig.near;
    const far = StudyRoomCameraRig.far;
    const halfH = this.visibleHeight / 2;
    const halfW = halfH * this.aspect;
    return new Matrix4().set(
      1 / halfW, 0, 0, 0,
      0, 1 / halfH, 0, 0,
      0, 0, -1 / (far - near), -near / (far - near),
      0, 0, 0, 1,
    );
  }

  /** 방 공간의 점을 화면 좌표(논리 픽셀, 왼쪽 위 원점)로 옮긴다. 카메라 뒤면 null. */
  project(point: Vector3): StudyRoomOffset | null {
    const clip = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(this.viewProjection);
    if (clip.w <= 0) return null;
    const x = clip.x / clip.w;
    const y = clip.y / clip.w;
    return {
      x: (x * 0.5 + 0.5) * this.viewSize.width,
      y: (0.5 - y * 0.5) * this.viewSize.height,
    };
  }
}
