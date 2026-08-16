import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { auth as authApi, onSessionEnded } from '../api/client.js'
import { clearTokens, getRefreshToken, hasSession, setTokens } from '../api/tokens.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  // "Do we already know who this is?" - distinct from "is there no user", so
  // the app can show a spinner on boot instead of flashing the login screen at
  // someone who is in fact signed in.
  const [loading, setLoading] = useState(hasSession())

  useEffect(() => {
    let cancelled = false
    if (!hasSession()) {
      setLoading(false)
      return undefined
    }
    authApi
      .me()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
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
  useEffect(() => onSessionEnded(() => setUser(null)), [])

  const login = useCallback(async (email, password) => {
    const pair = await authApi.login(email, password)
    setTokens(pair)
    setUser(pair.user ?? (await authApi.me()))
    return pair
  }, [])

  const register = useCallback(async (email, password) => {
    const pair = await authApi.register(email, password)
    setTokens(pair)
    setUser(pair.user ?? (await authApi.me()))
    return pair
  }, [])

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
