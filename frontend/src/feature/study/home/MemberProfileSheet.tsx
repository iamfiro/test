// 공부방에서 캐릭터를 누르면 나오는 프로필 시트(사용자 결정 2026-11-23: 공개 태그를 여기서 보인다).
// 지금 웹 공부방에는 나만 앉아 있어 내 프로필만 열린다. 다른 사람(방 멤버)이 붙으면 같은 시트에
// 앱 studyMember*(이번 세션·방 순위·신고·친구 요청) 칸을 더한다.
import type { components } from '../../../core/api/schema'
import { PaperSheet } from '../../../core/ui/PaperSheet'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import s from './memberProfile.module.css'

type Profile = components['schemas']['Profile']

export function MemberProfileSheet(props: { profile: Profile; mine: boolean; onDismiss: () => void }) {
  const { profile } = props
  return (
    <PaperSheet label={t('studyMemberOpen', { nickname: profile.nickname })} onDismiss={props.onDismiss}>
      <div className={s.sheet}>
        <div className={s.head}>
          <h2 className={s.name}>{profile.nickname}</h2>
          {props.mine && <span className={s.me}>{webText.memberMe}</span>}
        </div>
        <h3 className={s.label}>{webText.memberTags}</h3>
        {profile.tags.length > 0 ? (
          <ul className={s.tags}>
            {profile.tags.map((tag) => <li key={tag.id} className={s.tag}>#{tag.name}</li>)}
          </ul>
        ) : (
          <p className={s.empty}>{webText.memberTagsEmpty}</p>
        )}
      </div>
    </PaperSheet>
  )
}
