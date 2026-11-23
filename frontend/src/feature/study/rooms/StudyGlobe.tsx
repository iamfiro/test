// 공부방 페이지의 큰 지구(StudyVillage 전용, 앱에 없음: docs/design-parity/exceptions.md).
// 탭바 지구 아이콘과 같은 결: 광택 있는 파란 바다, 둥근 초록 대륙, 흰 구름. 가장자리는 흰 테두리 대신
// 은은한 대기 광륜(사용자 결정 2026-11-23: 흰 테두리가 부자연스러움).
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

/** 육지 판정용: 지구 셰이더와 같은 노이즈를 경위도 격자에 그려 GPU에서 읽어 온다(CPU로 다시 계산하면 sin 정밀도가 달라 어긋난다). */
const landHeight = 'float landHeight(vec3 d) { return fbm(d * 1.7 + vec3(3.1, 0.0, 1.7)); }'
const landMapFragment = /* glsl */ `
${noise}
${landHeight}
varying vec2 vUv;
void main() {
  float lon = vUv.x * 6.28318530718;
  float lat = (vUv.y - 0.5) * 3.14159265359;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  gl_FragColor = vec4(clamp(landHeight(d) + 0.5, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`
const landMapW = 256
const landMapH = 128
/** 이 높이보다 높은 곳만(해안선 0.06~0.09보다 안쪽) 앉힌다. */
const inlandHeight = 0.13
/** 앉은 사람끼리 최소 각거리(rad). */
const minSpacing = 0.32

