// 원본: packages/flutter_scene/shaders/pocket_retro.frag + infrastructure/flutter_scene/flutter_scene_retro_look.dart
// (PocketTime f574f242). 조명은 텍스처에 구워져 있다. 셰이더는 원본 그대로 sRGB 값 공간에서 계산한다:
// 텍스처는 색 공간 변환 없이 읽고(NoColorSpace) 출력도 변환하지 않는다(원본 Impeller 경로와 같음).
import * as THREE from 'three'

const vertexShader = /* glsl */ `
varying vec3 v_position;
varying vec3 v_viewvector;
varying vec2 v_texture_coords;
varying vec3 v_normal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  v_normal = normalize(mat3(modelMatrix) * normal);
  v_position = world.xyz;
  v_viewvector = cameraPosition - world.xyz;
  v_texture_coords = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const fragmentShader = /* glsl */ `
uniform vec4 fog_color;
uniform vec4 fog_range;
uniform vec4 posterize;
uniform vec4 tint;
uniform sampler2D base_color_texture;
// StudyVillage 카툰 룩(원본에 없음, docs/design-parity/exceptions.md): x 켬(0/1), y 그늘 밝기, z 경계(ndl), w 채도 더하기.
uniform vec4 toon;
uniform vec3 toon_light;
// 그늘 색(곱함)과 림 라이트(rgb 색, a 세기).
uniform vec3 toon_shadow;
uniform vec4 toon_rim;
// 부드러운 룩(soft, 기본): x 켬, y·z 빛 경계(ndl, 넓은 감싸기), w 림 세기. 그늘·빛·하늘·바닥 색.
uniform vec4 soft;
uniform vec3 soft_shadow;
uniform vec3 soft_key;
uniform vec3 soft_sky;
uniform vec3 soft_ground;
varying vec3 v_position;
varying vec3 v_viewvector;
varying vec2 v_texture_coords;
varying vec3 v_normal;

float Bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}
float Bayer4(vec2 a) {
  return Bayer2(0.5 * a) * 0.25 + Bayer2(a);
}

