// 원본: lib/feature/study/room3d/infrastructure/flutter_scene/flutter_scene_character_kit.dart (PocketTime f574f242)
// 캐릭터 GLB의 사람 모델(char_<figure>_rig)을 복제해 앉히고, 관절을 자세대로 돌린다.
import * as THREE from 'three'
import type { StudyRoomCharacter, StudyRoomFigure } from '../model/character'
import { studyRoomFigureValues } from '../model/character'
import {
  StudyRoomRoutine,
  type StudyRoomJoint,
  type StudyRoomPose,
  type StudyRoomProp,
  type StudyRoomSeatKind,
} from '../domain/motion'

const jointNames: Record<StudyRoomJoint, string> = {
  torso: 'torso',
  neck: 'neck',
  upperArmL: 'upper_arm_l',
  upperArmR: 'upper_arm_r',
  lowerArmL: 'lower_arm_l',
  lowerArmR: 'lower_arm_r',
  handL: 'hand_l',
  handR: 'hand_r',
  upperLegL: 'upper_leg_l',
  upperLegR: 'upper_leg_r',
  lowerLegL: 'lower_leg_l',
  lowerLegR: 'lower_leg_r',
}

type Mount = 'root' | 'torso' | 'hand'
const m4 = () => new THREE.Matrix4()
const tr = (x: number, y: number, z: number) => m4().makeTranslation(x, y, z)
const rx = (a: number) => m4().makeRotationX(a)
const ry = (a: number) => m4().makeRotationY(a)
const rz = (a: number) => m4().makeRotationZ(a)
const sc = (s: number) => m4().makeScale(s, s, s)

/** 물건 → (GLB 노드 이름, 붙는 곳, 그 곳 기준 자리). 원본 _placements 값 그대로. */
const placements: Record<StudyRoomProp, [string, Mount, THREE.Matrix4]> = {
  pencil: ['char_prop_pencil', 'hand', m4()],
  mugHand: ['prop_mug', 'hand', tr(0, -0.035, 0.0)],
  phone: ['prop_phone', 'hand', tr(0, 0.0, 0.02).multiply(rx(-0.9))],
  bookHeld: ['prop_book_held', 'torso', tr(0, 0.175, 0.178).multiply(rx(0.35))],
  notebookHeld: ['prop_notebook', 'torso', tr(-0.01, 0.2528, 0.2226).multiply(rx(-0.9)).multiply(sc(0.8))],
  mugDesk: ['prop_mug', 'root', tr(0.27, 0.272, 0.345)],
  notebookLap: ['prop_notebook', 'root', tr(0, 0.14, 0.27).multiply(rx(-0.25))],
  laptopLap: ['prop_laptop', 'root', tr(0, 0.13, 0.25).multiply(rx(-0.15))],
}

const leafPivot = 0.015 / 0.9510565162951535
const leafSweep = Math.PI - (2 * 18 * Math.PI) / 180
const leafAt = (amount: number) => tr(0, 0, -leafPivot).multiply(ry(-leafSweep * amount))

function setLocal(node: THREE.Object3D, matrix: THREE.Matrix4) {
  node.matrix.copy(matrix)
  node.matrix.decompose(node.position, node.quaternion, node.scale)
}

export class CharacterKit {
  private constructor(private readonly root: THREE.Object3D, private readonly props: THREE.Object3D | null) {}

  /** 사람 모델이 하나도 없으면 null. */
  static from(root: THREE.Object3D, props: THREE.Object3D | null): CharacterKit | null {
    const any = studyRoomFigureValues.some((f) => root.getObjectByName(rigName(f)) != null)
    return any ? new CharacterKit(root, props) : null
  }

  assemble(character: StudyRoomCharacter, seat: StudyRoomSeatKind): SeatedPerson | null {
    let figure = character.figure
    let rig = this.root.getObjectByName(rigName(figure))
    if (!rig) {
      // 원본과 같다: 그 모델이 없으면 있는 모델로.
      const found = studyRoomFigureValues.find((f) => this.root.getObjectByName(rigName(f)) != null)
      if (!found) return null
      figure = found
      rig = this.root.getObjectByName(rigName(figure))!
    }
    const prefix = `char_${figure}_`
    const person = rig.clone(true)
    person.name = 'person'
    const mounts: Record<Mount, THREE.Object3D | undefined> = {
      root: person,
      torso: person.getObjectByName(`${prefix}torso`),
      hand: person.getObjectByName(`${prefix}hold_r`),
    }
    const props = new Map<StudyRoomProp, THREE.Object3D>()
    for (const [prop, [name, mount, at]] of Object.entries(placements) as [StudyRoomProp, [string, Mount, THREE.Matrix4]][]) {
      const source = this.root.getObjectByName(name) ?? this.props?.getObjectByName(name)
      const parent = mounts[mount]
      if (!source || !parent) continue
      const node = source.clone(true)
      setLocal(node, at)
      node.visible = false
      parent.add(node)
      props.set(prop, node)
    }
    let leaf: THREE.Object3D | null = null
    const leafSource = this.props?.getObjectByName('prop_book_leaf')
    const book = props.get('bookHeld')
    if (leafSource && book) {
      leaf = leafSource.clone(true)
      setLocal(leaf, leafAt(0))
      book.add(leaf)
    }
    const joints = new Map<StudyRoomJoint, [THREE.Object3D, THREE.Matrix4]>()
    for (const [joint, name] of Object.entries(jointNames) as [StudyRoomJoint, string][]) {
      const node = person.getObjectByName(`${prefix}${name}`)
      if (node) {
        node.updateMatrix()
        joints.set(joint, [node, node.matrix.clone()])
      }
    }
    // 관절이 움직여 경계 상자 컬링이 맞지 않는다. 화면 밖 자리는 렌더러가 자리 단위로 숨긴다.
    person.traverse((o) => { o.frustumCulled = false })
    return new SeatedPerson(person, joints, props, leaf, new StudyRoomRoutine({ seed: character.seed, seat, mood: character.mood }))
  }
}

function rigName(figure: StudyRoomFigure) {
  return `char_${figure}_rig`
}

export class SeatedPerson {
  private leafAmount = 0
  private posedAt: number | null = null

  constructor(
    readonly node: THREE.Object3D,
    private readonly joints: Map<StudyRoomJoint, [THREE.Object3D, THREE.Matrix4]>,
    private readonly props: Map<StudyRoomProp, THREE.Object3D>,
    private readonly leaf: THREE.Object3D | null,
    private readonly routine: StudyRoomRoutine,
  ) {}

  pose(seconds: number) {
    if (seconds === this.posedAt) return
    this.posedAt = seconds
    this.applyPose(this.routine.poseAt(seconds))
  }

  applyPose(pose: StudyRoomPose) {
    for (const [joint, [node, rest]] of this.joints) {
      const a = pose.joint(joint)
      setLocal(node, rest.clone().multiply(ry(a.yaw).multiply(rx(a.pitch)).multiply(rz(a.roll))))
    }
    for (const [prop, node] of this.props) node.visible = pose.props.has(prop)
    if (this.leaf && pose.leaf !== this.leafAmount) {
      this.leafAmount = pose.leaf
      setLocal(this.leaf, leafAt(pose.leaf))
    }
  }
}
