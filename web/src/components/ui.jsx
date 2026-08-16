import { forwardRef } from 'react'

const VARIANTS = {
  primary: 'bg-accent text-white hover:bg-accent-hover disabled:bg-slate-300',
  secondary:
    'bg-white text-ink ring-1 ring-slate-300 hover:bg-slate-100 disabled:text-slate-400',
  ghost: 'text-ink-soft hover:bg-slate-200 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
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
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}
      </label>
      {children ?? (
        <input
          id={id}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy || undefined}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm
            focus:border-accent"
          {...props}
        />
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function Alert({ tone = 'error', title, children }) {
  const tones = {
    error: 'bg-red-50 text-red-800 ring-red-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
    info: 'bg-accent-soft text-accent-hover ring-blue-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  }
  return (
    // assertive would interrupt a screen reader mid-sentence; these are
    // results and validation messages, not emergencies.
    <div role="status" className={`mb-4 rounded-md p-3 text-sm ring-1 ${tones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      {children}
    </div>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="flex items-center gap-3 p-6 text-sm text-ink-faint" role="status">
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-accent"
      />
      {label}
    </div>
  )
}

export function Card({ className = '', ...props }) {
  return (
    <div
      className={`rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}
      {...props}
    />
  )
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: 'bg-slate-100 text-ink-soft',
    good: 'bg-emerald-100 text-emerald-800',
    bad: 'bg-red-100 text-red-800',
    info: 'bg-accent-soft text-accent-hover',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
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