void main() {
  if (Bayer4(gl_FragCoord.xy + vec2(2.0, 1.0)) < posterize.z) discard;
  if (fog_range.z > 0.0 && v_position.y > fog_range.z) discard;

  vec3 color = texture2D(base_color_texture, v_texture_coords).rgb * tint.rgb;
  if (soft.x > 0.0) {
    // 부드러운 감싸기 조명: 구운 조명 위에 빛 쪽은 크림, 그늘 쪽은 라벤더로 넓게 번지게(단 없음).
    vec3 n = normalize(v_normal);
    float lit = smoothstep(soft.y, soft.z, dot(n, toon_light));
    vec3 light = mix(soft_shadow, soft_key, lit);
    // 반구 조명: 위를 보는 면은 하늘빛, 아래를 보는 면은 바닥 반사빛.
    light *= mix(soft_ground, soft_sky, n.y * 0.5 + 0.5);
    color *= light;
    float facing = 1.0 - max(dot(n, normalize(v_viewvector)), 0.0);
    color = mix(color, vec3(1.0, 0.98, 0.94), smoothstep(0.6, 0.95, facing) * soft.w * (0.4 + 0.6 * lit));
  } else if (toon.x > 0.0) {
    // 셀 셰이딩: 구운 조명 위에 빛을 받는 면/그늘 두 단을 또렷하게 나눈다.
    vec3 n = normalize(v_normal);
    float ndl = dot(n, toon_light);
    float lit = smoothstep(toon.z - 0.015, toon.z + 0.015, ndl);
    // 그늘은 회색으로 어둡게 하지 않고 푸른 보랏빛으로 물들인다(셀 애니메이션 그늘).
    color *= mix(toon_shadow * toon.y, vec3(1.0), lit);
    // 림 라이트: 시선과 비껴 서는 가장자리를 살짝 밝혀 형태를 띄운다(빛 받는 쪽만).
    float facing = 1.0 - max(dot(n, normalize(v_viewvector)), 0.0);
    float rim = smoothstep(0.55, 0.85, facing) * (0.35 + 0.65 * lit);
    color = mix(color, toon_rim.rgb, rim * toon_rim.a);
  }
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, vec3(luma), posterize.w);
  if (toon.x > 0.0) color = clamp(mix(vec3(luma), color, 1.0 + toon.w), 0.0, 1.0);
  float contrast = tint.a > 0.0 ? tint.a : 1.0;
  color = (color - 0.5) * contrast + 0.5;

  float view_distance = length(v_viewvector);
  float fog = clamp((view_distance - fog_range.x) / max(fog_range.y - fog_range.x, 0.001), 0.0, 1.0);
  color = mix(color, fog_color.rgb, fog * fog_color.a);

  float levels = max(posterize.x, 2.0);
  float threshold = (Bayer4(gl_FragCoord.xy) - 0.5) * posterize.y;
  color = floor(color * levels + 0.5 + threshold) / levels;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`

/** 셰이더 `FragInfo` 블록 값 한 벌(원본 RetroLook.floats 순서). */
export type RetroUniforms = {
  fogColor: [number, number, number]
  fogAmount: number
  fogNear: number
  fogFar: number
  colorLevels: number
  dither: number
  brightness: number
  tint: [number, number, number]
  desaturate: number
  cutHeight: number
  contrast: number
}

export function retroFloats(l: RetroUniforms): number[] {
  const b = l.brightness
  return [
    l.fogColor[0], l.fogColor[1], l.fogColor[2], l.fogAmount,
    l.fogNear, l.fogFar, l.cutHeight, 0,
    l.colorLevels, l.dither, 0, l.desaturate,
    l.tint[0] * b, l.tint[1] * b, l.tint[2] * b, l.contrast,
  ]
}

const white = (() => {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
  t.needsUpdate = true
  return t
})()

/**
 * 언릿 텍스처 하나를 질감 셰이더 재질로. smooth면 선형, 아니면 최근접으로 읽는다(원본 sampler).
 * 원본 flutter_scene은 밉맵을 만들지 않으므로 여기서도 만들지 않는다.
 */
export function createRetroMaterial(map: THREE.Texture | null, smooth: boolean, crisp: boolean): THREE.ShaderMaterial {
  const texture = map ?? white
  if (map) {
    map.colorSpace = THREE.NoColorSpace
    // crisp(웹 카툰 룩): 밉맵·선형으로 읽어 멀리 있는 텍스처가 지글거리지 않게 한다(픽셀 느낌 제거).
    map.generateMipmaps = crisp
    map.minFilter = crisp ? THREE.LinearMipmapLinearFilter : smooth ? THREE.LinearFilter : THREE.NearestFilter
    map.magFilter = crisp || smooth ? THREE.LinearFilter : THREE.NearestFilter
    map.anisotropy = crisp ? 4 : 1
    map.wrapS = THREE.ClampToEdgeWrapping
    map.wrapT = THREE.ClampToEdgeWrapping
    map.needsUpdate = true
  }
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      base_color_texture: { value: texture },
      fog_color: { value: new THREE.Vector4(0, 0, 0, 0) },
      fog_range: { value: new THREE.Vector4(0, 1, 0, 0) },
      posterize: { value: new THREE.Vector4(256, 0, 0, 0) },
      tint: { value: new THREE.Vector4(1, 1, 1, 1) },
      toon: { value: new THREE.Vector4(0, 1, 0, 0) },
      toon_light: { value: new THREE.Vector3(0.35, 0.85, 0.4).normalize() },
      toon_shadow: { value: new THREE.Vector3(0.9, 0.86, 1.0) },
      toon_rim: { value: new THREE.Vector4(1.0, 0.95, 0.86, 0.0) },
      soft: { value: new THREE.Vector4(0, -0.35, 0.8, 0) },
      soft_shadow: { value: new THREE.Vector3(0.74, 0.77, 0.95) },
      soft_key: { value: new THREE.Vector3(1.1, 1.06, 0.98) },
      soft_sky: { value: new THREE.Vector3(1.03, 1.05, 1.08) },
      soft_ground: { value: new THREE.Vector3(0.9, 0.88, 0.9) },
    },
  })
}

export function setRetroFloats(material: THREE.ShaderMaterial, f: number[]) {
  const u = material.uniforms
  ;(u.fog_color!.value as THREE.Vector4).set(f[0]!, f[1]!, f[2]!, f[3]!)
  ;(u.fog_range!.value as THREE.Vector4).set(f[4]!, f[5]!, f[6]!, f[7]!)
  ;(u.posterize!.value as THREE.Vector4).set(f[8]!, f[9]!, f[10]!, f[11]!)
  ;(u.tint!.value as THREE.Vector4).set(f[12]!, f[13]!, f[14]!, f[15]!)
}

/** 카툰 룩 값. 켜지 않으면 원본 셰이더와 같은 결과. */
export type ToonLook = { enabled: boolean; shade: number; threshold: number; saturation: number; rim: number }
// 채도 +20%: 파스텔 소품은 또렷하게(주황은 합성 단계에서 따로 옅게 한다). 그늘 0.9로 덜 어둡게.
export const toonDefault: ToonLook = { enabled: true, shade: 0.9, threshold: 0.12, saturation: 0.2, rim: 0.28 }

export function setToon(material: THREE.ShaderMaterial, toon: ToonLook) {
  ;(material.uniforms.toon!.value as THREE.Vector4).set(toon.enabled ? 1 : 0, toon.shade, toon.threshold, toon.saturation)
  ;(material.uniforms.toon_rim!.value as THREE.Vector4).w = toon.rim
  // 그늘 단을 끈 재질(shade 1)은 그늘 색도 물들이지 않는다(면이 각져 보이지 않게).
  ;(material.uniforms.toon_shadow!.value as THREE.Vector3).set(...((toon.shade >= 1 ? [1, 1, 1] : [0.9, 0.86, 1.0]) as [number, number, number]))
}

/** 부드러운 룩(기본): 셀 단 대신 넓은 감싸기 조명·반구 조명·옅은 림. 채도는 합성 단계에서 다룬다. */
export function setSoft(material: THREE.ShaderMaterial, rim: number) {
  ;(material.uniforms.soft!.value as THREE.Vector4).set(1, -0.25, 0.65, rim)
  ;(material.uniforms.toon!.value as THREE.Vector4).set(0, 1, 0, 0)
}
