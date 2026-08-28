/**
 * Turning a finished attempt into "show me what I got wrong".
 *
 * Pure, and in its own module rather than exported from ResultPage, so it can
 * be tested without rendering a score report and so that page keeps exporting
 * only its component.
 */

/**
 * Every question in the attempt, in the order it was delivered, each carrying
 * the module it came from.
 *
 * Flattened because "what did I get wrong" is a question about the test, not
 * about a module — and a student hunting their mistakes should not have to
 * open four accordions and hold the answer in their head between them.
 */
export function flattenQuestions(modules) {
  return (modules ?? []).flatMap((module) =>
    (module.questions ?? []).map((entry) => ({ ...entry, module })),
  )
}

/**
 * Skipped is deliberately its own filter rather than a kind of incorrect.
 * Running out of time and getting it wrong are different problems with
 * different fixes, and lumping them together hides which one you have.
 */
export function matchesFilter(entry, filter) {
  if (filter === 'incorrect') return !entry.is_correct && Boolean(entry.answer)
  if (filter === 'skipped') return !entry.answer
  if (filter === 'marked') return Boolean(entry.flagged)
  return true
}

export const REVIEW_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'incorrect', label: 'Incorrect' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'marked', label: 'Marked' },
]

export function isReviewFilter(value) {
  return REVIEW_FILTERS.some((filter) => filter.id === value)
}
