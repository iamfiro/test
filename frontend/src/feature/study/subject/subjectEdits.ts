// 과목 목록 바꾸기. 결과는 서버에 PUT할 설정 전체이고, 화면 반영은 서버 응답 뒤(settingsStore)에 한다.
// 이름 규칙은 계약(PUT /users/me/study-settings): 앞뒤 공백을 지운 뒤 1–20자, 서로 다름, 최대 50개.
import type { StudySettings } from '../timer/settingsStore'
import { colorIndexOf, studySubjectColors } from '../timer/subjectPalette'

export const subjectNameMax = 20
export const subjectCountMax = 50

export type SubjectNameProblem = 'empty' | 'tooLong' | 'taken'

/** 입력한 이름의 문제. `except`는 이름을 바꾸는 중인 원래 이름(자기 자신과는 겹쳐도 된다). */
export function subjectNameProblem(settings: StudySettings, raw: string, except: string | null = null): SubjectNameProblem | null {
  const name = raw.trim()
  if (name.length === 0) return 'empty'
  if (name.length > subjectNameMax) return 'tooLong'
  if (name !== except && settings.subjects.includes(name)) return 'taken'
  return null
}

/**
 * 새 과목을 목록 끝에 넣는다. 색을 고르지 않았으면(null) 저장하지 않고 원본 규칙(이름 코드 합)을 따른다.
 */
export function addSubject(settings: StudySettings, raw: string, color: number | null): StudySettings {
  const name = raw.trim()
  return {
    ...settings,
    subjects: [...settings.subjects, name],
    subject_colors: color == null ? settings.subject_colors : { ...settings.subject_colors, [name]: color },
  }
}

/** 이름·색을 바꾼다. 자리·고른 과목은 새 이름으로 따라간다. */
export function editSubject(settings: StudySettings, from: string, raw: string, color: number): StudySettings {
  const name = raw.trim()
  const colors = { ...settings.subject_colors }
  delete colors[from]
  colors[name] = color
  return {
    ...settings,
    subjects: settings.subjects.map((x) => (x === from ? name : x)),
    subject: settings.subject === from ? name : settings.subject,
    subject_colors: colors,
  }
}

/** 지운다. 고른 과목이었으면 과목 없음이 된다. */
export function removeSubject(settings: StudySettings, name: string): StudySettings {
  const colors = { ...settings.subject_colors }
  delete colors[name]
  return {
    ...settings,
    subjects: settings.subjects.filter((x) => x !== name),
    subject: settings.subject === name ? null : settings.subject,
    subject_colors: colors,
  }
}

/** 고르기. null이면 과목 없음. */
export function selectSubject(settings: StudySettings, name: string | null): StudySettings {
  return { ...settings, subject: name }
}

/** 그 이름이 지금 보이는 색 번호(0–7): 저장된 색, 없으면 원본 규칙(이름 코드 합). */
export function initialColorOf(settings: StudySettings, name: string): number {
  return colorIndexOf(settings, name) % studySubjectColors.length
}
