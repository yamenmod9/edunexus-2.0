/**
 * Token storage.
 *
 * localStorage, not a cookie: CLAUDE.md specifies bearer tokens precisely so
 * one API serves both this app and the Flutter clients, and a cookie session
 * would not survive that. The tradeoff is that an XSS bug can read the token,
 * which is why access tokens are short-lived (15 minutes) and refresh tokens
 * are rotated and individually revocable server-side.
 *
 * Everything goes through this module so there is exactly one place that knows
 * the storage keys, and one place to change if that tradeoff is ever revisited.
 */

const ACCESS_KEY = 'edunexus.access_token'
const REFRESH_KEY = 'edunexus.refresh_token'
const USER_KEY = 'edunexus.user'

// Storage throws in private-browsing modes and when disabled entirely. The app
// should degrade to "you have to log in again" rather than crash on boot.
function safeStorage() {
  try {
    const probe = '__edunexus_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

const store = typeof window === 'undefined' ? null : safeStorage()
const memory = new Map()

function read(key) {
  return store ? store.getItem(key) : (memory.get(key) ?? null)
}

function write(key, value) {
  if (value === null || value === undefined) {
    if (store) store.removeItem(key)
    else memory.delete(key)
    return
  }
  if (store) store.setItem(key, value)
  else memory.set(key, value)
}

export function getAccessToken() {
  return read(ACCESS_KEY)
}

export function getRefreshToken() {
  return read(REFRESH_KEY)
}

export function setTokens(pair) {
  write(ACCESS_KEY, pair?.access_token ?? null)
  write(REFRESH_KEY, pair?.refresh_token ?? null)
}

export function clearTokens() {
  write(ACCESS_KEY, null)
  write(REFRESH_KEY, null)
  write(USER_KEY, null)
}

export function hasSession() {
  return Boolean(getRefreshToken())
}

/**
 * The last known identity, so a returning student sees their dashboard on the
 * first paint instead of a spinner while /auth/me makes a round trip.
 *
 * Explicitly NOT a security boundary - it only decides which pixels to draw.
 * Every request is still authorised server-side against the token, and the
 * cached copy is replaced by whatever /auth/me actually says a moment later.
 */
export function getCachedUser() {
  try {
    return JSON.parse(read(USER_KEY) ?? 'null')
  } catch {
    return null
  }
}

export function setCachedUser(user) {
  write(USER_KEY, user ? JSON.stringify(user) : null)
}
