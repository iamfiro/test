import { describe, expect, it } from 'vitest'
import type { StudySettings } from '../timer/settingsStore'
import { addSubject, editSubject, removeSubject, subjectNameProblem } from './subjectEdits'

// 사용자에게 보이는 것: 과목 이름을 바꾸거나 지워도 고른 과목·색이 엉뚱하게 남거나 사라지지 않는다.
const base: StudySettings = { daily_goal_minutes: null, subjects: ['국어', '수학'], subject: '수학', subject_colors: { 수학: 2 } }

describe('subject edits', () => {
  it('고른 과목의 이름을 바꾸면 고른 과목과 색이 새 이름을 따라간다', () => {
    const next = editSubject(base, '수학', ' 미적분 ', 5)
    expect(next.subjects).toEqual(['국어', '미적분'])
    expect(next.subject).toBe('미적분')
    expect(next.subject_colors).toEqual({ 미적분: 5 })
  })

  it('고른 과목을 지우면 과목 없음이 되고 색도 지운다', () => {
    const next = removeSubject(base, '수학')
    expect(next.subjects).toEqual(['국어'])
    expect(next.subject).toBeNull()
    expect(next.subject_colors).toEqual({})
  })

  it('색을 고르지 않고 만들면 색을 저장하지 않는다', () => {
    expect(addSubject(base, '영어', null).subject_colors).toEqual({ 수학: 2 })
  })

  it('이미 있는 이름은 막고, 자기 이름으로 다시 저장하는 것은 막지 않는다', () => {
    expect(subjectNameProblem(base, ' 국어 ')).toBe('taken')
    expect(subjectNameProblem(base, '수학', '수학')).toBeNull()
    expect(subjectNameProblem(base, '   ')).toBe('empty')
    expect(subjectNameProblem(base, 'ㄱ'.repeat(21))).toBe('tooLong')
  })
})
