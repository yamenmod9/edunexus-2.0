/**
 * Theme state: light, dark, or follow the operating system.
 *
 * The stored value is the user's *choice*, which is deliberately three-valued.
 * Storing a resolved boolean instead would freeze a student who picked "system"
 * into whichever theme their OS happened to be in at the time, and stop them
 * following it when it changes at sunset.
 *
 * The class is applied to <html> before first paint by the inline script in
 * index.html; this module keeps it in step afterwards. The storage key and the
 * resolution rules are duplicated there — change both together.
 */

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'edunexus-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** @returns {'light'|'dark'|'system'} */
export function readPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  } catch {
    // Storage can throw in private mode; treat it as no preference.
    return 'system'
  }
}

function systemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia(DARK_QUERY).matches
    : false
}

export function resolveTheme(preference) {
  if (preference === 'light' || preference === 'dark') return preference
  return systemPrefersDark() ? 'dark' : 'light'
}

function applyTheme(resolved) {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

/**
 * @returns {{preference: 'light'|'dark'|'system', resolved: 'light'|'dark',
 *            setPreference: (p: 'light'|'dark'|'system') => void}}
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState(readPreference)
  const [resolved, setResolved] = useState(() => resolveTheme(readPreference()))

  useEffect(() => {
    const next = resolveTheme(preference)
    setResolved(next)
    applyTheme(next)
  }, [preference])

  // Follow the OS while the choice is "system" — including a change made
  // while the tab is open.
  useEffect(() => {
    if (preference !== 'system') return undefined
    if (!window.matchMedia) return undefined
    const media = window.matchMedia(DARK_QUERY)
    const onChange = () => {
      const next = systemPrefersDark() ? 'dark' : 'light'
      setResolved(next)
      applyTheme(next)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next) => {
    setPreferenceState(next)
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Non-persistent is better than a crash; the choice still applies now.
    }
  }, [])

  return { preference, resolved, setPreference }
}
