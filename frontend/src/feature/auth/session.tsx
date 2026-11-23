import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setCsrfToken } from '../../core/api/client'
import type { components } from '../../core/api/schema'
import { logger } from '../../core/log/log'

const log = logger('Session')

export type Me = components['schemas']['Me']
type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; me: Me }
  | { status: 'error' }

type Ctx = {
  state: State
  refresh: () => Promise<void>
  accept: (session: components['schemas']['Session']) => void
  signOut: () => Promise<void>
  replaceMe: (me: Me) => void
}

const SessionContext = createContext<Ctx | null>(null)

/** 세션은 서버 쿠키가 진실이다. 앱 시작 때 `GET /auth/session`으로 확인하고 CSRF 토큰을 메모리에 둔다. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' })

  const refresh = useCallback(async () => {
    try {
      const { data, response } = await api.GET('/auth/session')
      if (response.status === 401) { setCsrfToken(null); setState({ status: 'signedOut' }); return }
      if (!data) { setState({ status: 'error' }); return }
      setCsrfToken(data.data.csrf_token)
      setState({ status: 'signedIn', me: data.data.user })
    } catch (e) {
      log.warn('session check failed', { reason: e instanceof Error ? e.message : 'unknown' })
      setState({ status: 'error' })
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const accept = useCallback((session: components['schemas']['Session']) => {
    setCsrfToken(session.csrf_token)
    setState({ status: 'signedIn', me: session.user })
  }, [])

  const signOut = useCallback(async () => {
    const { response } = await api.POST('/auth/logout')
    if (response.status !== 204) throw new Error(`logout failed: ${response.status}`)
    setCsrfToken(null)
    setState({ status: 'signedOut' })
  }, [])

  const replaceMe = useCallback((me: Me) => setState({ status: 'signedIn', me }), [])

  const value = useMemo(() => ({ state, refresh, accept, signOut, replaceMe }), [state, refresh, accept, signOut, replaceMe])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Ctx {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession outside SessionProvider')
  return ctx
}
