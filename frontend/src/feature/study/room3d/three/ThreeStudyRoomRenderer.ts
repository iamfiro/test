// 원본: lib/feature/study/room3d/infrastructure/flutter_scene/flutter_scene_study_room_renderer.dart
// (PocketTime f574f242). flutter_scene 대신 three.js WebGL로 같은 GLB·같은 셰이더·같은 카메라를 그린다.
// 좌표: three의 glTF는 오른손 좌표계 그대로라 원본의 Z 반전(엔진 왼손 변환)이 필요 없다.
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { StudyRoomCameraRig } from '../domain/cameraRig'
import type { StudyRoomQuality } from '../domain/quality'
import { StudyRoomSeatCulling } from '../domain/seatCulling'
import type { StudyRoomCharacter } from '../model/character'
import type { StudyRoomLayout } from '../model/layout'
import type { StudyRoom3dScene, StudyRoomCamera, StudyRoomLook } from '../model/scene'
import { logger } from '../../../../core/log/log'
import { CharacterKit, type SeatedPerson } from './characterKit'
import { createRetroMaterial, retroFloats, setRetroFloats, setSoft, setToon, setVivid, toonDefault } from './retroMaterial'
import { ToonComposer, type MoodLook } from './toonComposer'
import { SkyDome } from './skyDome'
import type { StudyRoomDaylight } from '../domain/daylight'

const log = logger('StudyRoom3d')

export type RenderPhase = 'idle' | 'loading' | 'ready' | 'failed'

/** 원본 에셋 경로(`assets/...`)를 웹 public 경로로. */
const url = (asset: string) => `/${asset}`

type Listener = () => void

/**
 * 웹 룩. vivid(기본): 게임 아트 색감(따뜻한 해·푸른 그늘·높은 채도·대비, 공기 효과 없음, 사용자 참고 이미지 2026-11-23).
 * soft: 몽환적인 파스텔 룩(`?look=soft`). toon: 그 전의 셀 셰이딩 룩(`?look=toon`). app: 앱과 같은 그림(`?look=app`).
 */
export type RoomLook = 'vivid' | 'soft' | 'toon' | 'app'
export function roomLookFromLocation(): RoomLook {
  const v = new URLSearchParams(window.location.search).get('look')
  return v === 'app' || v === 'toon' || v === 'soft' ? v : 'vivid'
}

export class ThreeStudyRoomRenderer {
  readonly canvas: HTMLCanvasElement
  private gl: THREE.WebGLRenderer | null = null
  private readonly world = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  private room: THREE.Object3D | null = null
  private scenery: THREE.Object3D | null = null
  private people: THREE.Group | null = null
  private readonly retroMaterials: THREE.ShaderMaterial[] = []
  /** 단면(지붕 걷기)·밤 어둡게에서 다르게 다루는 바깥(`room_outdoors…`) 재질. */
  private readonly uncutMaterials = new Set<THREE.ShaderMaterial>()
  private kit: CharacterKit | null = null
  private seatPeople: (SeatedPerson | null)[] = []
  private lastLookKey: string | null = null
  private layout: StudyRoomLayout | null = null
  private characters: readonly (StudyRoomCharacter | null)[] = []
  private spec: StudyRoom3dScene | null = null
  private timeLook: StudyRoomLook | null = null
  private phaseValue: RenderPhase = 'idle'
  private errorValue: unknown = null
  private loadGeneration = 0
  private disposed = false
  private readonly listeners = new Set<Listener>()
  private contextLost = false
  private composer: ToonComposer | null = null
  /** 카툰 룩: 하늘을 장면 배경으로 그려 같은 후처리(심도·빛 번짐·색 보정)를 받게 한다. */
  private readonly sky = new SkyDome()
  /** 창문이 있는 쪽(rad): 자리들이 보는 방향 중 가장 많은 것. */
  private windowYaw = 0
  private daylight: StudyRoomDaylight | null = null
  private skyKey = ''

