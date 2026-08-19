import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { auth as authApi, onSessionEnded } from '../api/client.js'
import {
  clearTokens,
  getCachedUser,
  getRefreshToken,
  hasSession,
  setCachedUser,
  setTokens,
} from '../api/tokens.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // Start from the cached identity rather than from nothing. A returning
  // student then gets their dashboard on the first paint, instead of staring
  // at "Checking your session" for a round trip to an API that may be a
  // continent away. /auth/me still runs below and still has the last word -
  // this only decides what is on screen while it is in flight.
  const [user, setUser] = useState(() => (hasSession() ? getCachedUser() : null))
  // Only true when we have a session but no idea who it belongs to, which now
  // means a first sign-in on this device rather than every single load.
  const [loading, setLoading] = useState(() => hasSession() && !getCachedUser())

  useEffect(() => {
    let cancelled = false
    if (!hasSession()) {
      setUser(null)
      setCachedUser(null)
      setLoading(false)
      return undefined
    }
    authApi
      .me()
      .then((me) => {
        if (cancelled) return
        setUser(me)
        setCachedUser(me)
      })
      .catch((error) => {
        // A network failure is not a signed-out user. Dropping the cached
        // identity on a flaky connection would bounce someone mid-test to the
        // login screen for no reason; a genuinely dead session arrives as a
        // 401, which the client turns into onSessionEnded below.
        if (!cancelled && error?.status === 401) {
          setUser(null)
          setCachedUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // The client tells us when a refresh failed for good; drop the user so the
  // route guards redirect instead of leaving a dead session on screen.
  useEffect(
    () =>
      onSessionEnded(() => {
        setUser(null)
        setCachedUser(null)
      }),
    [],
  )

  const adopt = useCallback(async (pair) => {
    setTokens(pair)
    const me = pair.user ?? (await authApi.me())
    setUser(me)
    setCachedUser(me)
    return pair
  }, [])

  const login = useCallback(
    async (email, password) => adopt(await authApi.login(email, password)),
    [adopt],
  )

  const register = useCallback(
    async (email, password) => adopt(await authApi.register(email, password)),
    [adopt],
  )

  const logout = useCallback(async () => {
    const refresh = getRefreshToken()
    // Revoke server-side so the token dies with the session, but never let a
    // failed call strand someone on a screen they wanted to leave.
    if (refresh) await authApi.logout(refresh).catch(() => {})
    clearTokens()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      isAdmin: user?.role === 'admin',
    }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside an AuthProvider')
  return context
}
