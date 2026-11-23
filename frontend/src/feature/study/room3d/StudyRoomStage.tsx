import { useMemo } from 'react'
import { useSession } from '../../auth/session'
import { StudyRoom3dScenes } from './scenes'
import { StudyRoom3dView } from './StudyRoom3dView'
import { studyRoomCharacterOf } from './participantCharacter'
import { StudyRoomQualityController } from './domain/qualityController'
import { LocalStorageStudyRoomQualityStore } from './infrastructure/localStorageQualityStore'
import type { StudyRoomCameraMode } from './domain/seatCamera'

/**
 * 공부 탭의 3D 방(원본 StudyHomePage._room3dBody). 공부방 멤버는 공부방 화면을 붙일 때 더한다.
 * 지금은 나 혼자(원본 릴리스 빌드에서 방을 고르지 않았을 때와 같음).
 */
export function StudyRoomStage(props: { cameraMode: StudyRoomCameraMode; topInset: number }) {
  const { state } = useSession()
  const me = state.status === 'signedIn' ? state.me : null
  const quality = useMemo(() => {
    const c = new StudyRoomQualityController({ store: new LocalStorageStudyRoomQualityStore() })
    void c.load()
    return c
  }, [])
  const characters = useMemo(
    () => (me ? [studyRoomCharacterOf({ userId: me.id, avatar: me.profile.avatar, gender: me.profile.gender, presence: 'away' })] : []),
    [me],
  )
  return (
    <StudyRoom3dView
      scene={StudyRoom3dScenes.cafe}
      seatCount={characters.length}
      characters={characters}
      cameraMode={props.cameraMode}
      quality={quality}
      topInset={props.topInset}
      seatsAtHead
      seatBuilder={() => null}
      placeholder={<div style={{ position: 'absolute', inset: 0, background: '#F3E1DC' }} />}
    />
  )
}
