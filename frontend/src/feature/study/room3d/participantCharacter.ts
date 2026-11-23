// 원본: room3d/widgets/study_room_3d_seats.dart studyRoomCharacterOf, friend/widgets/avatar/friend_avatar_view.dart
// FriendAvatarPalette.base (PocketTime f574f242).
import type { components } from '../../../core/api/schema'
import { colorFromArgb } from './model/color'
import { StudyRoomCharacter, studyRoomCharacterSeed } from './model/character'

type Avatar = components['schemas']['Avatar']

const avatarBase: Record<Avatar['color'], number> = {
  orange: 0xffff7a3d,
  tangerine: 0xffffa62e,
  yellow: 0xffffd23f,
  mint: 0xff3fd9a4,
  blue: 0xff3d8bf2,
  purple: 0xff9c6bff,
  pink: 0xffff86c8,
  red: 0xffef3b3b,
  green: 0xff4cc25e,
  sky: 0xff5cc6ff,
}

export type StudyPresence = 'focusing' | 'resting' | 'away' | 'unknown'

export function studyRoomCharacterOf(p: { userId: string; avatar: Avatar; gender: 'male' | 'female' | null; presence: StudyPresence }) {
  return new StudyRoomCharacter({
    figure: p.gender === 'male' ? 'boy' : p.gender === 'female' ? 'girl' : null,
    shape: p.avatar.shape,
    eyes: p.avatar.eyes,
    mouth: p.avatar.mouth,
    accessory: p.avatar.accessory,
    color: colorFromArgb(avatarBase[p.avatar.color]),
    seed: studyRoomCharacterSeed(p.userId),
    mood: p.presence === 'resting' ? 'resting' : 'focusing',
  })
}