  constructor(readonly look: RoomLook = 'vivid') {
    this.canvas = document.createElement('canvas')
    // 하늘(뒤)과 자리 칩(앞) 사이에 놓는다.
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', zIndex: '1' })
    this.canvas.addEventListener('webglcontextlost', this.onContextLost)
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored)
  }

  get phase() { return this.phaseValue }
  get error() { return this.errorValue }
  get scene() { return this.spec }
  get drawsCharacters() { return this.phaseValue === 'ready' && this.kit != null }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    if (this.disposed) return
    for (const l of this.listeners) l()
  }

  private ensureGl(): THREE.WebGLRenderer {
    if (this.gl) return this.gl
    // 원본: MSAA 없음(저사양 GPU 비용). 투명 배경이라 뒤의 하늘 캔버스가 창으로 보인다.
    const gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, powerPreference: 'low-power' })
    gl.setClearColor(0x000000, 0)
    // 셰이더가 sRGB 값을 그대로 쓴다(원본 Impeller 경로). 출력 변환·톤 매핑 없음.
    gl.outputColorSpace = THREE.LinearSRGBColorSpace
    gl.toneMapping = THREE.NoToneMapping
    if (this.look !== 'app') this.composer = new ToonComposer(this.look)
    this.gl = gl
    return gl
  }

  async load(scene: StudyRoom3dScene): Promise<void> {
    const generation = ++this.loadGeneration
    this.spec = this.timeLook ? scene.withLook(this.timeLook) : scene
    this.phaseValue = 'loading'
    this.errorValue = null
    this.notify()
    const started = performance.now()
    try {
      const gl = this.ensureGl()
      const loader = new GLTFLoader()
      const [roomGltf, charactersGltf, propsGltf, sceneryGltf] = await Promise.all([
        loader.loadAsync(url(scene.asset)),
        scene.characterAsset ? loader.loadAsync(url(scene.characterAsset)).catch((e) => { log.warn('characters failed', { reason: String(e) }); return null }) : null,
        scene.propAsset ? loader.loadAsync(url(scene.propAsset)).catch((e) => { log.warn('props failed', { reason: String(e) }); return null }) : null,
        scene.sceneryAsset ? loader.loadAsync(url(scene.sceneryAsset)).catch((e) => { log.warn('scenery failed', { reason: String(e) }); return null }) : null,
      ])
      if (generation !== this.loadGeneration || this.disposed) return
      const root = roomGltf.scene
      if (!root.getObjectByName('study_room')) throw new Error('Study room asset is missing node "study_room"')
      this.retroMaterials.length = 0
      this.uncutMaterials.clear()
      this.useRetroMaterials(root, !scene.look.pixelated)
      // 사람은 얼굴·옷이 그려진 텍스처라 선형으로 읽는다.
      if (charactersGltf) this.useRetroMaterials(charactersGltf.scene, true, false)
      if (propsGltf) this.useRetroMaterials(propsGltf.scene, true, false)
      this.kit = charactersGltf ? CharacterKit.from(charactersGltf.scene, propsGltf?.scene ?? null) : null
      let scenery: THREE.Object3D | null = null
      if (sceneryGltf) {
        scenery = sceneryGltf.scene
        scenery.name = 'room_outdoors_scenery_root'
        this.useRetroMaterials(scenery, false)
      }
      if (this.room) this.world.remove(this.room)
      if (this.scenery) this.world.remove(this.scenery)
      this.room = root
      this.scenery = scenery
      this.world.add(root)
      if (scenery) this.world.add(scenery)
      // 하늘 구(월드 고정). 앱 룩은 DOM 하늘을 쓰므로 만들지 않는다. 창문은 자리들이 가장 많이 바라보는 쪽에 있다.
      if (this.look !== 'app') {
        this.world.add(this.sky.mesh)
        const counts = new Map<number, number>()
        for (const seat of scene.seats) { const k = Math.round(seat.yaw * 100) / 100; counts.set(k, (counts.get(k) ?? 0) + 1) }
        this.windowYaw = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0
        this.skyKey = ''
      }
      // 셰이더를 미리 컴파일한다(원본 _probeDraw: 첫 화면에서 파이프라인 비용을 치르지 않게).
      gl.compile(this.world, this.camera)
      this.phaseValue = 'ready'
      this.rebuild()
      log.info('loaded', { elapsed_ms: Math.round(performance.now() - started) })
    } catch (e) {
      if (generation !== this.loadGeneration || this.disposed) return
      log.error('load failed', { reason: e instanceof Error ? e.message : String(e) })
      this.phaseValue = 'failed'
      this.errorValue = e
    }
    this.notify()
  }

  /** 언릿 재질을 질감 셰이더 재질로(텍스처별·바깥 여부별로 하나씩 공유). */
  /** cel: 그늘 두 단 나누기. 사람·소품은 면이 적어 그늘이 각져 보이므로 끈다(채도·외곽선만). */
  private useRetroMaterials(root: THREE.Object3D, smooth: boolean, cel = true) {
    const byKey = new Map<string, THREE.ShaderMaterial>()
    const visit = (node: THREE.Object3D, outdoorsAbove: boolean) => {
      const outdoors = outdoorsAbove || node.name.startsWith('room_outdoors')
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh
        const swap = (material: THREE.Material) => {
          const map = (material as THREE.MeshBasicMaterial).map ?? null
          const key = `${map?.uuid ?? 'none'}:${outdoors}`
          let retro = byKey.get(key)
          if (!retro) {
            retro = createRetroMaterial(map, smooth, this.look !== 'app')
            if (this.look === 'toon') setToon(retro, cel ? { ...toonDefault, rim: 0.12 } : { ...toonDefault, shade: 1 })
            if (this.look === 'soft') setSoft(retro, cel ? 0.16 : 0.08)
            if (this.look === 'vivid') setVivid(retro, cel ? 0.12 : 0.06)
            byKey.set(key, retro)
            this.retroMaterials.push(retro)
            if (outdoors) this.uncutMaterials.add(retro)
          }
          return retro
        }
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
      }
      for (const child of node.children) visit(child, outdoors)
    }
    visit(root, false)
  }

  setLayout(layout: StudyRoomLayout, characters: readonly (StudyRoomCharacter | null)[]) {
    const same = layout === this.layout && characters.length === this.characters.length &&
      characters.every((c, i) => c === this.characters[i] || (c != null && this.characters[i] != null && c.equals(this.characters[i]!)))
    if (same) return
    this.layout = layout
    this.characters = characters
    if (this.phaseValue === 'ready') {
      this.rebuild()
      this.notify()
    }
  }

  private rebuild() {
    if (this.people) this.world.remove(this.people)
    this.people = null
    this.seatPeople = []
    this.lastLookKey = null
    const layout = this.layout
    if (!layout) return
    const people = new THREE.Group()
    people.name = 'study_room_people'
    for (let seat = 0; seat < layout.seatCount; seat++) {
      const character = seat < this.characters.length ? this.characters[seat] : null
      let seated: SeatedPerson | null = null
      if (character) {
        const s = layout.seat(seat)
        const person = this.kit?.assemble(character, s.kind) ?? null
        if (person) {
          person.node.position.set(s.x, s.y, s.z)
          person.node.rotation.set(0, s.yaw, 0)
          people.add(person.node)
          seated = person
        }
      }
      this.seatPeople.push(seated)
    }
    this.world.add(people)
    this.people = people
  }

  /** 창밖 하늘(카툰 룩에서만 장면 배경으로 쓴다). */
  setDaylight(daylight: StudyRoomDaylight) {
    this.daylight = daylight
    this.skyKey = ''
  }

  private updateSky() {
    if (this.look === 'app' || !this.daylight) return
    const key = `${this.daylight.hour}:${this.windowYaw}`
    if (key === this.skyKey) return
    this.skyKey = key
    this.sky.setDaylight(this.daylight, this.windowYaw)
  }

  setLook(look: StudyRoomLook) {
    this.timeLook = look
    const spec = this.spec
    if (!spec || spec.look.equals(look)) return
    this.spec = spec.withLook(look)
    this.lastLookKey = null
    this.notify()
  }

  private updateLook(rig: StudyRoomCameraRig, cutHeight: number) {
    const spec = this.spec?.look
    if (!spec || this.retroMaterials.length === 0) return
    const focus = rig.eye.clone().sub(rig.camera.target).length()
    const plain = retroFloats({
      fogColor: [spec.fogColor.r, spec.fogColor.g, spec.fogColor.b],
      // 카툰 룩은 먼 곳을 덜 뿌옇게(안개 절반) 해 색을 또렷하게 둔다.
      fogAmount: this.look !== 'app' ? spec.fogAmount * 0.5 : spec.fogAmount,
      fogNear: focus + spec.fogStart,
      fogFar: focus + spec.fogEnd,
      colorLevels: spec.colorLevels,
      dither: spec.dither,
      brightness: spec.brightness,
      tint: [spec.tint.r, spec.tint.g, spec.tint.b],
      // 음수면 채도를 더한다. 원본 clamp(-0.6, 1.0).
      desaturate: Math.min(1, Math.max(-0.6, 1 - spec.saturation)),
      cutHeight,
      contrast: spec.contrast,
    })
    const key = plain.join(',')
    if (key === this.lastLookKey) return
    this.lastLookKey = key
    const outdoor = spec.outdoorLight
    const uncut = plain.slice()
    uncut[6] = 0
    uncut[12] = plain[12]! * outdoor.r
    uncut[13] = plain[13]! * outdoor.g
    uncut[14] = plain[14]! * outdoor.b
    for (const m of this.retroMaterials) setRetroFloats(m, this.uncutMaterials.has(m) ? uncut : plain)
  }

  /**
   * 한 장면을 그린다. 원본 _ScenePainter.paint: 보이는 자리 사람만 그 시각 자세로, 품질 단계 해상도로.
   * 돌려주는 값은 그린 사람 수와 걸린 시간(ms).
   */
  render(opts: {
    camera: StudyRoomCamera
    width: number
    height: number
    devicePixelRatio: number
    motionSeconds: number
    quality: StudyRoomQuality
    hiddenSeat: number | null
    cutHeight: number
  }): { drawn: number; ms: number } | null {
    const gl = this.gl
    const spec = this.spec
    if (this.phaseValue !== 'ready' || !gl || !spec || opts.width <= 0 || opts.height <= 0 || this.contextLost) return null
    const started = performance.now()
    const size = { width: opts.width, height: opts.height }
    const rig = new StudyRoomCameraRig(opts.camera, size)
    let drawn = 0
    const layout = this.layout
    if (layout && layout.seatCount === this.seatPeople.length) {
      const visible = StudyRoomSeatCulling.visibleSeats(layout, rig)
      this.seatPeople.forEach((person, seat) => {
        if (!person) return
        const shown = visible[seat] === true && seat !== opts.hiddenSeat
        person.node.visible = shown
        if (!shown) return
        person.pose(opts.motionSeconds)
        drawn++
      })
    }
    this.updateLook(rig, opts.cutHeight)
    // 내부 해상도: 부드러운 장면은 가로가 smoothWidth를 넘지 않게(기기보다 크게는 그리지 않음).
    // 카툰 룩(픽셀 느낌 없음): 높은·중간 단계는 기기 해상도(최대 2배), 낮은 단계만 원본 상한을 쓴다.
    const crisp = this.look !== 'app' && (opts.quality.name === 'high' || opts.quality.name === 'medium')
    const pixelRatio = crisp
      ? Math.min(opts.devicePixelRatio, 2)
      : spec.look.pixelated
      ? opts.devicePixelRatio / Math.max(1, Math.round((opts.width * opts.devicePixelRatio) / opts.quality.pixelWidth))
      : Math.min(opts.devicePixelRatio, opts.quality.smoothWidth / opts.width)
    if (gl.getPixelRatio() !== pixelRatio) gl.setPixelRatio(pixelRatio)
    const canvasSize = gl.getSize(new THREE.Vector2())
    if (canvasSize.x !== opts.width || canvasSize.y !== opts.height) gl.setSize(opts.width, opts.height, false)
    this.canvas.style.imageRendering = spec.look.pixelated && this.look === 'app' ? 'pixelated' : 'auto'
    // 원본 카메라 행렬과 같은 화면: 같은 fov·aspect로 eye에서 target을 본다(깊이 범위만 WebGL 규약).
    this.camera.fov = opts.camera.fovYDegrees
    this.camera.aspect = opts.width / opts.height
    // 가까운 면을 0.3으로: 창틀·문틀·벽·그림처럼 거의 겹친 면의 깊이 경쟁(z-fighting)을 줄인다(0.1이면 정밀도가 3배 모자란다).
    this.camera.near = 0.3
    this.camera.far = 80
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(rig.eye)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(opts.camera.target)
    if (this.composer) {
      this.updateSky()
      this.sky.follow(this.camera)
      this.composer.setSize(Math.round(opts.width * pixelRatio), Math.round(opts.height * pixelRatio))
      // 감성 후처리: 높은 단계는 전부, 중간은 심도 없이, 낮은 단계는 외곽선만.
      const q = opts.quality.name
      const d = this.daylight
      // 해가 떠 있으면 아침·저녁도 0.5 이상(밝은 하늘), 한낮 1. 해는 아침엔 왼쪽, 오후엔 오른쪽에서 든다.
      const day = d?.sunUp ? 0.5 + 0.5 * d.sunHeight : 0
      const sunX = d?.sunUp ? -0.15 + 1.3 * d.arc : 0.82
      const vignette = this.look === 'soft' ? 0.18 : this.look === 'vivid' ? 0.12 : 0.1
      const mood: MoodLook | null = q === 'high' ? { bloom: this.look === 'vivid' ? 0.35 : 0.55, depthOfField: true, grain: this.look === 'vivid' ? 0 : 0.015, vignette, ao: true, day, sunX }
        : q === 'medium' ? { bloom: this.look === 'vivid' ? 0.35 : 0.55, depthOfField: false, grain: this.look === 'vivid' ? 0 : 0.015, vignette, ao: false, day, sunX }
        : null
      const focus = rig.eye.distanceTo(opts.camera.target)
      this.composer.render(gl, this.world, this.camera, pixelRatio, focus, mood)
    } else {
      gl.render(this.world, this.camera)
    }
    return { drawn, ms: performance.now() - started }
  }

  private onContextLost = (e: Event) => {
    e.preventDefault()
    this.contextLost = true
    log.warn('webgl context lost')
  }

  private onContextRestored = () => {
    this.contextLost = false
    log.info('webgl context restored')
    // 텍스처·셰이더는 three가 다시 올린다. 질감 값만 다시 넘긴다.
    this.lastLookKey = null
    this.notify()
  }

  dispose() {
    this.disposed = true
    this.loadGeneration++
    this.listeners.clear()
    this.world.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.geometry.dispose()
    })
    for (const m of this.retroMaterials) {
      ;(m.uniforms.base_color_texture?.value as THREE.Texture | undefined)?.dispose()
      m.dispose()
    }
    this.composer?.dispose()
    this.sky.dispose()
    this.gl?.dispose()
    this.gl = null
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
  }
}
