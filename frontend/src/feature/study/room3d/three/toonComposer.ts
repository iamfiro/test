// StudyVillage 카툰·감성 룩(원본 앱에 없음, docs/design-parity/exceptions.md).
// 순서: 장면(MSAA 4) → 법선·깊이 → 외곽선 → FXAA → 밝은 곳 뽑기(½) → 흐리기(½) →
// 얕은 심도 + 빛 번짐 + 색 보정·비네트·그레인 → 화면. 하늘은 장면 배경으로 함께 그려 같은 보정을 받는다.
import * as THREE from 'three'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

const vertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const outlineFragment = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float lineWidth;
uniform vec4 outline;
uniform float tintedLine; // 1이면 선 색을 그 자리 색을 어둡게 한 색으로(부드러운 룩)
varying vec2 vUv;

float viewZ(vec2 uv) { return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

void main() {
  vec4 color = texture2D(tColor, vUv);
  vec2 o = texel * lineWidth;
  float zc = viewZ(vUv);
  // 배경(하늘)은 깊이를 쓰지 않는다: 법선 선은 물체 위에서만.
  float solid = step(texture2D(tDepth, vUv).x, 0.99999);
  vec3 nc = normalAt(vUv);
  float depthEdge = 0.0;
  float normalEdge = 0.0;
  vec2 offsets[4] = vec2[4](vec2(o.x, 0.0), vec2(-o.x, 0.0), vec2(0.0, o.y), vec2(0.0, -o.y));
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + offsets[i];
    float rel = (viewZ(uv) - zc) / max(-zc, 0.001);
    // 가까운 쪽 면에만 선을 둬 두 겹이 되지 않게 한다.
    depthEdge = max(depthEdge, smoothstep(0.04, 0.1, -rel));
    normalEdge = max(normalEdge, smoothstep(0.6, 0.9, 1.0 - dot(nc, normalAt(uv))));
  }
  // 멀수록 선을 옅게. 가까운 3m 안은 또렷하다.
  float fade = 1.0 - smoothstep(3.0, 11.0, -zc);
  float edge = max(depthEdge * solid, normalEdge * 0.75 * solid) * outline.a * mix(0.35, 1.0, fade);
  vec3 lineColor = mix(outline.rgb, color.rgb * vec3(0.5, 0.46, 0.56), tintedLine);
  gl_FragColor = vec4(mix(color.rgb, lineColor, edge), 1.0);
}
`

// 접촉 그늘(화면 공간 AO, ½ 해상도 8탭): 물건이 닿는 곳·구석을 살짝 어둡게 해 부피를 준다.
const aoFragment = /* glsl */ `
#include <packing>
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform vec2 projScale; // 투영 행렬 [0][0], [1][1]
uniform float radius;   // m
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  float z = perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
  return vec3((uv * 2.0 - 1.0) * -z / projScale, z);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  if (texture2D(tDepth, vUv).x >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv);
  vec3 n = normalize(texture2D(tNormal, vUv).xyz * 2.0 - 1.0);
  // 화면에서 radius(m)가 차지하는 반지름.
  vec2 r = radius * projScale / max(-p.z, 0.3) * 0.5;
  float a0 = hash(gl_FragCoord.xy) * 6.2831;
  float occ = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = a0 + float(i) * 2.3999;
    float d = (float(i) + 0.5) / 8.0;
    vec3 s = viewPos(vUv + vec2(cos(a), sin(a)) * r * d);
    vec3 v = s - p;
    float dist2 = dot(v, v);
    occ += max(0.0, dot(n, v) / sqrt(dist2 + 1e-4) - 0.08) * (1.0 / (1.0 + dist2 / (radius * radius)));
  }
  float ao = clamp(1.0 - occ / 8.0 * 2.6, 0.0, 1.0);
  gl_FragColor = vec4(vec3(ao), 1.0);
}
`

// 빛줄기 재료: 창밖 하늘(깊이 없음) 중 밝은 곳만.
const skyMaskFragment = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
varying vec2 vUv;
void main() {
  float sky = step(0.99999, texture2D(tDepth, vUv).x);
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * sky * smoothstep(0.35, 0.95, l), 1.0);
}
`

