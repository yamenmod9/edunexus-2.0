import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Stale-while-revalidate for read-only GETs.
 *
 * The problem this solves: every screen fetched on mount and rendered a
 * full-page spinner until the answer came back, so navigating anywhere - even
 * back to a page you had just been on - meant staring at a spinner for as long
 * as the API took. Against a backend a continent away from its database that
 * is over a second, every single time.
 *
 * So: keep the last answer, render it immediately, and refetch in the
 * background. The second visit to a page is instant and then corrects itself.
 *
 * Deliberately in memory rather than localStorage. This is about not repeating
 * a request within one sitting; persisting it would mean showing a student
 * yesterday's progress on a cold load, which is worse than a spinner.
 *
 * Only for data that is safe to show a moment out of date. Anything the
 * student is actively editing - a live attempt, an answer - is not that, and
 * does not belong here.
 */

const cache = new Map()

/** Drops a cached entry, for when an action has just made it wrong. */
export function invalidate(key) {
  cache.delete(key)
}

export function useResource(key, fetcher) {
  const [data, setData] = useState(() => cache.get(key))
  const [error, setError] = useState(null)
  // Held in a ref so an inline arrow function does not re-trigger the fetch on
  // every render.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((value) => {
        cache.set(key, value)
        if (!cancelled) {
          setData(value)
          setError(null)
        }
      })
      .catch((err) => {
        // Only surface the failure if there is nothing to show. A background
        // refresh that fails behind good data is not the student's problem.
        if (!cancelled && cache.get(key) === undefined) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [key, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading: data === undefined && !error, refresh }
}
