// 온보딩 1–3단계 화면(문밖 잔디 위). 카드 없이 화면 아래 검은 그라데이션 위에 흰 제목·설명과 단순한 알약 단추
// (사용자 결정 2026-11-24: "쓸데없는 모달 UI 없애고 아래 배경에 검은색 그라디언트"), 위에 진행 표시·뒤로.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { IconChevronLeft, IconGenderFemale, IconGenderMale } from '@tabler/icons-react'
import { t } from '../../../l10n/t'
import { webText } from '../../../l10n/web_ko'
import { IslandIconButton } from '../../../core/ui/IslandIconButton'
import type { ActorPlacement } from '../room3d/StudyRoom3dView'
import { TagPicker } from '../tags/MyTagsSheet'
import type { Tag } from '../tags/tagsStore'
import type { Gender } from './onboardingScene'
import type { NicknameProblem } from './onboardingSave'
import { cloudMargin, cloudPath } from './thoughtCloud'
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
                  {g === 'male' ? <IconGenderMale size={40} stroke={2.2} aria-hidden /> : <IconGenderFemale size={40} stroke={2.2} aria-hidden />}
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
            // 캐릭터를 고르기 전에는 다음 단추를 숨긴다(자리는 그대로 두어 카메라 구도가 흔들리지 않게).
            className={`${s.primary} ${phase === 'pick' && !gender ? s.primaryHidden : ''}`}
            aria-hidden={(phase === 'pick' && !gender) || undefined}
            tabIndex={phase === 'pick' && !gender ? -1 : undefined}
            disabled={props.saving || (phase === 'pick' && !gender) || (phase === 'goal' && props.tags.length === 0)}
          >
            {phase === 'goal' ? webText.onboardingEnter : webText.onboardingNext}
          </button>
        </div>
      </form>
    </div>
  )
}

/** 1단계: 캐릭터 몸 위 누름 칸(보이지 않음). 발밑 남자·여자 알약은 사용자 요청(2026-11-24)으로 뺐다. */
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
    </>
  )
}

/** 2단계: 머리 위 이름표. 입력하는 대로 바뀐다. */
export function NamePlate(props: { placement: ActorPlacement; name: string }) {
  const { head } = props.placement
  return (
    <span className={s.plate} style={{ left: head.x, top: head.y - 6 }} aria-hidden>
      <span className={`${s.plateName} ${props.name ? '' : s.plateEmpty}`}>{props.name || webText.onboardingNameLabel}</span>
    </span>
  )
}

/**
 * 3단계: 머리 위 생각 말풍선(사용자 요청 2026-11-24). 울퉁불퉁한 구름(SVG, thoughtCloud.ts) 안에서 고른 태그 칩이
 * 저마다 조금씩 둥실거리고, 아직 고른 것이 없으면 점 세 개가 차례로 떠오른다. 머리에서 구름까지 점점 커지는 생각 방울
 * 셋이 차례로 부풀었다 가라앉는다. 고른 목록은 아래
 * 글 칸에도 있으므로 화면 읽기에서는 숨긴다.
 */
export function ThoughtBubble(props: { placement: ActorPlacement; tags: Tag[] }) {
  const { head } = props.placement
  const content = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  // 내용 크기가 바뀌면(칩을 고르거나 뺌) 구름 테두리를 다시 그린다.
  useLayoutEffect(() => {
    const el = content.current
    if (!el) return
    const measure = () => setBox((prev) => (prev && prev.w === el.offsetWidth && prev.h === el.offsetHeight ? prev : { w: el.offsetWidth, h: el.offsetHeight }))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const path = useMemo(() => (box ? cloudPath(box.w, box.h) : null), [box])
  const m = cloudMargin
  return (
    <span className={s.thought} style={{ left: head.x, top: head.y }} aria-hidden>
      {/* 머리에서 구름까지 살짝 휘어 오르며 간격과 크기가 점점 커지는 생각 방울 셋(둘레: (3,-6)→(24,-14)→(21,-45) 곡선 위) */}
      <svg className={s.thoughtTrail} viewBox="-2 -60 52 62" width="52" height="62">
        {[[5.4, -7.0, 3.0], [16.4, -16.8, 5.2], [21.4, -36.8, 8.6]].map(([x, y, r], i) => (
          <g key={i} className={s.trailBead} style={{ animationDelay: `${i * 0.25}s`, animationDuration: `${2.2 + i * 0.35}s` }}>
            <circle cx={x} cy={y} r={r} className={s.cloudFace} />
          </g>
        ))}
      </svg>
      <span className={s.thoughtCloud}>
        {path && box && (
          <svg className={s.cloudSvg} viewBox={`${-m} ${-m} ${box.w + 2 * m} ${box.h + 2 * m}`} style={{ left: -m, top: -m, width: box.w + 2 * m, height: box.h + 2 * m }}>
            <path d={path} className={s.cloudFace} />
          </svg>
        )}
        <span ref={content} className={s.thoughtContent}>
          {props.tags.length === 0 ? (
            <span className={s.thinking}><i /><i /><i /></span>
          ) : (
            props.tags.map((tag, i) => (
              <span key={tag.id} className={s.thoughtChipSlot}>
                <span
                  className={s.thoughtChip}
                  style={{ animationDuration: `${2.3 + (i % 3) * 0.45}s`, animationDelay: `${-i * 0.7}s`, '--tilt': `${i % 2 ? -3 : 3}deg` } as CSSProperties}
                >
                  #{tag.name}
                </span>
              </span>
            ))
          )}
        </span>
      </span>
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
