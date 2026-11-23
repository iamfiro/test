// 원본: widgets/study_subject_palette.dart, timer/store/study_settings_store.dart colorIndexOf (PocketTime f574f242).
// 순서가 곧 저장되는 색 번호다.
import type { StudySettings } from './settingsStore'

export const studySubjectColors = [
  { fill: '#FFCDEE', ink: '#AD3D8C' }, // 분홍
  { fill: '#D4F9A9', ink: '#3F7514' }, // 연두
  { fill: '#B4F5FA', ink: '#137C86' }, // 하늘
  { fill: '#FFE9A6', ink: '#8A6500' }, // 노랑
  { fill: '#FFD6BF', ink: '#B0501B' }, // 주황
  { fill: '#E2D7FF', ink: '#5B45B0' }, // 보라
  { fill: '#CFE0FF', ink: '#2F5CB0' }, // 파랑
  { fill: '#ECEBF1', ink: '#5C5B63' }, // 회색
] as const

/** 저장된 색이 없으면 이름의 UTF-16 코드 합(원본 name.codeUnits.fold). */
export function colorIndexOf(settings: StudySettings, name: string): number {
  const saved = settings.subject_colors[name]
  if (saved !== undefined) return saved
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return sum
}

export function subjectColorOf(settings: StudySettings, name: string) {
  return studySubjectColors[colorIndexOf(settings, name) % studySubjectColors.length]!
}
