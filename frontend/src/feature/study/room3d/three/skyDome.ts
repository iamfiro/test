// 월드에 고정된 하늘(사용자 버그 신고 2026-11-23: 달이 마우스 따라 크게 움직임). 예전에는 하늘을 화면 한 장으로
// 그려서 카메라를 돌려도 달이 화면에 붙어 있었다. 이제 카메라를 따라다니는 큰 구에 그려, 달·해·별이 방(창문)과
// 함께 움직인다. 깊이를 쓰지 않아(깊이 1 유지) 외곽선·심도의 "하늘" 판정은 그대로다.
import * as THREE from 'three'
import type { StudyRoomDaylight } from '../domain/daylight'
import { colorToHex } from '../model/color'

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // 가장 먼 깊이
}
`

const fragment = /* glsl */ `
uniform vec3 top;
uniform vec3 bottom;
uniform float stars;
uniform float sunUp;
uniform vec3 body;     // 해·달 방향(월드)
uniform float size;    // 각반지름(rad)
varying vec3 vDir;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main() {
  vec3 d = normalize(vDir);
  vec3 color = mix(bottom, top, smoothstep(-0.05, 0.75, d.y));
  if (stars > 0.01 && d.y > 0.0) {
    vec3 cell = floor(d * 70.0);
    float h = hash(cell);
    vec3 center = (cell + 0.5) / 70.0;
    float star = step(0.93, h) * smoothstep(0.006, 0.0, distance(d, normalize(center)) - h * 0.002);
    // 별은 은은하게(밝은 값은 빛 번짐·심도 흐림에 번져 큼직한 덩어리가 된다). 별마다 밝기를 다르게.
    color += vec3(star) * stars * (0.18 + 0.22 * fract(h * 17.0));
  }
  float c = dot(d, body);
  if (c > 0.0) {
    // 접평면 좌표(모양을 일그러뜨리지 않고 원·초승달을 그린다).
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), body));
    vec3 up = cross(body, right);
    vec2 p = vec2(dot(d, right), dot(d, up)) / c;
    float r = tan(size);
    float dist = length(p);
    if (sunUp > 0.5) {
      float glow = smoothstep(r * 3.2, 0.0, dist);
      color = mix(color, vec3(1.0, 0.953, 0.769), glow * 0.55);
      color = mix(color, vec3(1.0, 0.965, 0.847), smoothstep(r, r * 0.92, dist));
    } else {
      float glow = smoothstep(r * 2.6, 0.0, dist);
      color = mix(color, vec3(0.9, 0.925, 1.0), glow * 0.35);
      // 초승달: 둥근 달에서 조금 비켜 놓은 원을 덜어 낸다.
      float disc = smoothstep(r, r * 0.94, dist);
      float cut = smoothstep(r * 0.9, r * 0.96, length(p - vec2(r * 0.45, r * 0.2)));
      color = mix(color, vec3(0.957, 0.945, 0.855), disc * cut);
    }
  }
  gl_FragColor = vec4(color, 1.0);
}
`

const raw = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return new THREE.Color().setRGB(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, THREE.LinearSRGBColorSpace)
}

export class SkyDome {
  readonly mesh: THREE.Mesh
  private readonly material: THREE.ShaderMaterial

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        top: { value: new THREE.Color() },
        bottom: { value: new THREE.Color() },
        stars: { value: 0 },
        sunUp: { value: 0 },
        body: { value: new THREE.Vector3(0, 0.3, 1).normalize() },
        size: { value: 0.1 },
      },
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.material)
    this.mesh.name = 'sky-dome'
    this.mesh.renderOrder = -1000
    this.mesh.frustumCulled = false
  }

  /** windowYaw: 창문이 있는 쪽(앉은 사람이 보는 방향, rad). 해·달은 그 앞쪽 하늘을 가로지른다. */
  setDaylight(d: StudyRoomDaylight, windowYaw: number) {
    const u = this.material.uniforms
    ;(u.top!.value as THREE.Color).copy(raw(colorToHex(d.skyTop)))
    ;(u.bottom!.value as THREE.Color).copy(raw(colorToHex(d.skyBottom)))
    u.stars!.value = d.stars
    u.sunUp!.value = d.sunUp ? 1 : 0
    // 아침엔 왼쪽, 저녁엔 오른쪽(창을 마주 보고 선 사람 기준). 높이는 낮 해는 낮게 시작해 한낮에 높이.
    const az = windowYaw + (0.5 - d.arc) * 1.9
    const el = d.sunUp ? 0.18 + 0.75 * d.sunHeight : 0.22
    u.body!.value = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize()
    u.size!.value = d.sunUp ? 0.07 : 0.05
  }

  /** 매 장면마다 카메라 위치로 옮겨 하늘이 늘 멀리 있게 한다(방향만 의미 있다). */
  follow(camera: THREE.Camera) {
    this.mesh.position.copy(camera.position)
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
