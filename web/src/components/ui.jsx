import { forwardRef, useEffect, useRef } from 'react'

const VARIANTS = {
  primary: 'bg-accent text-accent-on hover:bg-accent-hover disabled:bg-line-strong disabled:text-ink-faint',
  secondary:
    'bg-surface text-ink ring-1 ring-line-strong hover:bg-sunken disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-sunken disabled:text-ink-faint',
  // text-page, not text-white: the page colour inverts with the theme, so the
  // label stays readable against dark mode's lighter red.
  danger: 'bg-bad text-page hover:opacity-90 disabled:bg-line-strong',
}

/**
 * The button styling on its own, for the cases where the control has to be a
 * link — navigation. A <button> nested in an <a> is invalid HTML and axe
 * flags it as nested interactive content.
 */
export function buttonClass(variant = 'primary', className = '') {
  return `inline-flex items-center justify-center gap-2 rounded-md px-4 py-2
    text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`
}

export const Button = forwardRef(function Button(
  { variant = 'primary', className = '', type = 'button', ...props },
  ref,
) {
  return <button ref={ref} type={type} className={buttonClass(variant, className)} {...props} />
})

export function Field({ label, id, error, hint, children, ...props }) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      {children ?? (
        <input
          id={id}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2.5
            text-sm text-ink focus:border-accent"
          {...props}
        />
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-bad">
          {error}
        </p>
      )}
    </div>
  )
}

export function Alert({ tone = 'error', title, children }) {
  // Tone comes from the tinted ground and the title colour. No ring: an
  // opacity modifier cannot be computed against a var() colour, and a
  // full-strength ring is louder than this design wants.
  const tones = {
    error: 'bg-bad-soft',
    warn: 'bg-flag-soft',
    info: 'bg-accent-soft',
    success: 'bg-good-soft',
  }
  const markers = {
    error: 'text-bad',
    warn: 'text-flag',
    info: 'text-accent',
    success: 'text-good',
  }
  return (
    // assertive would interrupt a screen reader mid-sentence; these are
    // results and validation messages, not emergencies.
    <div
      role="status"
      className={`mb-4 rounded-md p-3 text-sm text-ink-soft ${tones[tone]}`}
    >
      {title && <p className={`font-semibold ${markers[tone]}`}>{title}</p>}
      {children}
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-3 p-6 text-sm text-ink-faint" role="status">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-accent"
      />
      {label}
    </div>
  )
}

export function Card({ className = '', ...props }) {
  return (
    <div
      className={`rounded-lg bg-surface p-5 ring-1 ring-line ${className}`}
      {...props}
    />
  )
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-sunken text-ink-soft',
    good: 'bg-good-soft text-good',
    bad: 'bg-bad-soft text-bad',
    info: 'bg-accent-soft text-accent',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  )
}

/** A section heading with a hairline running to the edge — the Exam Calm rule. */
export function SectionLabel({ children, className = '' }) {
  return (
    <div className={`mb-3 flex items-baseline gap-3 ${className}`}>
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {children}
      </h2>
      <span className="h-px flex-grow bg-line" />
    </div>
  )
}

/**
 * snake_case taxonomy values are for the API; humans get the display name.
 *
 * Mirrors DISPLAY_NAMES in `backend/app/models/question.py`. Title-casing the
 * enum is not enough: CLAUDE.md section 5 fixes these names exactly, and
 * "craft_structure".title() loses the ampersand that is part of the name.
 * Anything not listed title-cases cleanly.
 */
const DISPLAY_NAMES = {
  reading_writing: 'Reading & Writing',
  advanced_math: 'Advanced Math',
  problem_solving_data_analysis: 'Problem-Solving & Data Analysis',
  geometry_trigonometry: 'Geometry & Trigonometry',
  information_ideas: 'Information & Ideas',
  craft_structure: 'Craft & Structure',
  expression_of_ideas: 'Expression of Ideas',
  standard_english_conventions: 'Standard English Conventions',
  official_qb: 'Official QB',
}

