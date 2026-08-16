import katex from 'katex'
import { useMemo } from 'react'

/**
 * Renders question text with LaTeX math.
 *
 * Question content is authored by admins, but it is still data rather than
 * code, so it never reaches the DOM as raw HTML. Plain segments are emitted as
 * React text nodes (escaped by React), and only KaTeX's own output - generated
 * from the expression, with `trust: false` so \\href and friends are inert - is
 * injected as HTML.
 *
 * Delimiters: $$...$$ renders as a display block, $...$ inline. A lone $ is
 * left as a literal dollar sign, because "costs $5" is far more common in
 * these questions than a stray unclosed expression.
 */

const PATTERN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g

function renderMath(expression, displayMode) {
  try {
    return katex.renderToString(expression, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: false,
    })
  } catch {
    return null
  }
}

function segment(text) {
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(PATTERN)) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    const raw = match[0]
    const display = raw.startsWith('$$')
    const expression = display ? raw.slice(2, -2) : raw.slice(1, -1)
    const html = renderMath(expression, display)
    parts.push(
      html === null
        ? { type: 'text', value: raw } // unparseable: show the source, not a crash
        : { type: 'math', html, display },
    )
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return parts
}

export default function MathText({ children, className = '' }) {
  const blocks = useMemo(() => {
    if (!children) return []
    return String(children)
      .split(/\n{2,}/)
      .map((block) => segment(block))
  }, [children])

  if (!blocks.length) return null

  return (
    <div className={className}>
      {blocks.map((parts, blockIndex) => (
        // eslint-disable-next-line react/no-array-index-key
        <p key={blockIndex} className="mb-3 whitespace-pre-wrap last:mb-0">
          {parts.map((part, partIndex) =>
            part.type === 'math' ? (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={partIndex}
                className={part.display ? 'my-2 block overflow-x-auto' : ''}
                dangerouslySetInnerHTML={{ __html: part.html }}
              />
            ) : (
              // eslint-disable-next-line react/no-array-index-key
              <span key={partIndex}>{part.value}</span>
            ),
          )}
        </p>
      ))}
    </div>
  )
}
