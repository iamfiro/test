// 소셜 로그인 제공자 설정. 값이 없으면 그 버튼을 보이지 않는다(추측한 기본값을 두지 않는다).
export const providerConfig = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined,
  appleServiceId: import.meta.env.VITE_APPLE_SERVICE_ID as string | undefined,
  appleRedirectUri: import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined,
  kakaoEnabled: import.meta.env.VITE_KAKAO_ENABLED === 'true',
  devLoginEnabled: import.meta.env.VITE_DEV_LOGIN === 'true',
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`script load failed: ${src}`))
    document.head.appendChild(el)
  })
}

type GoogleId = {
  accounts: { id: {
    initialize: (o: { client_id: string; nonce: string; callback: (r: { credential: string }) => void; use_fedcm_for_prompt?: boolean }) => void
    renderButton: (el: HTMLElement, o: Record<string, unknown>) => void
    prompt: () => void
  } }
}

/** Google Identity Services로 ID 토큰을 받는다. 서버가 준 nonce를 토큰에 넣는다. */
export async function googleIdToken(clientId: string, nonce: string): Promise<string> {
  await loadScript('https://accounts.google.com/gsi/client')
  const google = (window as unknown as { google?: GoogleId }).google
  if (!google) throw new Error('google identity unavailable')
  return new Promise((resolve) => {
    google.accounts.id.initialize({ client_id: clientId, nonce, use_fedcm_for_prompt: true, callback: (r) => resolve(r.credential) })
    google.accounts.id.prompt()
  })
}

type AppleId = { auth: {
  init: (o: { clientId: string; scope: string; redirectURI: string; nonce: string; usePopup: boolean }) => void
  signIn: () => Promise<{ authorization: { id_token: string } }>
} }

/** Sign in with Apple JS(팝업)로 ID 토큰을 받는다. */
export async function appleIdToken(serviceId: string, redirectUri: string, nonce: string): Promise<string> {
  await loadScript('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ko_KR/appleid.auth.js')
  const apple = (window as unknown as { AppleID?: AppleId }).AppleID
  if (!apple) throw new Error('apple sign in unavailable')
  apple.auth.init({ clientId: serviceId, scope: '', redirectURI: redirectUri, nonce, usePopup: true })
  const res = await apple.auth.signIn()
  return res.authorization.id_token
}
