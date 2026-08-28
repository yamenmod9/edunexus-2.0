/**
 * localStorage that cannot take a screen down with it.
 *
 * Every access is wrapped, because `localStorage` throws rather than returning
 * null in two situations that are not rare:
 *
 * - blocked storage (Safari's private mode, "block all cookies"), where even
 *   reading throws a SecurityError; and
 * - a full origin, where `setItem` throws QuotaExceededError even though
 *   reading works perfectly. A one-time probe at startup passes in this case,
 *   so guarding at boot is not enough — the throw comes later, from whichever
 *   write happens to be the one that overflows.
 *
 * Everything stored through here is a *preference* — a pane width, a window
 * position, a choice of calculator. None of it is worth failing on: losing a
 * remembered pane width is nothing, and crashing the test player mid-module
 * because of one is the worst outcome this app has.
 *
 * The token store keeps its own copy of this logic in api/tokens.js, because
 * it needs an in-memory fallback so a session can still work without storage.
 * A preference needs no fallback; it just goes back to its default.
 */

export function readLocal(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Quota, or storage denied outright. Either way the preference is lost,
    // which is the whole cost.
  }
}

/** Reads JSON, returning null for missing, unreadable or malformed values. */
export function readLocalJson(key) {
  const raw = readLocal(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