export function humanize(value) {
  if (!value) return ''
  if (DISPLAY_NAMES[value]) return DISPLAY_NAMES[value]
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds ?? 0))
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0')
  const seconds = String(safe % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/**
 * Answer-choice presentation, shared by the player, practice and review.
 *
 * The three screens differ in what they know (the player has no key; practice
 * gets one back from the grader; review has it in the payload) but must look
 * identical, so the tones live here rather than being re-derived three times.
 * The pip foreground is `text-page`, not white: dark mode's good/bad hues are
 * light, and white on them is unreadable.
 */
const CHOICE_TONES = {
  idle: { row: 'bg-surface ring-line-strong', pip: 'text-ink-faint ring-line-strong' },
  picked: { row: 'bg-accent-soft ring-accent', pip: 'bg-accent text-accent-on ring-accent' },
  good: { row: 'bg-good-soft ring-good', pip: 'bg-good text-page ring-good' },
  bad: { row: 'bg-bad-soft ring-bad', pip: 'bg-bad text-page ring-bad' },
}

export function ChoiceRow({ tone = 'idle', as: Tag = 'div', className = '', ...props }) {
  return (
    <Tag
      className={`flex items-start gap-3 rounded-md p-3.5 text-sm ring-1 transition
        ${CHOICE_TONES[tone].row} ${className}`}
      {...props}
    />
  )
}

export function ChoicePip({ letter, tone = 'idle' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center
        rounded-full text-xs font-semibold ring-1 ${CHOICE_TONES[tone].pip}`}
    >
      {letter}
    </span>
  )
}

/**
 * A hairline magnitude bar.
 *
 * `tone="graded"` banks the fill through red/accent/green by accuracy. That is
 * an ordinal encoding of the same number the bar already shows, not a
 * categorical one — and every caller prints the fraction beside it, so colour
 * is never the only carrier of the meaning (WCAG 1.4.1).
 */
export function Meter({ value, tone = 'accent', className = '' }) {
  const ratio = Math.min(1, Math.max(0, value ?? 0))
  const fill =
    tone === 'graded'
      ? ratio >= 0.75
        ? 'bg-good'
        : ratio >= 0.55
          ? 'bg-accent'
          : 'bg-bad'
      : 'bg-accent'
  return (
    // Track is `line`, not `sunken`: sunken against a white card is very
    // nearly invisible, so an empty meter read as no meter at all.
    <div className={`h-[5px] overflow-hidden rounded-full bg-line ${className}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  )
}

/** The small uppercase caption above a value or beside a metadata run. */
export function Eyebrow({ className = '', ...props }) {
  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint ${className}`}
      {...props}
    />
  )
}

/**
 * One accuracy breakdown row, shared by the score report and the progress
 * dashboard.
 *
 * Accuracy is correct/answered, not correct/delivered - the server excludes
 * skipped questions on purpose, so running out of time does not read as being
 * inaccurate on questions you never saw. The fraction beside it therefore has
 * to use the same denominator, or the row contradicts itself ("2/4" beside
 * "100%"). Skips are reported separately instead.
 */
export function AccuracyRow({ label, row }) {
  const skipped = (row.delivered ?? row.answered) - row.answered
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5">
      <span className="flex-grow text-sm">
        {label}
        {skipped > 0 && (
          <span className="ml-1 text-xs text-ink-faint">({skipped} skipped)</span>
        )}
      </span>
      <Meter value={row.accuracy} tone="graded" className="w-20 flex-shrink-0" />
      <span className="w-11 flex-shrink-0 text-right font-mono text-xs tabular-nums text-ink-soft">
        {row.correct}/{row.answered}
      </span>
    </div>
  )
}

/**
 * A modal panel — Bluebook opens Directions and the reference sheet this way.
 *
 * Escape closes, focus moves in on open and the backdrop is inert to clicks
 * that start inside the panel, so dragging a selection out of it does not
 * dismiss what you were reading.
 */
export function Modal({ title, onClose, children, wide = false }) {
  const panel = useRef(null)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto
        bg-ink/30 p-4 pt-[6vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full rounded-lg bg-surface p-6 shadow-xl ring-1 ring-line
          ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
      >
        <div className="mb-4 flex items-center gap-4">
          <h2 className="font-serif text-xl font-bold tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded p-1 text-ink-faint hover:bg-sunken hover:text-ink"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
