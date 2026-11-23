// 원본: packages/flutter_scene/shaders/pocket_retro.frag + infrastructure/flutter_scene/flutter_scene_retro_look.dart
// (PocketTime f574f242). 조명은 텍스처에 구워져 있다. 셰이더는 원본 그대로 sRGB 값 공간에서 계산한다:
// 텍스처는 색 공간 변환 없이 읽고(NoColorSpace) 출력도 변환하지 않는다(원본 Impeller 경로와 같음).
import * as THREE from 'three'

const vertexShader = /* glsl */ `
varying vec3 v_position;
varying vec3 v_viewvector;
varying vec2 v_texture_coords;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
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
varying vec3 v_position;
varying vec3 v_viewvector;
varying vec2 v_texture_coords;

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
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, vec3(luma), posterize.w);
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
export function createRetroMaterial(map: THREE.Texture | null, smooth: boolean): THREE.ShaderMaterial {
  const texture = map ?? white
  if (map) {
    map.colorSpace = THREE.NoColorSpace
    map.generateMipmaps = false
    map.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter
    map.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter
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
