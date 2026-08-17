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
 *
 * Currency: a lone $ survives, but TWO prices on one line used to be read as a
 * math span - "costs $4 each and pens cost $2" rendered "4 each and pens cost"
 * as italic math and ate both dollar signs. Authors therefore write currency as
 * `\$`, which is masked out below before delimiter matching and restored
 * afterwards: as a literal `$` in prose, and as KaTeX's own `\$` inside math.
 */

const PATTERN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g

// A character that cannot appear in authored content, so masking is reversible.
const ESCAPED_DOLLAR = '\u0000'

function mask(text) {
  return text.replace(/\\\$/g, ESCAPED_DOLLAR)
}

function unmaskText(text) {
  return text.split(ESCAPED_DOLLAR).join('$')
}

function unmaskMath(expression) {
  return expression.split(ESCAPED_DOLLAR).join('\\$')
}

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

function segment(rawText) {
  // Escaped currency is masked first so it can never open or close a math span.
  const text = mask(rawText)
  const parts = []
  let lastIndex = 0

  for (const match of text.matchAll(PATTERN)) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: unmaskText(text.slice(lastIndex, match.index)),
      })
    }
    const raw = match[0]
    const display = raw.startsWith('$$')
    const expression = unmaskMath(display ? raw.slice(2, -2) : raw.slice(1, -1))
    const html = renderMath(expression, display)
    parts.push(
      html === null
        ? { type: 'text', value: unmaskText(raw) } // unparseable: show the source, not a crash
        : { type: 'math', html, display },
    )
    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: unmaskText(text.slice(lastIndex)) })
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
