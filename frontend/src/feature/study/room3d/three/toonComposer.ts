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
  gl_FragColor = vec4(mix(color.rgb, outline.rgb, edge), 1.0);
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
uniform float deOrange;   // 주황 계열만 채도를 덜어 내는 정도(0–1)
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
  color += texture2D(tBloom, vUv).rgb * bloom;
  // 색 보정: 주황 계열(빨강 > 초록 > 파랑, 색상 비 0.2–0.7)만 채도를 덜어 회갈색 쪽으로 눌러 준다.
  // 나무·바닥이 넓게 차지하는 방이라 전체 색온도를 내리면 차가워지므로 주황만 골라 뺀다.
  float spread = color.r - color.b;
  float hueRatio = (color.g - color.b) / max(spread, 1e-4);
  float orange = smoothstep(0.03, 0.2, spread) * step(color.b, color.g) * step(color.g, color.r)
    * (1.0 - smoothstep(0.25, 0.3, abs(hueRatio - 0.45)));
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(color, vec3(luma), orange * deOrange);
  color *= warm;
  // 그림자를 우윳빛으로 들어 올려 파스텔 느낌.
  color = color * (1.0 - liftAmount) + lift * liftAmount;
  // 비네트.
  vec2 d = vUv - 0.5;
  color *= 1.0 - vignette * smoothstep(0.35, 0.85, length(d * vec2(1.0, 0.8)));
  // 필름 그레인(고정 무늬: 다시 그리지 않아도 된다).
  color += (hash(gl_FragCoord.xy) - 0.5) * grain;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

export type MoodLook = { bloom: number; depthOfField: boolean; grain: number; vignette: number }

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
    grain: { value: 0.025 },
    vignette: { value: 0.2 },
    // 우윳빛(살짝 중성): 예전 크림색(1, 0.95, 0.92)은 그림자까지 주황으로 물들였다.
    lift: { value: new THREE.Vector3(0.98, 0.97, 0.96) },
    liftAmount: { value: 0.07 },
    // 주황끼를 빼려고 거의 중성으로(예전 1.04, 1.0, 0.97). 사용자 결정 2026-11-23.
    warm: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    deOrange: { value: 0.32 },
  })
  private width = 1
  private height = 1

  constructor() {
    this.fxaa.mesh.material.uniforms.tDiffuse!.value = this.lined.texture
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

    const fu = this.final.mesh.material.uniforms
    fu.near!.value = camera.near
    fu.far!.value = camera.far
    fu.focus!.value = focusDistance
    fu.maxBlur!.value = mood.depthOfField ? 6 * pixelRatio : 0
    fu.bloom!.value = mood.bloom
    fu.grain!.value = mood.grain
    fu.vignette!.value = mood.vignette
    this.draw(gl, null, this.final.scene)
  }

  dispose() {
    for (const rt of [this.color, this.lined, this.aa, this.halfA, this.halfB]) rt.dispose()
    this.normal.depthTexture?.dispose()
    this.normal.dispose()
    this.normalMaterial.dispose()
    for (const p of [this.outline, this.fxaa, this.bright, this.blur, this.final]) {
      p.mesh.geometry.dispose()
      p.mesh.material.dispose()
    }
  }
}
