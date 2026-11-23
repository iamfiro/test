import { useState } from 'react'
import { Navigate, useLocation, useSearchParams } from 'react-router'
import { api, errorOf } from '../../core/api/client'
import { logger } from '../../core/log/log'
import { webText } from '../../l10n/web_ko'
import { useToast } from '../../core/ui/Toast'
import { useSession } from './session'
import { appleIdToken, googleIdToken, providerConfig } from './providers'
import s from './LoginPage.module.css'

const log = logger('Login')

/**
 * 앱 LoginPage 패턴(위 장면, 제목·설명, 아래 로그인 버튼 열)을 따른다. 장면은 공부방 맵 미리보기 그림을
 * 쓴다(앱 로그인의 실시간 현황 장면은 PocketTime 고유라 쓰지 않음, docs/design-parity/exceptions.md).
 */
export function LoginPage() {
  const { state, accept } = useSession()
  const toast = useToast()
  const location = useLocation()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState<string | null>(null)
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (state.status === 'signedIn') return <Navigate to={from} replace />

  const fail = (provider: string, e: unknown) => {
    log.warn('login failed', { provider, code: errorOf(e).code })
    toast(webText.authLoginFailedGeneric)
  }

  const withIdToken = async (provider: 'google' | 'apple') => {
    if (busy) return
    setBusy(provider)
    try {
      const nonce = await api.GET('/auth/nonce')
      if (!nonce.data) throw nonce.error
      const idToken = provider === 'google'
        ? await googleIdToken(providerConfig.googleClientId!, nonce.data.data.nonce)
        : await appleIdToken(providerConfig.appleServiceId!, providerConfig.appleRedirectUri!, nonce.data.data.nonce)
      const res = await api.POST('/auth/login/{provider}', { params: { path: { provider } }, body: { id_token: idToken } })
      if (!res.data) throw res.error
      accept(res.data.data)
    } catch (e) {
      fail(provider, e)
    } finally {
      setBusy(null)
    }
  }

  const devLogin = async () => {
    if (busy) return
    setBusy('dev')
    try {
      const res = await api.POST('/auth/login/dev', { body: { subject: 'me' } })
      if (!res.data) throw res.error
      accept(res.data.data)
    } catch (e) {
      fail('dev', e)
    } finally {
      setBusy(null)
    }
  }

  const kakaoHref = `${import.meta.env.VITE_API_ORIGIN}/auth/kakao/start?return_to=${encodeURIComponent(from)}`

  return (
    <main className={s.page}>
      <div className={s.column}>
        <div className={s.scene}>
          <img src="/assets/study_themes/cafe_room_3d/map_preview.jpg" alt="" className={s.sceneImage} />
        </div>
        <h1 className={s.title}>{webText.loginTitle}</h1>
        <p className={s.description}>{webText.loginDescription}</p>
        {params.get('error') === 'kakao' && <p className={s.error} role="alert">{webText.authLoginFailedGeneric}</p>}
        <div className={s.actions}>
          {providerConfig.devLoginEnabled && (
            <button type="button" className={`${s.button} ${s.dev}`} onClick={devLogin} aria-busy={busy === 'dev'}>
              {busy === 'dev' ? <span className={s.spinner} /> : webText.devLogin}
            </button>
          )}
          {providerConfig.appleServiceId && providerConfig.appleRedirectUri && (
            <button type="button" className={`${s.button} ${s.neutral}`} onClick={() => withIdToken('apple')} aria-busy={busy === 'apple'}>
              {busy === 'apple' ? <span className={s.spinner} /> : <><img src="/assets/icons/brand/apple.svg" width={24} height={24} alt="" className={s.appleIcon} />{webText.authAppleContinue}</>}
            </button>
          )}
          {providerConfig.googleClientId && (
            <button type="button" className={`${s.button} ${s.neutral}`} onClick={() => withIdToken('google')} aria-busy={busy === 'google'}>
              {busy === 'google' ? <span className={s.spinner} /> : <><img src="/assets/icons/brand/google.svg" width={20} height={20} alt="" />{webText.authGoogleContinue}</>}
            </button>
          )}
          {providerConfig.kakaoEnabled && (
            <a className={`${s.button} ${s.kakao}`} href={kakaoHref}>
              <img src="/assets/icons/brand/kakao.svg" height={19} alt="" />{webText.authKakaoLogin}
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
