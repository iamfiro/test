// 온보딩 1–3단계 화면(문밖 잔디 위). 카드 없이 화면 아래 검은 그라데이션 위에 흰 제목·설명과 단순한 알약 단추
// (사용자 결정 2026-11-24: "쓸데없는 모달 UI 없애고 아래 배경에 검은색 그라디언트"), 위에 진행 표시·뒤로.
import { useEffect, useRef } from 'react'
import { IconChevronLeft } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import type { ActorPlacement } from '../room3d/StudyRoom3dView'
import { TagPicker } from '../tags/MyTagsSheet'
import type { Tag } from '../tags/tagsStore'
import type { Gender } from './onboardingScene'
import type { NicknameProblem } from './onboardingSave'
import s from './onboarding.module.css'

const genderLabel = (g: Gender) => (g === 'male' ? t('studyOnboardingGenderMale') : t('studyOnboardingGenderFemale'))
const problemText: Record<NicknameProblem, string> = {
  empty: webText.onboardingNameEmpty,
  tooLong: webText.onboardingNameTooLong,
  invalid: webText.onboardingNameInvalid,
}

export function OnboardingPanel(props: {
  phase: 'pick' | 'name' | 'goal'
  step: number
  total: number
  gender: Gender | null
  onGender: (g: Gender) => void
  name: string
  onName: (v: string) => void
  nameProblem: NicknameProblem | null
  onNameBlur: () => void
  tags: Tag[]
  onTags: (tags: Tag[]) => void
  saving: boolean
  onBack: () => void
  onNext: () => void
  onEnter: () => void
  onSkipGoal: () => void
  /** 카드 위 빈 칸(px). 3D 카메라가 캐릭터를 이 칸에 둔다. */
  onFreeArea: (area: { top: number; bottom: number }) => void
}) {
  const { phase } = props
  const card = useRef<HTMLFormElement>(null)
  const onGender = useRef(props.onGender)
  onGender.current = props.onGender
  const gender = props.gender

  // 캐릭터 고르기: ←/→로 바꾼다(입력칸에 있지 않을 때).
  useEffect(() => {
    if (phase !== 'pick') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onGender.current('male')
      else if (e.key === 'ArrowRight') onGender.current('female')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  const header = useRef<HTMLElement>(null)
  const shade = useRef<HTMLDivElement>(null)
  const onFreeArea = useRef(props.onFreeArea)
  onFreeArea.current = props.onFreeArea
  useEffect(() => {
    const el = card.current
    if (!el) return
    const report = () => {
      const top = header.current?.getBoundingClientRect().bottom ?? 60
      const panelTop = el.getBoundingClientRect().top
      onFreeArea.current({ top: top + 8, bottom: panelTop - 8 })
      // 그라데이션은 글 칸 위로 140px 더 번진다.
      shade.current?.style.setProperty('--shade-height', `${window.innerHeight - panelTop + 140}px`)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    return () => { ro.disconnect(); window.removeEventListener('resize', report) }
  }, [])

  // 단계가 바뀌면 카드 제목으로 초점을 옮긴다(화면 읽기 프로그램이 새 단계를 읽게).
  useEffect(() => { card.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true }) }, [phase])

  const title = phase === 'pick' ? t('studyOnboardingGenderTitle') : phase === 'name' ? webText.onboardingNameTitle : webText.onboardingGoalTitle
  const description = phase === 'pick' ? t('studyOnboardingGenderDescription') : phase === 'name' ? webText.onboardingNameDescription : webText.onboardingGoalDescription

  return (
    <div className={s.root}>
      <header ref={header} className={s.top}>
        <span className={`${s.topSide} palette-day`}>
          {phase !== 'pick' && <IslandIconButton icon={IconChevronLeft} label={webText.onboardingBack} onClick={props.onBack} />}
        </span>
        <span className={s.progress} aria-label={t('studyOnboardingProgress', { total: props.total, current: props.step })}>
          {Array.from({ length: props.total }, (_, i) => <i key={i} className={i < props.step ? s.progressOn : undefined} />)}
        </span>
        <span className={s.topSide} />
      </header>
      <div ref={shade} className={s.shade} aria-hidden />
      <form
        ref={card}
        className={s.panel}
        onSubmit={(e) => {
          e.preventDefault()
          if (phase === 'goal') { if (props.tags.length > 0) props.onEnter() } else props.onNext()
        }}
      >
        <div className={s.body} key={phase}>
          <h1 className={s.title} tabIndex={-1}>{title}</h1>
          <p className={s.description}>{description}</p>
          {phase === 'pick' && (
            <div className={s.genders} role="radiogroup" aria-label={title}>
              {(['male', 'female'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={gender === g}
                  className={`${s.choice} ${gender === g ? s.choiceOn : ''}`}
                  onClick={() => props.onGender(g)}
                >
                  {genderLabel(g)}
                </button>
              ))}
            </div>
          )}
          {phase === 'name' && (
            <div className={s.nameField}>
              <input
                className={s.input}
                value={props.name}
                onChange={(e) => props.onName(e.target.value)}
                onBlur={props.onNameBlur}
                aria-label={webText.onboardingNameLabel}
                aria-invalid={props.nameProblem != null || undefined}
                aria-describedby="onboarding-name-problem"
                placeholder={webText.onboardingNameLabel}
                autoComplete="nickname"
                enterKeyHint="next"
                autoFocus
              />
              <p id="onboarding-name-problem" className={s.problem} role={props.nameProblem ? 'alert' : undefined}>
                {props.nameProblem ? problemText[props.nameProblem] : ''}
              </p>
            </div>
          )}
          {phase === 'goal' && <TagPicker picked={props.tags} onChange={props.onTags} resultsClassName={s.goalResults} tone="dark" />}
        </div>
        <div className={s.actions}>
          {phase === 'goal' && (
            <button type="button" className={s.secondary} disabled={props.saving} onClick={props.onSkipGoal}>{webText.onboardingSkip}</button>
          )}
          <button
            type="submit"
            className={s.primary}
            disabled={props.saving || (phase === 'pick' && !gender) || (phase === 'goal' && props.tags.length === 0)}
          >
            {phase === 'goal' ? webText.onboardingEnter : webText.onboardingNext}
          </button>
        </div>
      </form>
    </div>
  )
}

/** 1단계: 캐릭터 몸 위 누름 칸과 발밑 이름 알약(남자·여자). */
export function ActorHit(props: { placement: ActorPlacement; gender: Gender; selected: boolean; onPick: (g: Gender) => void }) {
  const { head, feet, pixelsPerMeter } = props.placement
  const width = Math.max(64, pixelsPerMeter * 0.62)
  return (
    <>
      <button
        type="button"
        className={s.actorHit}
        style={{ left: head.x - width / 2, top: head.y, width, height: Math.max(48, feet.y - head.y) }}
        aria-label={genderLabel(props.gender)}
        aria-pressed={props.selected}
        onClick={() => props.onPick(props.gender)}
      />
      <span className={`${s.actorLabel} ${props.selected ? s.actorLabelOn : ''}`} style={{ left: feet.x, top: feet.y + 6 }} aria-hidden>
        {genderLabel(props.gender)}
      </span>
    </>
  )
}

/** 2·3단계: 머리 위 이름표. 입력하는 대로 바뀌고, 3단계에서는 고른 태그가 아래 붙는다. */
export function NamePlate(props: { placement: ActorPlacement; name: string; tags: Tag[] }) {
  const { head } = props.placement
  return (
    <span className={s.plate} style={{ left: head.x, top: head.y - 6 }} aria-hidden>
      <span className={`${s.plateName} ${props.name ? '' : s.plateEmpty}`}>{props.name || webText.onboardingNameLabel}</span>
      {props.tags.length > 0 && (
        <span className={s.plateTags}>
          {props.tags.map((tag) => <span key={tag.id} className={s.plateTag}>#{tag.name}</span>)}
        </span>
      )}
    </span>
  )
}

/** 걸어 들어가는 동안 오른쪽 위 건너뛰기. */
export function SkipEntrance(props: { onSkip: () => void }) {
  return (
    <div className={s.skipEntrance}>
      <button type="button" className={s.secondary} onClick={props.onSkip}>{webText.onboardingSkip}</button>
    </div>
  )
}
