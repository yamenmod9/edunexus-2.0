import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Bluebook's highlight-and-note tool, over a block of passage text.
 *
 * Annotations are stored as character offsets into the passage string, not as
 * DOM ranges: the DOM is rebuilt on every render and after every reload, and
 * an offset into the source text is the only anchor that survives that. It
 * also means the payload the server keeps is small and readable — see the
 * `annotations` column in backend/app/models/attempt.py, which stores it and
 * deliberately never interprets it.
 *
 * Consequence worth knowing: this renders plain text, so it does not run
 * MathText. Reading passages are prose, and the maths questions that would
 * need KaTeX carry no passage at all — so the two never have to meet. If a
 * passage ever does need maths, this is the thing that has to change.
 */

export const HIGHLIGHT_COLOURS = [
  { id: 'yellow', label: 'Yellow', className: 'bg-flag-soft' },
  { id: 'blue', label: 'Blue', className: 'bg-accent-soft' },
  { id: 'green', label: 'Green', className: 'bg-good-soft' },
]

function colourClass(id) {
  return HIGHLIGHT_COLOURS.find((c) => c.id === id)?.className ?? 'bg-flag-soft'
}

/**
 * Character offset of a DOM position within `root`, by walking the text nodes
 * in order. Needed because a selection can start and end in different spans
 * once part of the passage is already highlighted.
 */
function offsetWithin(root, node, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let total = 0
  let current = walker.nextNode()
  while (current) {
    if (current === node) return total + offset
    total += current.textContent.length
    current = walker.nextNode()
  }
  return null
}

/** Splits `text` into runs, each carrying the annotation covering it (if any). */
function toRuns(text, annotations) {
  const boundaries = new Set([0, text.length])
  annotations.forEach(({ start, end }) => {
    boundaries.add(Math.max(0, Math.min(start, text.length)))
    boundaries.add(Math.max(0, Math.min(end, text.length)))
  })
  const points = [...boundaries].sort((a, b) => a - b)

  const runs = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const [from, to] = [points[i], points[i + 1]]
    if (from === to) continue
    // The last one wins where highlights overlap — the same rule as painting
    // over a mark with a fresh one, which is what the student just did.
    const covering = annotations.filter((a) => a.start <= from && a.end >= to).at(-1)
    runs.push({ from, to, text: text.slice(from, to), annotation: covering })
  }
  return runs
}

export default function Annotatable({
  text,
  annotations = [],
  onChange,
  className = '',
  readOnly = false,
}) {
  const host = useRef(null)
  const [draft, setDraft] = useState(null) // { start, end, x, y }
  const [noteFor, setNoteFor] = useState(null) // annotation being edited
  const [noteText, setNoteText] = useState('')

  const runs = toRuns(text ?? '', annotations)

  const clearDraft = useCallback(() => setDraft(null), [])

  useEffect(() => {
    // A click anywhere that is not the popover dismisses it, which is what a
    // student expects and what stops the popover shadowing the passage.
    if (!draft) return undefined
    const onDown = (event) => {
      if (!event.target.closest?.('[data-annotate-popover]')) clearDraft()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [draft, clearDraft])

  function handleMouseUp() {
    if (readOnly) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || !host.current) return
    const range = selection.getRangeAt(0)
    if (!host.current.contains(range.commonAncestorContainer)) return

    const start = offsetWithin(host.current, range.startContainer, range.startOffset)
    const end = offsetWithin(host.current, range.endContainer, range.endOffset)
    if (start == null || end == null || start === end) return

    const rect = range.getBoundingClientRect()
    const hostRect = host.current.getBoundingClientRect()
    setDraft({
      start: Math.min(start, end),
      end: Math.max(start, end),
      x: rect.left - hostRect.left + rect.width / 2,
      y: rect.bottom - hostRect.top,
    })
  }

  function addHighlight(colour) {
    // `kind` because the same column also carries crossed-out choices; the
    // player splits them apart before either tool sees the other's marks.
    const next = [
      ...annotations,
      { kind: 'highlight', start: draft.start, end: draft.end, colour },
    ]
    onChange?.(next)
    window.getSelection()?.removeAllRanges()
    clearDraft()
  }

  function removeAt(annotation) {
    onChange?.(annotations.filter((a) => a !== annotation))
    setNoteFor(null)
  }

  function saveNote() {
    const next = annotations.map((a) =>
      a === noteFor ? { ...a, note: noteText.trim() || undefined } : a,
    )
    onChange?.(next)
    setNoteFor(null)
  }

  const noted = annotations.filter((a) => a.note)

  return (
    <div className="relative">
      <div
        ref={host}
        onMouseUp={handleMouseUp}
        className={`whitespace-pre-wrap ${className}`}
      >
        {runs.map((run) =>
          run.annotation ? (
            <mark
              key={`${run.from}-${run.to}`}
              onClick={() => {
                if (readOnly) return
                setNoteFor(run.annotation)
                setNoteText(run.annotation.note ?? '')
              }}
              className={`cursor-pointer rounded-sm text-ink ${colourClass(
                run.annotation.colour,
              )} ${run.annotation.note ? 'underline decoration-dotted underline-offset-4' : ''}`}
            >
              {run.text}
            </mark>
          ) : (
            <span key={`${run.from}-${run.to}`}>{run.text}</span>
          ),
        )}
      </div>

      {draft && (
        <div
          data-annotate-popover
          style={{ left: draft.x, top: draft.y + 8 }}
          className="absolute z-20 flex -translate-x-1/2 items-center gap-1 rounded-md
            bg-surface p-1 shadow-lg ring-1 ring-line-strong"
        >
          {HIGHLIGHT_COLOURS.map((colour) => (
            <button
              key={colour.id}
              type="button"
              title={`Highlight ${colour.label.toLowerCase()}`}
              aria-label={`Highlight ${colour.label.toLowerCase()}`}
              onClick={() => addHighlight(colour.id)}
              className={`h-6 w-6 rounded ring-1 ring-line-strong ${colour.className}`}
            />
          ))}
        </div>
      )}

      {noteFor && (
        <div
          data-annotate-popover
          className="mt-3 rounded-md bg-sunken p-3 ring-1 ring-line"
        >
          <label
            htmlFor="annotation-note"
            className="mb-1.5 block text-xs font-semibold text-ink-soft"
          >
            Note on the highlighted text
          </label>
          <textarea
            id="annotation-note"
            rows={2}
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            className="w-full rounded-md bg-surface px-2.5 py-2 text-sm ring-1 ring-inset ring-line-strong"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={saveNote}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-on"
            >
              Save note
            </button>
            <button
              type="button"
              onClick={() => setNoteFor(null)}
              className="rounded-md px-3 py-1.5 text-xs text-ink-soft"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => removeAt(noteFor)}
              className="ml-auto rounded-md px-3 py-1.5 text-xs text-bad"
            >
              Remove highlight
            </button>
          </div>
        </div>
      )}

      {noted.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-line pt-3">
          {noted.map((annotation) => (
            <li key={`${annotation.start}-${annotation.end}`} className="text-xs">
              <span
                className={`mr-2 rounded-sm px-1 ${colourClass(annotation.colour)}`}
                aria-hidden="true"
              >
                {text.slice(annotation.start, annotation.end).slice(0, 24)}
                {annotation.end - annotation.start > 24 ? '…' : ''}
              </span>
              <span className="text-ink-soft">{annotation.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
