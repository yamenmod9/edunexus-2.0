import { seatLabel } from './playerRules.js'
import { Button } from './ui.jsx'

/**
 * The chrome both players share.
 *
 * Practice and the real test now look the same on purpose - the whole point of
 * practising in this layout is that nothing about the screen is new on test
 * day - so the directions text, the tool button, the navigator popup and the
 * annotation split live here rather than being written twice and drifting.
 *
 * What differs between them stays in the pages: the test player counts down
 * against a server-owned clock and never reveals an answer, practice counts up
 * and grades on request.
 */

/** A top-bar tool. Square, labelled underneath, pressed state on the ground. */
export function Tool({ label, active = false, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active ? 'true' : undefined}
      className={`flex w-[68px] flex-col items-center gap-0.5 rounded-md px-1 py-1.5
        text-[10px] font-medium leading-tight transition
        ${active ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-sunken'}`}
    >
      <span aria-hidden="true">{children}</span>
      {label}
    </button>
  )
}

/**
 * The question navigator, as a popup over the bottom bar.
 *
 * Bluebook puts the whole module one click away rather than on screen, so the
 * grid never competes with the question being answered.
 */
/**
 * Default seat colouring: answered or marked, which is all a live test knows.
 * Practice passes its own, because there it also knows right from wrong.
 */
function defaultTone(response) {
  if (response.flagged) return 'bg-flag-soft text-flag ring-flag'
  if (response.answered) return 'bg-accent text-accent-on ring-accent'
  return 'bg-surface text-ink-soft ring-line-strong'
}

export function QuestionNav({
  responses,
  index,
  onSelect,
  onReview,
  onClose,
  toneFor = defaultTone,
  legend,
  reviewLabel = 'Go to review page',
}) {
  return (
    <div
      role="dialog"
      aria-label="Questions in this module"
      className="absolute bottom-full left-1/2 z-30 mb-3 w-[340px] -translate-x-1/2
        rounded-lg bg-surface p-4 shadow-xl ring-1 ring-line-strong"
    >
      <div className="mb-3 flex items-center">
        <p className="text-sm font-semibold">Section questions</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto rounded p-1 text-ink-faint hover:bg-sunken hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-line pb-3 text-[11px] text-ink-faint">
        {(legend ?? [
          ['ring-1 ring-ink', 'Current'],
          ['bg-accent', 'Answered'],
          ['bg-flag', 'Marked for review'],
        ]).map(([swatch, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-3 w-3 rounded-sm ${swatch}`} />
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-8 gap-1.5">
        {responses.map((response, i) => {
          const tone = toneFor(response, i)
          return (
            <button
              key={response.question_id}
              type="button"
              onClick={() => onSelect(i)}
              aria-current={i === index ? 'true' : undefined}
              aria-label={seatLabel(response, i)}
              className={`h-8 rounded-sm text-xs font-medium ring-1 transition hover:opacity-80
                ${tone} ${i === index ? 'ring-2 ring-ink' : ''}`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      {onReview && (
        <Button variant="secondary" className="mt-4 w-full" onClick={onReview}>
          {reviewLabel}
        </Button>
      )}
    </div>
  )
}
