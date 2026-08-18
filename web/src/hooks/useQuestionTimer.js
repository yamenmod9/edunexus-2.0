import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Wall-clock seconds spent on one question.
 *
 * Two numbers, for two different jobs. `seconds` is what the student sees and
 * resets whenever `key` changes. The deltas handed to `onFlush` are what get
 * reported to the server, because a running total from a client only ever
 * goes backwards when a tab is reopened — the server adds deltas rather than
 * trusting a total (see backend/app/services/attempt_service.py).
 *
 * Counted from timestamps rather than by incrementing on an interval: a
 * backgrounded tab has its timers throttled, so a tick count would quietly
 * under-report every question a student left the page on.
 *
 * `onFlush(key, seconds)` is called with the *outgoing* key when the question
 * changes and again on unmount, so time is always attributed to the question
 * it was spent on. Doing it here rather than in an effect in the caller keeps
 * it out of the race between the caller's cleanup and this hook's reset.
 */
export function useQuestionTimer(key, { running = true, onFlush } = {}) {
  const [seconds, setSeconds] = useState(0)

  // Wall-clock at the last accounting point, or null while paused.
  const startedAt = useRef(null)
  // Seconds banked for this question but not yet reported.
  const pending = useRef(0)
  // Seconds banked for this question in total — what `seconds` displays.
  const shown = useRef(0)
  // Kept in a ref so changing the handler does not restart the clock.
  const flushRef = useRef(onFlush)
  flushRef.current = onFlush

  const bank = useCallback(() => {
    if (startedAt.current == null) return
    const elapsed = Math.floor((Date.now() - startedAt.current) / 1000)
    if (elapsed > 0) {
      pending.current += elapsed
      shown.current += elapsed
      startedAt.current += elapsed * 1000
    }
  }, [])

  const takeDelta = useCallback(() => {
    bank()
    const delta = pending.current
    pending.current = 0
    return delta
  }, [bank])

  // Identity of the question. One effect owns both the reset for the incoming
  // question and the flush for the outgoing one, so the two cannot be
  // reordered against each other.
  useEffect(() => {
    pending.current = 0
    shown.current = 0
    setSeconds(0)

    return () => {
      bank()
      const delta = pending.current
      pending.current = 0
      startedAt.current = null
      if (delta > 0) flushRef.current?.(key, delta)
    }
  }, [key, bank])

  // Running or paused. Deliberately separate from the reset above: pausing is
  // not starting a new question, so it must not zero what the student has
  // already spent — a stopwatch that reads 00:00 the instant you answer is
  // reporting the one number the student wanted to see.
  useEffect(() => {
    if (!running) {
      bank()
      startedAt.current = null
      setSeconds(shown.current)
      return undefined
    }

    startedAt.current = Date.now()
    const id = setInterval(() => {
      bank()
      setSeconds(shown.current)
    }, 1000)

    return () => {
      clearInterval(id)
      bank()
      startedAt.current = null
    }
  }, [running, bank])

  return { seconds, takeDelta }
}
