// 개발 목: 태그 카탈로그·내 태그·태그 제안. 카탈로그는 docs/plan/study-tags.md 2절 시드와 같다.
// 정규화·별칭 매칭은 계약 listTags 설명을 흉내 낸다(실제 판정은 서버).
import { http } from 'msw/http'
import type { components } from '../core/api/schema'
import { API, fail, ok } from './util'

type Tag = components['schemas']['Tag']

const seed: [Tag['kind'], string, string[]][] = [
  ['exam', '수능', ['대학수학능력시험']],
  ['exam', '내신', ['중간고사', '기말고사']],
  ['exam', '토익', ['TOEIC']],
  ['exam', '토익스피킹', ['토스']],
  ['exam', '오픽', ['OPIc']],
  ['exam', '토플', ['TOEFL']],
  ['exam', '텝스', ['TEPS']],
  ['exam', 'JLPT', ['일본어능력시험']],
  ['exam', 'HSK', ['중국어능력시험']],
  ['exam', '한국사능력검정시험', ['한능검', '한국사']],
  ['exam', '정보처리기사', ['정처기']],
  ['exam', '컴퓨터활용능력', ['컴활']],
  ['exam', '공무원 9급', ['9급']],
  ['exam', '공무원 7급', ['7급']],
  ['exam', '경찰공무원', ['경찰']],
  ['exam', '소방공무원', ['소방']],
  ['exam', '교원임용', ['임용', '임용고시']],
  ['exam', '공인중개사', ['공중사']],
  ['exam', '공인회계사', ['CPA']],
  ['exam', '편입', ['편입학']],
  ['kind', '자격증', []],
  ['kind', '어학', ['외국어']],
  ['kind', '코딩', ['개발', '프로그래밍']],
  ['kind', '공무원', []],
  ['kind', '전공 공부', ['대학 공부']],
  ['kind', '취업 준비', ['취준']],
  ['kind', '독서', ['책']],
]

export const catalog: Tag[] = seed.map(([kind, name], i) => ({ id: `t${i + 1}`, kind, name }))
const aliases = new Map(seed.map(([, , a], i) => [`t${i + 1}`, a]))
export const tagByName = (name: string): Tag => {
  const tag = catalog.find((t) => t.name === name)
  if (!tag) throw new Error(`mock tag missing: ${name}`)
  return tag
}

const norm = (s: string) => s.normalize('NFC').replace(/#/g, '').trim().toLowerCase()

/** 내 태그(목 메모리). 처음엔 비어 있다. 새 목 계정으로 로그인하면 비운다. */
let myTagIds: string[] = []
export const myTags = () => catalog.filter((t) => myTagIds.includes(t.id))
export const resetMyTags = () => { myTagIds = [] }

export const tagHandlers = [
  http.get(`${API}/tags`, ({ request }) => {
    const q = new URL(request.url).searchParams.get('q')
    if (q == null) return ok({ tags: catalog })
    const n = norm(q)
    if (!n) return ok({ tags: [] })
    return ok({ tags: catalog.filter((t) => norm(t.name).includes(n) || (aliases.get(t.id) ?? []).some((a) => norm(a).includes(n))) })
  }),
  http.get(`${API}/users/me/tags`, () => ok({ tags: myTags() })),
  http.put(`${API}/users/me/tags`, async ({ request }) => {
    const body = (await request.json()) as { tag_ids: string[] }
    const ids = [...new Set(body.tag_ids)]
    if (ids.length > 5 || ids.some((id) => !catalog.some((t) => t.id === id))) return fail(422, 'VALIDATION_ERROR', 'invalid tag_ids')
    myTagIds = ids
    return ok({ tags: myTags() })
  }),
  http.post(`${API}/tag-suggestions`, async ({ request }) => {
    const body = (await request.json()) as { name: string }
    const name = body.name.trim()
    if (name.length < 1 || name.length > 20) return fail(422, 'VALIDATION_ERROR', 'invalid name')
    return ok({ name }, 201)
  }),
]
