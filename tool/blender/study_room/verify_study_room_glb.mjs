// 공부방 GLB 계약 검사(의존성 없음).
//   node tool/blender/study_room/verify_study_room_glb.mjs [glb 경로...]
// 기본은 study_room.glb와 study_room_v2.glb 둘 다. 검사 항목:
// - 삼각형 합계(≤ 45,000), 텍스처 크기(≤ 2048²), 파일 크기(≤ 4.5MB) — v2 예산
// - 노드 이름: study_room 아래 room_shell·room_props·room_outdoors, seat_00–seat_32
// - seat_NN 위치·yaw가 frontend/src/feature/study/room3d/scenes.ts의 cafeSeats와 ±1cm·±0.01rad 이내
// - 뒤집힌 면: 꼭짓점 법선 평균과 면 법선이 반대인 삼각형 수
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..', '..')
const assets = path.join(root, 'frontend/public/assets/study_themes/cafe_room_3d')
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['study_room.glb', 'study_room_v2.glb'].map((f) => path.join(assets, f))
const BUDGET = { triangles: 45000, texture: 2048, bytes: 4.5e6 }

function cafeSeats() {
  const src = fs.readFileSync(path.join(root, 'frontend/src/feature/study/room3d/scenes.ts'), 'utf8')
  const block = src.slice(src.indexOf('const cafeSeats'), src.indexOf('];', src.indexOf('const cafeSeats')))
  return [...block.matchAll(/new StudyRoomSeat\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)/g)].map((m) => m.slice(1, 5).map(Number))
}

function readGlb(file) {
  const b = fs.readFileSync(file)
  const jsonLen = b.readUInt32LE(12)
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen + 8
  return { size: b.length, json, bin: b.subarray(binStart) }
}

function accessor(glb, index) {
  const a = glb.json.accessors[index]
  const view = glb.json.bufferViews[a.bufferView]
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type]
  const Type = { 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array, 5121: Uint8Array }[a.componentType]
  const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
  const buf = glb.bin.buffer.slice(glb.bin.byteOffset + offset, glb.bin.byteOffset + offset + a.count * comps * Type.BYTES_PER_ELEMENT)
  return { data: new Type(buf), comps, count: a.count }
}

function jpegSize(bytes) {
  for (let i = 2; i < bytes.length; ) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker >= 0xc0 && marker <= 0xc3) return [(bytes[i + 7] << 8) | bytes[i + 8], (bytes[i + 5] << 8) | bytes[i + 6]]
    i += 2 + len
  }
  return null
}

let failed = false
const check = (ok, label) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failed = true
}

const seats = cafeSeats()
for (const file of files) {
  const glb = readGlb(file)
  const { json } = glb
  console.log(`\n${path.basename(file)}`)
  let tris = 0
  let flipped = 0
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      const idx = accessor(glb, prim.indices)
      const pos = accessor(glb, prim.attributes.POSITION).data
      const nor = accessor(glb, prim.attributes.NORMAL).data
      tris += idx.count / 3
      for (let t = 0; t < idx.count; t += 3) {
        const [a, b, c] = [idx.data[t], idx.data[t + 1], idx.data[t + 2]]
        const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2]
        const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2]
        const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx
        const nx = nor[a * 3] + nor[b * 3] + nor[c * 3], ny = nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1], nz = nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]
        const area = Math.hypot(fx, fy, fz)
        if (area > 1e-9 && (fx * nx + fy * ny + fz * nz) / area < -0.2) flipped++
      }
    }
  }
  const textures = json.images.map((img) => {
    const v = json.bufferViews[img.bufferView]
    return jpegSize(glb.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)) ?? [0, 0]
  })
  console.log(`  triangles ${tris}, textures ${textures.map((t) => t.join('x')).join(', ')} (${json.images.map((i) => i.mimeType).join(', ')}), file ${(glb.size / 1e6).toFixed(2)} MB, materials ${json.materials.length}, meshes ${json.meshes.length}`)
  check(tris <= BUDGET.triangles, `triangles ≤ ${BUDGET.triangles}`)
  check(textures.every(([w, h]) => w <= BUDGET.texture && h <= BUDGET.texture), `textures ≤ ${BUDGET.texture}²`)
  check(glb.size <= BUDGET.bytes, `file ≤ ${BUDGET.bytes / 1e6} MB`)
  check(json.materials.every((m) => m.extensions?.KHR_materials_unlit && m.alphaMode === undefined), 'materials unlit, opaque')
  check(flipped === 0, `flipped faces: ${flipped}`)
  const byName = new Map(json.nodes.map((n, i) => [n.name, { ...n, i }]))
  const rootNode = byName.get('study_room')
  const children = new Set((rootNode?.children ?? []).map((i) => json.nodes[i].name))
  check(!!rootNode, 'node study_room')
  for (const name of ['room_shell', 'room_props', 'room_outdoors']) check(children.has(name), `study_room/${name}`)
  let worstPos = 0
  let worstYaw = 0
  let missing = 0
  seats.forEach(([x, y, z, yaw], i) => {
    const name = `seat_${String(i).padStart(2, '0')}`
    const n = byName.get(name)
    if (!n || !children.has(name)) {
      missing++
      return
    }
    const [tx, ty, tz] = n.translation ?? [0, 0, 0]
    const [, qy, , qw] = n.rotation ?? [0, 0, 0, 1]
    const nodeYaw = 2 * Math.atan2(qy, qw)
    const dyaw = Math.abs(Math.atan2(Math.sin(nodeYaw - yaw), Math.cos(nodeYaw - yaw)))
    worstPos = Math.max(worstPos, Math.hypot(tx - x, ty - y, tz - z))
    worstYaw = Math.max(worstYaw, dyaw)
  })
  check(missing === 0 && seats.length === 33, `seat_00–seat_32 present (${seats.length} in cafeSeats, missing ${missing})`)
  check(worstPos <= 0.01, `seat position max diff ${(worstPos * 100).toFixed(2)} cm (≤ 1 cm)`)
  check(worstYaw <= 0.01, `seat yaw max diff ${worstYaw.toFixed(4)} rad (≤ 0.01)`)
}
process.exit(failed ? 1 : 0)
