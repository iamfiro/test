// 개발 목: 공부방 목록. 문구는 PocketTime 디버그 목(lib/feature/study/room/debug/study_room_repository_mock.dart)과 같다.
// 검색(q)은 계약대로 "서버가" 거르는 동작을 흉내 낸다(화면은 거르지 않는다).
import { http } from 'msw/http'
import type { components } from '../core/api/schema'
import { API, ok } from './util'

type Room = components['schemas']['Room']

const room = (id: string, name: string, description: string, host: string, capacity: number, members: number, studying: number, mine = false): Room => ({
  id, name, description, has_password: false, capacity: Math.min(capacity, 33), map: 'cafe',
  member_count: members, studying_count: studying, is_member: mine, is_host: mine && host === '추운 비버',
  host_nickname: host, created_at: '2026-11-10T00:00:00Z', banner: null, logo: null,
})

const rooms: Room[] = [
  room('r1', '우리 반 공부방', '우리 반 친구들끼리 조용히 공부하는 방', '추운 비버', 33, 9, 3, true),
  room('r2', '새벽 5시 기상 스터디', '매일 새벽 5시에 모여서 아침 공부로 하루를 시작해요.', '새벽공부', 30, 18, 7),
  room('r3', '도서관 마감까지', '도서관 문 닫을 때까지 같이 버텨요. 쉬는 시간은 10분!', '도서관지박령', 33, 31, 23),
  room('r4', '수학 문제집 같이 풀기', '쎈·블랙라벨 풀면서 막히는 문제는 같이 고민해요.', '수학은재밌어', 10, 10, 4),
  room('r5', '기말고사 D-30', '기말고사까지 한 달, 매일 3시간 이상 공부하는 방이에요.', '독서실요정', 33, 27, 11),
  room('r6', '영단어 백 개 챌린지', '하루 영단어 100개 외우기 챌린지에 함께해요.', '영단어백개', 20, 6, 0),
]

export const roomHandlers = [
  http.get(`${API}/study-rooms`, ({ request }) => {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope')
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    let list = scope === 'mine' ? rooms.filter((r) => r.is_member) : rooms
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q))
    return ok({ rooms: list })
  }),
]