const earthFragment = /* glsl */ `
${noise}
${landHeight}
uniform vec3 light;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float h = landHeight(vObj);
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

// 대기 광륜: 뒷면만 그린 큰 공. 지구 가장자리에서 가장 밝고 바깥으로 갈수록 투명해진다(딱딱한 테두리 없음).
// d는 바깥 실루엣에서 0, 안쪽으로 갈수록 커진다. 지구 가장자리(반지름 1)는 d≈0.49(반지름 1.15 기준).
const atmosphereFragment = /* glsl */ `
uniform vec3 light;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float d = max(-dot(vNormal, vView), 0.0);
  float glow = pow(smoothstep(0.0, 0.5, d), 2.2);
  float sun = 0.55 + 0.45 * smoothstep(-0.4, 0.8, dot(vNormal, light));
  vec3 color = vec3(0.62, 0.84, 1.0);
  gl_FragColor = vec4(color, glow * sun * 0.85);
}
`

/** 캔버스가 요소보다 큰 배율. 광륜 끝(1.15)이 화면 반높이(1.125·bleed) 안에 들어오게. */
const bleed = 1.3

/** 지구 위를 걸어 다니는 작은 유저들. 지구 셰이더와 같은 값 공간(출력 LinearSRGB)에 맞춰 색 숫자를 그대로 쓴다. */
const rawColor = (hex: number) => new THREE.Color().setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, THREE.LinearSRGBColorSpace)
const shirts = [0xf26a2e, 0xf8d66a, 0x5dae6b, 0xe0568a, 0x8a6cf0, 0x3aa0ff, 0xffffff]
const hairs = [0x3b2a1e, 0x5e4a32, 0x1f1b24, 0xb9772f]
const walkerCount = 24

/** 육지 안쪽 자리들(earth 좌표의 단위 벡터). 격자를 고정 순서로 훑어 서로 minSpacing 이상 떨어진 곳만 고른다. */
function landSpots(renderer: THREE.WebGLRenderer): THREE.Vector3[] {
  const target = new THREE.WebGLRenderTarget(landMapW, landMapH)
  const material = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: landMapFragment,
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  const scene = new THREE.Scene()
  scene.add(quad)
  renderer.setRenderTarget(target)
  renderer.render(scene, new THREE.Camera())
  const pixels = new Uint8Array(landMapW * landMapH * 4)
  renderer.readRenderTargetPixels(target, 0, 0, landMapW, landMapH, pixels)
  renderer.setRenderTarget(null)
  target.dispose(); material.dispose(); quad.geometry.dispose()

  const spots: THREE.Vector3[] = []
  // 격자를 큰 소수 보폭으로 건너뛰며 훑어 한쪽에 몰리지 않게 한다.
  const total = landMapW * landMapH
  for (let k = 0, idx = 0; k < total && spots.length < walkerCount; k++, idx = (idx + 7919) % total) {
    const h = pixels[idx * 4]! / 255 - 0.5
    if (h < inlandHeight) continue
    const x = idx % landMapW
    const y = Math.floor(idx / landMapW)
    const lon = ((x + 0.5) / landMapW) * Math.PI * 2
    const lat = ((y + 0.5) / landMapH - 0.5) * Math.PI
    if (Math.abs(lat) > 1.2) continue
    const d = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon))
    if (spots.some((o) => o.angleTo(d) < minSpacing)) continue
    spots.push(d)
  }
  return spots
}

export function StudyGlobe(props: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    // 대기 광륜(반지름 1.15)이 요소 밖까지 퍼지므로 캔버스를 요소보다 bleed배 크게 가운데 맞춰 그린다.
    // 카메라도 같은 배만큼 물려서 지구 크기는 요소 기준 그대로다.
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.pointerEvents = 'none'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
    camera.position.set(0, 0, 4.2 * bleed)
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
    const outline = new THREE.Mesh(
      new THREE.SphereGeometry(1.15, 64, 48),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: atmosphereFragment,
        uniforms: { light: { value: light } },
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    globe.add(earth, clouds)
    scene.add(outline)


    // 공부하는 작은 유저들: 지구와 함께 돌도록 earth의 자식으로 두고, 육지 안쪽에만 책상을 놓고 앉아 공부한다.
    type Student = { body: THREE.Group; holder: THREE.Group; head: THREE.Group; phase: number }
    const disposables: { dispose(): void }[] = []
    const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x }
    const headGeo = track(new THREE.SphereGeometry(0.028, 16, 12))
    const bodyGeo = track(new THREE.CapsuleGeometry(0.02, 0.022, 4, 10))
    const legGeo = track(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8))
    const eyeGeo = track(new THREE.SphereGeometry(0.0045, 6, 6))
    const hairGeo = track(new THREE.SphereGeometry(0.031, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55))
    const deskGeo = track(new THREE.BoxGeometry(0.08, 0.004, 0.042))
    const deskLegGeo = track(new THREE.BoxGeometry(0.004, 0.044, 0.004))
    const bookGeo = track(new THREE.BoxGeometry(0.034, 0.004, 0.024))
    const basic = (hex: number, side: THREE.Side = THREE.FrontSide) => track(new THREE.MeshBasicMaterial({ color: rawColor(hex), side }))
    const white = basic(0xffffff, THREE.BackSide)
    const skin = basic(0xffd9b8)
    const eyeMat = basic(0x2a2018)
    const legMat = basic(0x5e4a32)
    const deskMat = basic(0xc99a5b)
    const bookMat = basic(0xfbfaf7)
    const students: Student[] = []
    for (const [i, p0] of landSpots(renderer).entries()) {
      const ref = Math.abs(p0.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
      const east = new THREE.Vector3().crossVectors(ref, p0).normalize()
      const north = new THREE.Vector3().crossVectors(p0, east).normalize()
      const a = i * 2.399
      const forward = east.clone().multiplyScalar(Math.cos(a)).addScaledVector(north, Math.sin(a)).normalize()
      const right = new THREE.Vector3().crossVectors(p0, forward).normalize()
      const holder = new THREE.Group()
      holder.position.copy(p0)
      holder.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, p0, forward))
      const body = new THREE.Group()
      body.scale.setScalar(0.85)
      holder.add(body)
      const shirt = basic(shirts[i % shirts.length]!)
      const torso = new THREE.Mesh(bodyGeo, shirt); torso.position.set(0, 0.042, -0.012)
      const torsoOutline = new THREE.Mesh(bodyGeo, white); torsoOutline.position.copy(torso.position); torsoOutline.scale.setScalar(1.28)
      const head = new THREE.Group(); head.position.set(0, 0.088, -0.008)
      const skull = new THREE.Mesh(headGeo, skin)
      const skullOutline = new THREE.Mesh(headGeo, white); skullOutline.scale.setScalar(1.22)
      const hair = new THREE.Mesh(hairGeo, basic(hairs[i % hairs.length]!)); hair.position.set(0, 0.002, -0.004)
      const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.01, 0, 0.026)
      const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.01, 0, 0.026)
      head.add(skullOutline, skull, hair, eyeL, eyeR)
      body.add(torsoOutline, torso, head)
      // 다리는 앞으로 뻗고(앉은 자세) 책상 아래로 들어간다.
      for (const x of [-0.011, 0.011]) {
        const hip = new THREE.Group(); hip.position.set(x, 0.026, -0.012); hip.rotation.x = -Math.PI / 2
        const leg = new THREE.Mesh(legGeo, legMat); leg.position.y = -0.015
        hip.add(leg); body.add(hip)
      }
      const top = new THREE.Mesh(deskGeo, deskMat); top.position.set(0, 0.046, 0.058)
      const book = new THREE.Mesh(bookGeo, bookMat); book.position.set(0, 0.0505, 0.054)
      body.add(top, book)
      for (const x of [-0.034, 0.034]) { const l = new THREE.Mesh(deskLegGeo, deskMat); l.position.set(x, 0.022, 0.074); body.add(l) }
      earth.add(holder)
      students.push({ body, holder, head, phase: i * 1.7 })
    }
    let clock = 0
    const updateStudents = (dt: number) => {
      clock += dt
      for (const w of students) {
        // 책을 보며 고개를 숙이고 가끔 끄덕이며 필기한다.
        w.head.rotation.x = 0.4 + Math.sin(clock * 2.2 + w.phase) * 0.07
        w.head.rotation.y = Math.sin(clock * 0.6 + w.phase) * 0.12
      }
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = performance.now()
    let spin = 0
    let drag: number | null = null
    let velocity = 0

    const resize = () => {
      const w = Math.round(el.clientWidth * bleed)
      const h = Math.round(el.clientHeight * bleed)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = `${w}px`
      renderer.domElement.style.height = `${h}px`
      renderer.domElement.style.left = `${(el.clientWidth - w) / 2}px`
      renderer.domElement.style.top = `${(el.clientHeight - h) / 2}px`
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
      if (!reduce) updateStudents(dt)
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
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])
  return <div ref={host} className={props.className} aria-hidden="true" style={{ touchAction: 'pan-y', cursor: 'grab' }} />
}
