// 공부방 페이지의 큰 지구(StudyVillage 전용, 앱에 없음: docs/design-parity/exceptions.md).
// 탭바 지구 아이콘과 같은 결: 광택 있는 파란 바다, 둥근 초록 대륙, 흰 구름, 흰 스티커 테두리.
// 대륙·구름은 셰이더의 3D 노이즈로 만든다(텍스처 없음). 천천히 돌고, 끌면 돌린다. 탭이 가려지면 멈춘다.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const noise = /* glsl */ `
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash3(i + vec3(0, 0, 0)), f - vec3(0, 0, 0)), dot(hash3(i + vec3(1, 0, 0)), f - vec3(1, 0, 0)), u.x),
                 mix(dot(hash3(i + vec3(0, 1, 0)), f - vec3(0, 1, 0)), dot(hash3(i + vec3(1, 1, 0)), f - vec3(1, 1, 0)), u.x), u.y),
             mix(mix(dot(hash3(i + vec3(0, 0, 1)), f - vec3(0, 0, 1)), dot(hash3(i + vec3(1, 0, 1)), f - vec3(1, 0, 1)), u.x),
                 mix(dot(hash3(i + vec3(0, 1, 1)), f - vec3(0, 1, 1)), dot(hash3(i + vec3(1, 1, 1)), f - vec3(1, 1, 1)), u.x), u.y), u.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 4; i++) { v += a * gnoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
`

const vertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vObj = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormal = normalize(mat3(modelMatrix) * normal);
  vView = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const earthFragment = /* glsl */ `
${noise}
uniform vec3 light;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float h = fbm(vObj * 1.7 + vec3(3.1, 0.0, 1.7));
  float land = smoothstep(0.06, 0.09, h);
  float ndl = dot(vNormal, light);
  // 바다: 빛 쪽은 밝은 하늘빛 파랑, 그늘 쪽은 짙은 파랑(두 단 + 부드러운 경계).
  vec3 oceanLit = vec3(0.24, 0.62, 0.98);
  vec3 oceanShade = vec3(0.13, 0.38, 0.86);
  vec3 landLit = vec3(0.47, 0.83, 0.25);
  vec3 landShade = vec3(0.27, 0.62, 0.20);
  float lit = smoothstep(-0.05, 0.25, ndl);
  vec3 color = mix(mix(oceanShade, oceanLit, lit), mix(landShade, landLit, lit), land);
  // 대륙 해안선 쪽 밝은 띠(만화풍).
  float coast = smoothstep(0.03, 0.06, h) * (1.0 - land);
  color = mix(color, vec3(0.55, 0.85, 1.0), coast * 0.55);
  // 바다 광택: 빛 반사 점.
  vec3 hv = normalize(light + vView);
  float spec = pow(max(dot(vNormal, hv), 0.0), 60.0);
  color += vec3(1.0) * smoothstep(0.35, 0.5, spec) * 0.55 * (1.0 - land);
  // 가장자리 림 라이트.
  float rim = 1.0 - max(dot(vNormal, vView), 0.0);
  color = mix(color, vec3(0.75, 0.9, 1.0), smoothstep(0.6, 0.95, rim) * 0.45);
  gl_FragColor = vec4(color, 1.0);
}
`

const cloudFragment = /* glsl */ `
${noise}
uniform vec3 light;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float c = fbm(vObj * 2.4 + vec3(9.0, 4.0, 2.0));
  float a = smoothstep(0.2, 0.24, c);
  if (a < 0.01) discard;
  float lit = smoothstep(-0.1, 0.3, dot(vNormal, light));
  vec3 color = mix(vec3(0.84, 0.9, 1.0), vec3(1.0), lit);
  gl_FragColor = vec4(color, a * 0.95);
}
`

export function StudyGlobe(props: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer.domElement.style.display = 'block'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    camera.position.set(0, 0, 4.2)
    const light = new THREE.Vector3(-0.6, 0.7, 0.8).normalize()
    const globe = new THREE.Group()
    globe.rotation.z = 0.35
    scene.add(globe)

    const sphere = new THREE.SphereGeometry(1, 96, 64)
    const earth = new THREE.Mesh(sphere, new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: earthFragment, uniforms: { light: { value: light } } }))
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 72, 48),
      new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: cloudFragment, uniforms: { light: { value: light } }, transparent: true, depthWrite: false }),
    )
    // 흰 스티커 테두리: 뒷면만 그린 조금 큰 공.
    const outline = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }))
    globe.add(earth, clouds)
    scene.add(outline)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()
    let spin = 0
    let drag: number | null = null
    let velocity = 0

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = `${w}px`
      renderer.domElement.style.height = `${h}px`
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
      draw()
    }
    const draw = () => {
      earth.rotation.y = spin
      clouds.rotation.y = spin * 1.15 + 0.4
      renderer.render(scene, camera)
    }
    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (drag == null) {
        velocity *= 0.94
        spin += (reduce ? 0 : 0.12) * dt + velocity * dt
      }
      draw()
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(tick)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !raf) { last = performance.now(); raf = requestAnimationFrame(tick) }
    }
    const onDown = (e: PointerEvent) => { drag = e.clientX; velocity = 0; el.setPointerCapture(e.pointerId) }
    const onMove = (e: PointerEvent) => {
      if (drag == null) return
      const dx = e.clientX - drag
      drag = e.clientX
      spin += dx * 0.006
      velocity = dx * 0.35
    }
    const onUp = () => { drag = null }

    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const m of [earth, clouds, outline]) { m.geometry.dispose(); (m.material as THREE.Material).dispose() }
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])
  return <div ref={host} className={props.className} aria-hidden="true" style={{ touchAction: 'pan-y', cursor: 'grab' }} />
}
