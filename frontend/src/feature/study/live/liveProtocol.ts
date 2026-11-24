// 방 실시간 상태 이벤트 모양. 계약: docs/contracts/study-room-live.md (0.1.0). 채팅과 같은 소켓·같은 토픽(`room:<id>`)으로 온다.
import type { components } from '../../../core/api/schema'

type Avatar = components['schemas']['Avatar']
type Tag = components['schemas']['Tag']
type RoomImage = { id: string; url: string }

/** 보는 사람과 상관없는 방 값. 멤버 여부·인원은 HTTP 상세로 읽는다. */
export type LiveRoom = {
  id: string
  name: string
  description: string | null
  map: string
  capacity: number
  has_password: boolean
  host_user_id: string
  banner: RoomImage | null
  logo: RoomImage | null
  tags: Tag[]
}

/** 서버 판정 상태(앱 StudyPresence와 같은 뜻): 공부 중·쉬는 중·자리 비움. */
export type LiveStatus = 'studying' | 'paused' | 'away'

export type LiveMember = {
  user_id: string
  nickname: string
  avatar: Avatar
  gender: 'male' | 'female' | null
  /** 3D 맵 자리 번호 0–32(scenes.ts cafeSeats 순서). */
  seat: number
  is_host: boolean
  status: LiveStatus
  /** as_of(서버 시각) 기준 이번 세션 공부한 초. 세션이 없으면 0. */
  session_seconds: number
  as_of: string
  /** 오늘 끝낸 기록의 합(진행 중 세션 제외). */
  today_seconds: number
  /** 방 안 실시간 순위. 없으면 null. 화면은 이 값으로만 순위를 그린다. */
  rank: number | null
}

export type LiveLeftReason = 'left' | 'removed' | 'account_deleted'

export type RoomLiveEvent =
  | { type: 'room_state'; topic: string; seq: number; server_time: string; room: LiveRoom; members: LiveMember[] }
  | { type: 'member_joined'; topic: string; seq: number; member: LiveMember }
  | { type: 'member_updated'; topic: string; seq: number; member: LiveMember }
  | { type: 'member_left'; topic: string; seq: number; user_id: string; reason: LiveLeftReason }
  | { type: 'room_updated'; topic: string; seq: number; room: LiveRoom }
  | { type: 'room_deleted'; topic: string; seq: number }

const liveTypes = new Set<string>(['room_state', 'member_joined', 'member_updated', 'member_left', 'room_updated', 'room_deleted'])

export function isRoomLiveEvent(e: { type: string }): e is RoomLiveEvent {
  return liveTypes.has(e.type)
}
