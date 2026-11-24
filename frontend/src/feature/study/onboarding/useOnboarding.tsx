// 첫 가입 온보딩(웹 전용, 사용자 결정 2026-11-23; docs/plan/onboarding-prompt.md).
// 1–3단계(캐릭터·이름·목표 태그)는 공부방 문밖 잔디에서, 4단계는 방 안 공부 탭 위 코치 마크로 진행한다.
// 대상: 서버 Me.onboarding_completed_at이 null인 사람. 성별이 이미 저장돼 있으면(앞에서 저장하고 나감) 4단계부터.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSession, type Me } from '../../auth/session'
import { useToast } from '../../../core/ui/Toast'
import { webText } from '../../../l10n/web_ko'
import { studyRoomCharacterOf } from '../room3d/participantCharacter'
import { StudyRoom3dScenes } from '../room3d/scenes'
import type { ActorPlacement, StudyRoomCinematic } from '../room3d/StudyRoom3dView'
import type { Tag } from '../tags/tagsStore'
import { entranceSeats, OnboardingScene, type Gender } from './onboardingScene'
import { OnboardingSaver, OnboardingSaveError, nicknameProblem } from './onboardingSave'
import { OnboardingPanel, ActorHit, NamePlate, SkipEntrance } from './OnboardingPanel'
import { CoachMarks } from './CoachMarks'

export type OnboardingPhase = 'pick' | 'name' | 'goal' | 'entering' | 'tour'
const stepIndex: Record<OnboardingPhase, number> = { pick: 1, name: 2, goal: 3, entering: 4, tour: 4 }
export const onboardingSteps = 4

export type Onboarding = {
  phase: OnboardingPhase
  /** 공부 탭 UI(타이머·버튼·탭바)를 숨긴다(1–3단계와 걸어 들어오는 동안). */
  hidesStudyUi: boolean
  stage: {
    cinematic: StudyRoomCinematic | null
    actorOverlay: ((p: ActorPlacement) => ReactNode | null) | undefined
    seatChoices: readonly number[] | null
    onSeat: (mapSeat: number) => void
  }
  overlay: ReactNode
}

/** 온보딩 대상이 아니면 null. */
export function useOnboarding(enabled: boolean): Onboarding | null {
  const { state, replaceMe } = useSession()
  const toast = useToast()
  const me = state.status === 'signedIn' ? state.me : null
  const pending = me != null && me.onboarding_completed_at == null
  const [phase, setPhase] = useState<OnboardingPhase | null>(() => (pending ? (me!.profile.gender == null ? 'pick' : 'tour') : null))

  const [gender, setGender] = useState<Gender | null>(me?.profile.gender ?? null)
  const [name, setName] = useState(me?.profile.nickname ?? '')
  const [nameTouched, setNameTouched] = useState(false)
  const [nameServerProblem, setNameServerProblem] = useState(false)
  const [tags, setTags] = useState<Tag[]>(me?.profile.tags ?? [])
  const [saving, setSaving] = useState(false)
  const saver = useMemo(() => new OnboardingSaver(), [])
  // 세션을 읽기 전에 붙었으면 읽은 뒤 시작한다. 단계는 한 번만 정한다(저장 뒤 Me가 바뀌어도 흐름을 다시 시작하지 않는다).
  useEffect(() => {
    if (!pending) { setPhase(null); return }
    if (phase != null || !me) return
    setPhase(me.profile.gender == null ? 'pick' : 'tour')
    setGender(me.profile.gender)
    setName(me.profile.nickname)
    setTags(me.profile.tags)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])
  const seat = useRef<number | null>(null)
  const reduceMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])

  const scene = useMemo(() => {
    if (!me) return null
    const of = (g: Gender) => studyRoomCharacterOf({ userId: me.id, avatar: me.profile.avatar, gender: g, presence: 'away' })
    return new OnboardingScene({ male: of('male'), female: of('female') }, reduceMotion)
    // 캐릭터 모습은 처음 계정 값으로 고정한다(저장 뒤 Me가 바뀌어도 같은 사람).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, reduceMotion])

  const outside = phase === 'pick' || phase === 'name' || phase === 'goal'
  useEffect(() => {
    if (scene && outside) scene.set(phase, gender)
  }, [scene, outside, phase, gender])

  const cinematic = useMemo(() => (scene && (outside || phase === 'entering') ? { frame: scene.frame } : null), [scene, outside, phase])

  if (!enabled || !me || !scene || phase == null) return null

  const problem = nicknameProblem(name)
  const save = async (tagIds: string[]) => {
    if (saving || !gender) return
    if (problem) { setPhase('name'); setNameTouched(true); return }
    setSaving(true)
    try {
      const next = await saver.saveProfile(me, { gender, nickname: name, tagIds })
      replaceMe(next)
      const mapSeat = seat.current ?? entranceSeats[0]!
      setPhase('entering')
      scene.startEntrance(StudyRoom3dScenes.cafe.seats[mapSeat]!, () => {
        window.setTimeout(() => setPhase('tour'), reduceMotion ? 0 : 1050)
      })
    } catch (e) {
      const field = e instanceof OnboardingSaveError ? e.field : null
      if (field === 'nickname') { setNameServerProblem(true); setPhase('name') }
      toast(webText.onboardingSaveFailed, { type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const finish = async () => {
    try {
      const next: Me = await saver.complete()
      replaceMe(next)
    } catch {
      toast(webText.onboardingSaveFailed, { type: 'error' })
      throw new Error('complete failed')
    }
  }

  const actorOverlay = (p: ActorPlacement): ReactNode | null => {
    if (phase === 'pick') return <ActorHit placement={p} gender={p.id as Gender} selected={gender === p.id} onPick={setGender} />
    if (phase === 'name' || phase === 'goal') return <NamePlate placement={p} name={name.trim()} tags={phase === 'goal' ? tags : []} />
    return null
  }

  let overlay: ReactNode = null
  if (outside) {
    overlay = (
      <OnboardingPanel
        phase={phase}
        step={stepIndex[phase]}
        total={onboardingSteps}
        gender={gender}
        onGender={setGender}
        name={name}
        onName={(v) => { setName(v); setNameServerProblem(false) }}
        nameProblem={nameServerProblem ? 'invalid' : nameTouched ? problem : null}
        onNameBlur={() => setNameTouched(true)}
        tags={tags}
        onTags={setTags}
        saving={saving}
        onBack={() => setPhase(phase === 'goal' ? 'name' : 'pick')}
        onNext={() => {
          if (phase === 'pick' && gender) setPhase('name')
          else if (phase === 'name') { setNameTouched(true); if (!problem) setPhase('goal') }
        }}
        onEnter={() => void save(tags.map((t) => t.id))}
        onSkipGoal={() => void save(me.profile.tags.map((t) => t.id))}
        onFreeArea={(area) => scene.setFreeArea(area)}
      />
    )
  } else if (phase === 'entering') {
    overlay = <SkipEntrance onSkip={() => scene.skipEntrance()} />
  } else if (phase === 'tour') {
    overlay = <CoachMarks onDone={finish} />
  }

  return {
    phase,
    hidesStudyUi: outside || phase === 'entering',
    stage: {
      cinematic,
      actorOverlay: outside ? actorOverlay : undefined,
      seatChoices: outside || phase === 'entering' ? entranceSeats : null,
      onSeat: (mapSeat) => { seat.current = mapSeat },
    },
    overlay,
  }
}
