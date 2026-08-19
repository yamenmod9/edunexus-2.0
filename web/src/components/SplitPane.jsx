import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Two panes with a divider the student can drag, as Bluebook does.
 *
 * Why the ratio is persisted rather than reset per question: someone who
 * widens the passage pane has told us how they want to read, and having that
 * snap back on every Next would be worse than not offering it at all. It is
 * kept in localStorage rather than on the attempt because it is a preference
 * about this screen, not part of anyone's answers.
 *
 * The divider is a real `separator` widget: draggable with a pointer, and
 * movable with the arrow keys once focused. A drag-only splitter is unusable
 * without a mouse, and this screen is one a student sits an exam in.
 *
 * Below the `md` breakpoint the panes stack and the divider disappears —
 * there is no horizontal room to divide, so resizing is meaningless.
 */

const MIN = 0.25
const MAX = 0.75
const STEP = 0.02

function clamp(value) {
  return Math.min(MAX, Math.max(MIN, value))
}

function useIsWide() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const onChange = (event) => setWide(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

export default function SplitPane({ storageKey, left, right, leftLabel = 'left pane' }) {
  const host = useRef(null)
  const wide = useIsWide()
  const [ratio, setRatio] = useState(() => {
    const stored = Number(localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : 0.5
  })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    localStorage.setItem(storageKey, String(ratio))
  }, [storageKey, ratio])

  const moveTo = useCallback((clientX) => {
    if (!host.current) return
    const box = host.current.getBoundingClientRect()
    if (box.width === 0) return
    setRatio(clamp((clientX - box.left) / box.width))
  }, [])

  useEffect(() => {
    if (!dragging) return undefined
    const onMove = (event) => moveTo(event.clientX)
    const onUp = () => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    // Without this the drag selects the passage text it is dragging over.
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
  }, [dragging, moveTo])

  function onKeyDown(event) {
    if (event.key === 'ArrowLeft') setRatio((r) => clamp(r - STEP))
    else if (event.key === 'ArrowRight') setRatio((r) => clamp(r + STEP))
    else if (event.key === 'Home') setRatio(MIN)
    else if (event.key === 'End') setRatio(MAX)
    else if (event.key === 'Enter') setRatio(0.5)
    else return
    event.preventDefault()
  }

  // Nothing to split against - a multiple-choice maths question with no
  // passage - so there is no divider and no empty half, just the question in
  // the middle of the screen where it was before.
  if (left == null) {
    return <div className="mx-auto w-full max-w-2xl flex-grow">{right}</div>
  }

  return (
    <div ref={host} className="flex flex-grow flex-col md:flex-row">
      <div
        className="min-w-0 overflow-y-auto"
        style={wide ? { width: `${ratio * 100}%` } : undefined}
      >
        {left}
      </div>

      {wide && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={`Resize the ${leftLabel}`}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuemin={Math.round(MIN * 100)}
          aria-valuemax={Math.round(MAX * 100)}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDoubleClick={() => setRatio(0.5)}
          onKeyDown={onKeyDown}
          className={`group relative w-px flex-shrink-0 cursor-col-resize bg-line
            outline-none focus-visible:bg-accent ${dragging ? 'bg-accent' : ''}`}
        >
          {/* The visible line stays a hairline; the grab target is 11px wide,
              because a 1px hit area is a 1px hit area. */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 -left-[5px] w-[11px] group-hover:bg-accent/20"
          />
          <span
            aria-hidden="true"
            className={`absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2
              rounded-full transition ${dragging ? 'bg-accent' : 'bg-line-strong group-hover:bg-accent'}`}
          />
        </div>
      )}

      <div className="min-w-0 flex-grow overflow-y-auto">{right}</div>
    </div>
  )
}
