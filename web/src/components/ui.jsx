import { forwardRef } from 'react'

const VARIANTS = {
  primary: 'bg-accent text-accent-on hover:bg-accent-hover disabled:bg-line-strong disabled:text-ink-faint',
  secondary:
    'bg-surface text-ink ring-1 ring-line-strong hover:bg-sunken disabled:text-ink-faint',
  ghost: 'text-ink-soft hover:bg-sunken disabled:text-ink-faint',
  // text-page, not text-white: the page colour inverts with the theme, so the
  // label stays readable against dark mode's lighter red.
  danger: 'bg-bad text-page hover:opacity-90 disabled:bg-line-strong',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2
        text-sm font-medium transition disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
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

/** snake_case taxonomy values are for the API; humans get spaces and capitals. */
export function humanize(value) {
  if (!value) return ''
  if (value === 'reading_writing') return 'Reading & Writing'
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function formatClock(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds ?? 0))
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0')
  const seconds = String(safe % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}
