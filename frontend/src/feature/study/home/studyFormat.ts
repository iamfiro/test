// 원본: lib/feature/study/widgets/study_format.dart, StudyHomePage._cameraLabel
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import type { StudyRoomCameraMode } from '../room3d/domain/seatCamera'

/** "1시간 25분"·"25분" 같은 공부 시간. 1분 미만은 "0분"으로 보인다. */
export function formatStudyDuration(seconds: number): string {
  const total = Math.trunc(seconds)
  const hours = Math.trunc(total / 3600)
  const minutes = Math.trunc(total / 60) % 60
  if (hours === 0) return webText.commonDurationMinutes(minutes)
  if (minutes === 0) return webText.commonDurationHours(hours)
  return webText.commonDurationHoursMinutes(hours, minutes)
}

/** 타이머 숫자. 1시간 미만은 `mm:ss`, 넘으면 `h:mm:ss`. */
export function formatStudyClock(seconds: number): string {
  const safe = Math.max(0, Math.trunc(seconds))
  const hours = Math.trunc(safe / 3600)
  const minutes = String(Math.trunc(safe / 60) % 60).padStart(2, '0')
  const secs = String(safe % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${minutes}:${secs}` : `${minutes}:${secs}`
}

export function cameraLabel(mode: StudyRoomCameraMode): string {
  switch (mode) {
    case 'firstPerson': return t('studyRoomCameraFirstPerson')
    case 'thirdPerson': return t('studyRoomCameraThirdPerson')
    case 'top': return t('studyRoomCameraTop')
    case 'overview': return t('studyRoomCameraOverview')
    case 'roam': return t('studyRoomCameraRoam')
    case 'auto': return t('studyRoomCameraAuto')
  }
}
