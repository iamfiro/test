// StudyVillage 카툰 룩(원본 앱에 없음, docs/design-parity/exceptions.md).
// 1) 장면을 MSAA(4) 렌더 타깃에 그리고, 2) 법선·깊이를 따로 그려, 3) 깊이 차이·법선 각도가 큰 곳에
// 외곽선을 얹어 화면에 낸다. 하늘(아무것도 안 그린 곳)은 투명하게 남겨 뒤의 하늘 캔버스가 보인다.
import * as THREE from 'three'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const quadFragment = /* glsl */ `
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

float viewZ(vec2 uv) {
  return perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
}
vec3 normalAt(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

void main() {
  vec4 color = texture2D(tColor, vUv);
  vec2 o = texel * lineWidth;
  float zc = viewZ(vUv);
  vec3 nc = normalAt(vUv);
  float depthEdge = 0.0;
  float normalEdge = 0.0;
  vec2 offsets[4] = vec2[4](vec2(o.x, 0.0), vec2(-o.x, 0.0), vec2(0.0, o.y), vec2(0.0, -o.y));
  for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + offsets[i];
    float zn = viewZ(uv);
    // 가까운 쪽(카메라에 가까운 면)에만 선을 둬 선이 두 겹이 되지 않게 한다.
    float rel = (zn - zc) / max(-zc, 0.001);
    depthEdge = max(depthEdge, smoothstep(0.04, 0.1, -rel));
    normalEdge = max(normalEdge, smoothstep(0.6, 0.9, 1.0 - dot(nc, normalAt(uv))));
  }
  // 멀수록 선을 옅게(먼 가구가 선으로 지저분해지지 않게). 가까운 3m 안은 또렷하다.
  float fade = 1.0 - smoothstep(3.0, 11.0, -zc);
  float edge = max(depthEdge, normalEdge * 0.75 * step(0.001, color.a)) * outline.a * mix(0.35, 1.0, fade);
  vec3 rgb = mix(color.rgb, outline.rgb, edge);
  gl_FragColor = vec4(rgb, max(color.a, edge));
}
`

export class ToonComposer {
  private readonly color: THREE.WebGLRenderTarget
  private readonly normal: THREE.WebGLRenderTarget
  private readonly normalMaterial = new THREE.MeshNormalMaterial()
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  private readonly quadScene = new THREE.Scene()
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  /** 외곽선을 얹은 결과. 마지막에 FXAA로 선의 계단을 눅여 화면에 낸다. */
  private readonly lined = new THREE.WebGLRenderTarget(1, 1)
  private readonly fxaa = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ ...FXAAShader, uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms), transparent: true, depthTest: false, depthWrite: false }),
  )
  private readonly fxaaScene = new THREE.Scene()

  constructor() {
    this.color = new THREE.WebGLRenderTarget(1, 1, { samples: 4 })
    this.normal = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) })
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: quadVertex,
        fragmentShader: quadFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tColor: { value: this.color.texture },
          tNormal: { value: this.normal.texture },
          tDepth: { value: this.normal.depthTexture },
          texel: { value: new THREE.Vector2(1, 1) },
          near: { value: 0.1 },
          far: { value: 100 },
          lineWidth: { value: 1 },
          // 따뜻한 짙은 갈색 선(섬 팔레트 잉크 #5E4A32보다 조금 진하게).
          outline: { value: new THREE.Vector4(0.24, 0.17, 0.12, 0.85) },
        },
      }),
    )
    this.quadScene.add(this.quad)
    this.fxaaScene.add(this.fxaa)
    this.fxaa.material.uniforms.tDiffuse!.value = this.lined.texture
  }

  setSize(width: number, height: number) {
    if (this.color.width === width && this.color.height === height) return
    this.color.setSize(width, height)
    this.normal.setSize(width, height)
    this.lined.setSize(width, height)
    ;(this.fxaa.material.uniforms.resolution!.value as THREE.Vector2).set(1 / width, 1 / height)
    ;(this.quad.material.uniforms.texel!.value as THREE.Vector2).set(1 / width, 1 / height)
  }

  render(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, pixelRatio: number) {
    const u = this.quad.material.uniforms
    u.near!.value = camera.near
    u.far!.value = camera.far
    // 선 굵기는 화면 픽셀 기준 약 1.2pt.
    u.lineWidth!.value = Math.max(1, 1.2 * pixelRatio)
    gl.setRenderTarget(this.color)
    gl.clear()
    gl.render(scene, camera)
    const previous = scene.overrideMaterial
    scene.overrideMaterial = this.normalMaterial
    gl.setRenderTarget(this.normal)
    gl.clear()
    gl.render(scene, camera)
    scene.overrideMaterial = previous
    gl.setRenderTarget(this.lined)
    gl.clear()
    gl.render(this.quadScene, this.quadCamera)
    gl.setRenderTarget(null)
    gl.clear()
    gl.render(this.fxaaScene, this.quadCamera)
  }

  dispose() {
    this.color.dispose()
    this.lined.dispose()
    this.fxaa.geometry.dispose()
    this.fxaa.material.dispose()
    this.normal.depthTexture?.dispose()
    this.normal.dispose()
    this.normalMaterial.dispose()
    this.quad.geometry.dispose()
    this.quad.material.dispose()
  }
}
