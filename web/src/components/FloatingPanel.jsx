import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A window the student can drag around the screen, the way Bluebook's
 * calculator behaves.
 *
 * Deliberately NOT a modal. A modal would trap focus and dim the page, and the
 * whole point of the calculator is to use it *while* reading the question. So:
 * no backdrop, no `aria-modal`, no focus trap — it is a non-modal dialog that
 * sits above the content and can be moved out of the way of whatever it covers.
 *
 * Draggable by the header with a pointer, and movable with the arrow keys when
 * the header is focused, so it can be got out of the way without a mouse.
 *
 * The position is clamped to the viewport on every move AND on mount, because
 * a stored position from a larger window would otherwise put the panel — and
 * its close button — somewhere the student cannot reach.
 */

const STEP = 24

// The drag bar. Counted into the clamp so the panel's own chrome cannot be
// pushed off the bottom edge along with its contents.
const HEADER_HEIGHT = 34

export default function FloatingPanel({
  title,
  onClose,
  storageKey,
  width = 660,
  height = 480,
  initial,
  toolbar,
  children,
}) {
  const [position, setPosition] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) return stored
    } catch {
      // A corrupt entry is not worth failing a test module over.
    }
    return initial ?? { x: 24, y: 96 }
  })
  const dragOffset = useRef(null)

  const clamp = useCallback(
    (next) => {
      // Keep the WHOLE panel on screen, not just its header. A calculator
      // dragged half off the bottom is a calculator you cannot read the answer
      // off, and nothing on this screen scrolls to reveal it.
      const total = height + HEADER_HEIGHT
      const maxX = Math.max(8, window.innerWidth - width - 8)
      const maxY = Math.max(8, window.innerHeight - total - 8)
      return {
        x: Math.min(Math.max(next.x, 8), maxX),
        y: Math.min(Math.max(next.y, 8), maxY),
      }
    },
    [width, height],
  )

  useEffect(() => {
    setPosition((current) => clamp(current))
    const onResize = () => setPosition((current) => clamp(current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(position))
  }, [storageKey, position])

  useEffect(() => {
    const onMove = (event) => {
      if (!dragOffset.current) return
      setPosition(
        clamp({
          x: event.clientX - dragOffset.current.x,
          y: event.clientY - dragOffset.current.y,
        }),
      )
    }
    const onUp = () => {
      dragOffset.current = null
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [clamp])

  function onHeaderKeyDown(event) {
    const by = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[
      event.key
    ]
    if (!by) return
    event.preventDefault()
    setPosition((current) => clamp({ x: current.x + by[0], y: current.y + by[1] }))
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      style={{ left: position.x, top: position.y, width }}
      className="fixed z-40 flex flex-col rounded-lg bg-surface shadow-2xl ring-1 ring-line-strong"
    >
      <div
        onPointerDown={(event) => {
          if (event.target.closest('button')) return
          dragOffset.current = { x: event.clientX - position.x, y: event.clientY - position.y }
          document.body.style.userSelect = 'none'
        }}
        className="flex cursor-grab items-center gap-2 rounded-t-lg border-b border-line
          bg-sunken px-2 py-1.5 active:cursor-grabbing"
      >
        {/* The whole header drags with a pointer, but the keyboard route needs
            a real focusable control with a real name - a focusable div with an
            aria-label is a generic element as far as a screen reader cares. */}
        <button
          type="button"
          onKeyDown={onHeaderKeyDown}
          aria-label={`Move the ${title.toLowerCase()} with the arrow keys`}
          className="rounded p-0.5 text-ink-faint hover:bg-line hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.6" />
            <circle cx="15" cy="6" r="1.6" />
            <circle cx="9" cy="12" r="1.6" />
            <circle cx="15" cy="12" r="1.6" />
            <circle cx="9" cy="18" r="1.6" />
            <circle cx="15" cy="18" r="1.6" />
          </svg>
        </button>
        {toolbar}
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="ml-auto rounded p-1 text-ink-faint hover:bg-line hover:text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div style={{ height }} className="overflow-hidden rounded-b-lg">
        {children}
      </div>
    </div>
  )
}