// 빛줄기(GPU Gems 3 방식): 해 쪽으로 걸어가며 하늘빛을 모아 창에서 방 안으로 뻗는 결을 만든다.
const raysFragment = /* glsl */ `
uniform sampler2D tMask;
uniform vec2 sun;     // 화면 uv(화면 밖일 수 있다)
uniform float decay;
varying vec2 vUv;
void main() {
  vec2 delta = (vUv - sun) / 40.0;
  vec2 uv = vUv;
  float w = 1.0;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 40; i++) {
    uv -= delta;
    sum += texture2D(tMask, clamp(uv, 0.0, 1.0)).rgb * w;
    w *= decay;
  }
  gl_FragColor = vec4(sum / 14.0, 1.0);
}
`

const brightFragment = /* glsl */ `
uniform sampler2D tColor;
uniform float threshold;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor = vec4(c * smoothstep(threshold, 1.0, l), 1.0);
}
`

const blurFragment = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 step;
varying vec2 vUv;
void main() {
  // 9탭 가우시안(분리형).
  vec3 c = texture2D(tColor, vUv).rgb * 0.2270270270;
  c += texture2D(tColor, vUv + step * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tColor, vUv - step * 1.3846153846).rgb * 0.3162162162;
  c += texture2D(tColor, vUv + step * 3.2307692308).rgb * 0.0702702703;
  c += texture2D(tColor, vUv - step * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}
`

const finalFragment = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tBloom;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float focus;      // 초점 거리(m): 카메라 → 내 자리
uniform float focusBand;  // 이 안은 또렷하다(m)
uniform float blurRange;  // 이만큼 벗어나면 가장 흐리다(m)
uniform float maxBlur;    // 가장 흐릴 때 반지름(px)
uniform float bloom;      // 빛 번짐 세기
uniform float grain;      // 그레인 세기
uniform float vignette;   // 비네트 세기
uniform vec3 lift;        // 그림자를 들어 올릴 색(우윳빛)
uniform float liftAmount;
uniform vec3 warm;        // 전체에 곱할 색(중성에 가깝게)
uniform float deOrange;   // 주황 계열을 옅은 살구·베이지로 옮기는 정도(0–1)
uniform float exposure;   // 전체 밝기(하이키)
uniform float highlightLift; // 밝은 곳을 흰색 쪽으로 들어 올리는 정도
uniform float style;      // 0 예전 카툰 보정, 1 부드러운 파스텔 보정
uniform sampler2D tAo;
uniform float aoAmount;   // 0이면 접촉 그늘 없음
uniform vec3 aoColor;     // 그늘 색(라벤더 갈색)
uniform float vibrance;
uniform vec3 shadowTone;
uniform vec3 highlightTone;
uniform sampler2D tRays;
uniform float rays;       // 빛줄기 세기(0이면 없음)
uniform vec3 raysTint;
uniform vec3 bloomTint;   // 번짐 빛 색(할레이션)
uniform float haze;       // 먼 곳 공기 원근 세기
uniform vec3 hazeTop;
uniform vec3 hazeBottom;
uniform float leak;       // 빛샘 세기
uniform vec2 leakAt;      // 빛샘이 시작하는 모서리(uv)
varying vec2 vUv;

float viewDistance(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
float coc(float d) { return smoothstep(focusBand, focusBand + blurRange, abs(d - focus)); }

const vec2 disk[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598)
);

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float c = coc(viewDistance(vUv));
  vec3 color = texture2D(tColor, vUv).rgb;
  if (c > 0.01 && maxBlur > 0.0) {
    // 얕은 심도: 원판 표본. 또렷한 앞 물체가 뒤로 번지지 않게 표본도 자기 흐림만큼만 섞는다.
    vec3 sum = color;
    float weight = 1.0;
    for (int i = 0; i < 12; i++) {
      vec2 uv = vUv + disk[i] * texel * maxBlur * c;
      float w = coc(viewDistance(uv));
      sum += texture2D(tColor, uv).rgb * w;
      weight += w;
    }
    color = sum / weight;
  }
  if (aoAmount > 0.0) {
    float ao = texture2D(tAo, vUv).r;
    color *= mix(aoColor, vec3(1.0), mix(1.0, ao, aoAmount));
  }
  color += texture2D(tBloom, vUv).rgb * bloom * bloomTint;
  if (rays > 0.0) color += texture2D(tRays, vUv).rgb * raysTint * rays;
  if (haze > 0.0) {
    // 공기 원근: 멀수록 위는 맑은 하늘빛, 아래는 크림빛 공기로 옅어진다.
    float far01 = smoothstep(3.5, 14.0, viewDistance(vUv)) * step(texture2D(tDepth, vUv).x, 0.99999);
    color = mix(color, mix(hazeBottom, hazeTop, vUv.y), far01 * haze);
  }
  // 색 보정(Focustown 참고: 밝고 깨끗한 하이키, 옅은 나무, 맑은 그림자). 주황 계열(빨강 > 초록 > 파랑,
  // 색상 비 0.2–0.7)은 회색으로 누르지 않고 채도를 조금 덜며 밝혀 옅은 살구·베이지로 옮긴다.
  float spread = color.r - color.b;
  float hueRatio = (color.g - color.b) / max(spread, 1e-4);
  float orange = smoothstep(0.03, 0.2, spread) * step(color.b, color.g) * step(color.g, color.r)
    * (1.0 - smoothstep(0.25, 0.3, abs(hueRatio - 0.45)));
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 pale = mix(color, vec3(luma), 0.35) * 1.14;
  color = mix(color, pale, orange * deOrange);
  color *= warm * exposure;
  if (style > 0.5) {
    // 생기: 흐린 색은 채도를 올리고 이미 진한 색은 누른다(파스텔이 고르게).
    float mx = max(color.r, max(color.g, color.b));
    float mn = min(color.r, min(color.g, color.b));
    float l2 = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(l2), color, 1.0 + vibrance * (1.0 - 2.0 * (mx - mn)));
    // 부드러운 어깨: 밝은 곳이 하얗게 날아가지 않고 크림빛으로 눕는다.
    color = color / (1.0 + color * 0.14) * 1.14;
    // 분할 톤: 어두운 쪽은 라벤더, 밝은 쪽은 크림.
    color *= mix(shadowTone, highlightTone, smoothstep(0.15, 0.85, l2));
  }
  color = 1.0 - (1.0 - color) * (1.0 - highlightLift);
  // 그림자를 우윳빛으로 들어 올려 파스텔 느낌.
  color = color * (1.0 - liftAmount) + lift * liftAmount;
  // 빛샘: 해 쪽 모서리에서 번지는 옅은 크림빛.
  if (leak > 0.0) color += vec3(1.0, 0.94, 0.86) * leak * smoothstep(0.9, 0.0, distance(vUv, leakAt));
  // 비네트.
  vec2 d = vUv - 0.5;
  color *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.0, 0.8)));
  // 필름 그레인(고정 무늬: 다시 그리지 않아도 된다).
  color += (hash(gl_FragCoord.xy) - 0.5) * grain;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

/** day: 0 밤 – 1 밝은 낮(해가 떠 있으면 0.5 이상). sunX: 해가 화면 가로 어디쯤(0 왼쪽 – 1 오른쪽). */
export type MoodLook = { bloom: number; depthOfField: boolean; grain: number; vignette: number; ao: boolean; day: number; sunX: number }
export type ComposerStyle = 'soft' | 'toon'

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader, uniforms, depthTest: false, depthWrite: false }),
  )
  const scene = new THREE.Scene()
  scene.add(mesh)
  return { mesh, scene }
}

export class ToonComposer {
  private readonly color = new THREE.WebGLRenderTarget(1, 1, { samples: 4 })
  private readonly normal = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) })
  private readonly lined = new THREE.WebGLRenderTarget(1, 1)
  private readonly aa = new THREE.WebGLRenderTarget(1, 1)
  private readonly halfA = new THREE.WebGLRenderTarget(1, 1)
  private readonly halfB = new THREE.WebGLRenderTarget(1, 1)
  private readonly aoA = new THREE.WebGLRenderTarget(1, 1)
  private readonly aoB = new THREE.WebGLRenderTarget(1, 1)
  private readonly raysA = new THREE.WebGLRenderTarget(1, 1)
  private readonly raysB = new THREE.WebGLRenderTarget(1, 1)
  private readonly normalMaterial = new THREE.MeshNormalMaterial()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly outline = pass(outlineFragment, {
    tColor: { value: this.color.texture },
    tNormal: { value: this.normal.texture },
    tDepth: { value: this.normal.depthTexture },
    texel: { value: new THREE.Vector2(1, 1) },
    near: { value: 0.1 },
    far: { value: 100 },
    lineWidth: { value: 1 },
    // 따뜻한 짙은 갈색 선(섬 팔레트 잉크 #5E4A32보다 조금 진하게).
    outline: { value: new THREE.Vector4(0.24, 0.17, 0.12, 0.85) },
    tintedLine: { value: 0 },
  })
  private readonly ao = pass(aoFragment, {
    tNormal: { value: this.normal.texture },
    tDepth: { value: this.normal.depthTexture },
    texel: { value: new THREE.Vector2(1, 1) },
    near: { value: 0.1 },
    far: { value: 100 },
    projScale: { value: new THREE.Vector2(1, 1) },
    radius: { value: 0.5 },
  })
  private readonly fxaa = (() => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), depthTest: false, depthWrite: false }),
    )
    const scene = new THREE.Scene()
    scene.add(mesh)
    return { mesh, scene }
  })()
  private readonly bright = pass(brightFragment, { tColor: { value: this.aa.texture }, threshold: { value: 0.72 } })
  private readonly blur = pass(blurFragment, { tColor: { value: null }, step: { value: new THREE.Vector2() } })
  private readonly final = pass(finalFragment, {
    tColor: { value: this.aa.texture },
    tBloom: { value: this.halfA.texture },
    tDepth: { value: this.normal.depthTexture },
    texel: { value: new THREE.Vector2(1, 1) },
    near: { value: 0.1 },
    far: { value: 100 },
    focus: { value: 3 },
    focusBand: { value: 0.9 },
    blurRange: { value: 3.5 },
    maxBlur: { value: 6 },
    bloom: { value: 0.55 },
    grain: { value: 0.01 },
    vignette: { value: 0.1 },
    // 맑은 그림자: 살짝 푸른 우윳빛(예전 크림색 1, 0.95, 0.92는 그림자까지 주황으로 물들였다).
    lift: { value: new THREE.Vector3(0.93, 0.96, 1.0) },
    liftAmount: { value: 0.09 },
    // 주황끼를 빼려고 거의 중성으로(예전 1.04, 1.0, 0.97). 사용자 결정 2026-11-23.
    warm: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    deOrange: { value: 0.6 },
    exposure: { value: 1.06 },
    highlightLift: { value: 0.06 },
    style: { value: 0 },
    tAo: { value: this.aoA.texture },
    aoAmount: { value: 0 },
    aoColor: { value: new THREE.Vector3(0.5, 0.47, 0.62) },
    vibrance: { value: 0.4 },
    shadowTone: { value: new THREE.Vector3(0.9, 0.93, 1.04) },
    highlightTone: { value: new THREE.Vector3(1.04, 1.02, 0.95) },
    tRays: { value: this.raysA.texture },
    rays: { value: 0 },
    raysTint: { value: new THREE.Vector3(1.0, 0.92, 0.82) },
    bloomTint: { value: new THREE.Vector3(1, 1, 1) },
    haze: { value: 0 },
    hazeTop: { value: new THREE.Vector3(0.9, 0.93, 1.0) },
    hazeBottom: { value: new THREE.Vector3(1.0, 0.95, 0.9) },
    leak: { value: 0 },
    leakAt: { value: new THREE.Vector2(1.05, 1.05) },
  })
  private readonly skyMask = pass(skyMaskFragment, { tColor: { value: this.aa.texture }, tDepth: { value: this.normal.depthTexture } })
  private readonly raysPass = pass(raysFragment, { tMask: { value: this.raysB.texture }, sun: { value: new THREE.Vector2(0.82, 1.15) }, decay: { value: 0.965 } })
  private width = 1
  private softBase = { exposure: 1, highlightLift: 0, haze: 0, leak: 0, rays: 0 }
  private height = 1

  constructor(readonly style: ComposerStyle = 'soft') {
    this.fxaa.mesh.material.uniforms.tDiffuse!.value = this.lined.texture
    const fu = this.final.mesh.material.uniforms
    if (style === 'soft') {
      // 부드러운 파스텔 룩 값(Focustown 참고): 선은 그 자리 색을 어둡게, 빛 번짐은 조금 더, 그림자는 라벤더.
      this.outline.mesh.material.uniforms.tintedLine!.value = 1
      ;(this.outline.mesh.material.uniforms.outline!.value as THREE.Vector4).w = 0.7
      fu.style!.value = 1
      fu.exposure!.value = 1.08
      fu.highlightLift!.value = 0.04
      ;(fu.lift!.value as THREE.Vector3).set(0.92, 0.96, 1.0)
      fu.liftAmount!.value = 0.05
      this.bright.mesh.material.uniforms.threshold!.value = 0.66
      // 감성(사용자 요청 2026-11-23): 창빛 줄기·공기 원근·살구빛 할레이션·빛샘·조금 짙은 비네트.
      ;(fu.bloomTint!.value as THREE.Vector3).set(1.06, 0.96, 0.92)
      fu.haze!.value = 0.32
      fu.leak!.value = 0.07
      this.softBase = { exposure: 1.08, highlightLift: 0.04, haze: 0.32, leak: 0.07, rays: 0.55 }
    }
  }

  setSize(width: number, height: number) {
    if (this.width === width && this.height === height) return
    this.width = width
    this.height = height
    for (const rt of [this.color, this.normal, this.lined, this.aa]) rt.setSize(width, height)
    const hw = Math.max(1, Math.round(width / 2))
    const hh = Math.max(1, Math.round(height / 2))
    this.halfA.setSize(hw, hh)
    this.halfB.setSize(hw, hh)
    this.aoA.setSize(hw, hh)
    this.aoB.setSize(hw, hh)
    this.raysA.setSize(hw, hh)
    this.raysB.setSize(hw, hh)
    ;(this.ao.mesh.material.uniforms.texel!.value as THREE.Vector2).set(1 / hw, 1 / hh)
    ;(this.fxaa.mesh.material.uniforms.resolution!.value as THREE.Vector2).set(1 / width, 1 / height)
    ;(this.outline.mesh.material.uniforms.texel!.value as THREE.Vector2).set(1 / width, 1 / height)
    ;(this.final.mesh.material.uniforms.texel!.value as THREE.Vector2).set(1 / width, 1 / height)
  }

  private draw(gl: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, scene: THREE.Scene) {
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(scene, this.camera)
  }

  /** focusDistance: 카메라에서 내 자리(초점)까지(m). mood가 null이면 외곽선·FXAA만. */
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, pixelRatio: number, focusDistance: number, mood: MoodLook | null) {
    const ou = this.outline.mesh.material.uniforms
    ou.near!.value = camera.near
    ou.far!.value = camera.far
    ou.lineWidth!.value = Math.max(1, 1.2 * pixelRatio)

    gl.setRenderTarget(this.color)
    gl.clear()
    gl.render(scene, camera)
    const background = scene.background
    const override = scene.overrideMaterial
    scene.background = null
    scene.overrideMaterial = this.normalMaterial
    gl.setRenderTarget(this.normal)
    gl.clear()
    gl.render(scene, camera)
    scene.overrideMaterial = override
    scene.background = background

    this.draw(gl, this.lined, this.outline.scene)
    if (!mood) {
      this.draw(gl, null, this.fxaa.scene)
      return
    }
    this.draw(gl, this.aa, this.fxaa.scene)

    // 접촉 그늘(부드러운 룩, 높은 단계만): ½ 해상도로 구하고 한 번 흐려 얼룩을 없앤다.
    const fu0 = this.final.mesh.material.uniforms
    const useAo = this.style === 'soft' && mood.ao
    fu0.aoAmount!.value = useAo ? 1.0 : 0
    if (useAo) {
      const au = this.ao.mesh.material.uniforms
      au.near!.value = camera.near
      au.far!.value = camera.far
      ;(au.projScale!.value as THREE.Vector2).set(camera.projectionMatrix.elements[0]!, camera.projectionMatrix.elements[5]!)
      this.draw(gl, this.aoA, this.ao.scene)
      const bu0 = this.blur.mesh.material.uniforms
      bu0.tColor!.value = this.aoA.texture
      ;(bu0.step!.value as THREE.Vector2).set(1.2 / this.aoA.width, 0)
      this.draw(gl, this.aoB, this.blur.scene)
      bu0.tColor!.value = this.aoB.texture
      ;(bu0.step!.value as THREE.Vector2).set(0, 1.2 / this.aoA.height)
      this.draw(gl, this.aoA, this.blur.scene)
    }

    // 빛 번짐: 밝은 곳을 ½ 해상도로 뽑아 두 번 흐린다(가로·세로).
    this.draw(gl, this.halfA, this.bright.scene)
    const bu = this.blur.mesh.material.uniforms
    const hw = this.halfA.width
    const hh = this.halfA.height
    for (const radius of [1.5, 3.0]) {
      bu.tColor!.value = this.halfA.texture
      ;(bu.step!.value as THREE.Vector2).set(radius / hw, 0)
      this.draw(gl, this.halfB, this.blur.scene)
      bu.tColor!.value = this.halfB.texture
      ;(bu.step!.value as THREE.Vector2).set(0, radius / hh)
      this.draw(gl, this.halfA, this.blur.scene)
    }

    // 빛줄기(부드러운 룩, 높은 단계만): 하늘 가면 → 해 쪽으로 모으기(½ 해상도).
    const useRays = this.style === 'soft' && mood.ao
    if (useRays) {
      this.draw(gl, this.raysB, this.skyMask.scene)
      this.draw(gl, this.raysA, this.raysPass.scene)
    }

    const fu = this.final.mesh.material.uniforms
    // 감성 효과는 해 따라: 밝은 낮(특히 아침·한낮)에는 이미 밝으니 노출·공기·빛샘·빛줄기를 줄이고,
    // 해 질 녘·밤에는 다 살린다(사용자 피드백 2026-11-23: 아침이 너무 밝다). 빛줄기·빛샘은 해 쪽에서 온다.
    if (this.style === 'soft') {
      const calm = 1 - 0.55 * mood.day
      fu.exposure!.value = 1 + (this.softBase.exposure - 1) * (1 - mood.day) - 0.04 * mood.day
      fu.highlightLift!.value = this.softBase.highlightLift * (1 - mood.day)
      fu.haze!.value = this.softBase.haze * calm
      fu.leak!.value = this.softBase.leak * calm
      ;(fu.leakAt!.value as THREE.Vector2).set(mood.sunX < 0.5 ? -0.05 : 1.05, 1.05)
      ;(this.raysPass.mesh.material.uniforms.sun!.value as THREE.Vector2).set(mood.sunX, 1.15)
    }
    fu.rays!.value = useRays ? this.softBase.rays * (1 - 0.5 * mood.day) : 0
    fu.near!.value = camera.near
    fu.far!.value = camera.far
    fu.focus!.value = focusDistance
    fu.maxBlur!.value = mood.depthOfField ? 6 * pixelRatio : 0
    fu.bloom!.value = this.style === 'soft' ? mood.bloom * 1.25 : mood.bloom
    fu.grain!.value = mood.grain
    fu.vignette!.value = mood.vignette
    this.draw(gl, null, this.final.scene)
  }

  dispose() {
    for (const rt of [this.color, this.lined, this.aa, this.halfA, this.halfB, this.aoA, this.aoB, this.raysA, this.raysB]) rt.dispose()
    this.normal.depthTexture?.dispose()
    this.normal.dispose()
    this.normalMaterial.dispose()
    for (const p of [this.outline, this.fxaa, this.bright, this.blur, this.final, this.ao, this.skyMask, this.raysPass]) {
      p.mesh.geometry.dispose()
      p.mesh.material.dispose()
    }
  }
}
