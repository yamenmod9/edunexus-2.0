import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import MathText from './MathText.jsx'

/**
 * The bug these exist to prevent: `$...$` is the math delimiter, so two prices
 * on one line ("costs $4 each and pens cost $2") used to be read as a math span.
 * Everything between the dollars rendered as italic math and both signs
 * disappeared. Currency is now authored as `\$`, and these pin that behaviour.
 */

function textOf(container) {
  return container.textContent
}

describe('MathText currency handling', () => {
  it('renders two escaped prices on one line as literal dollar signs', () => {
    const { container } = render(
      <MathText>
        {'A student has \\$80 to spend. Notebooks cost \\$4 each and pens cost \\$2 each.'}
      </MathText>,
    )
    const text = textOf(container)
    expect(text).toContain('$80')
    expect(text).toContain('$4')
    expect(text).toContain('$2')
    // The prose between the prices must survive intact, not be eaten as math.
    expect(text).toContain('to spend')
    expect(text).toContain('Notebooks cost')
    // No KaTeX span should have been produced for prose.
    expect(container.querySelectorAll('.katex')).toHaveLength(0)
  })

  it('still renders real math alongside currency', () => {
    const { container } = render(
      <MathText>{'An item costs \\$120. If $2x = 10$, what is $x$?'}</MathText>,
    )
    expect(textOf(container)).toContain('$120')
    // Two inline expressions were delimited, so KaTeX should have run twice.
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2)
  })

  it('leaves a single unpaired dollar alone', () => {
    const { container } = render(<MathText>{'The ticket cost $5 in total.'}</MathText>)
    expect(textOf(container)).toContain('$5')
    expect(container.querySelectorAll('.katex')).toHaveLength(0)
  })

  it('renders display math as a block', () => {
    const { container } = render(<MathText>{'$$x + y = 12$$'}</MathText>)
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(1)
  })

  it('shows the source rather than crashing on an unparseable expression', () => {
    render(<MathText>{'$\\thisIsNotACommand{{{$'}</MathText>)
    expect(screen.getByText(/thisIsNotACommand/)).toBeInTheDocument()
  })
})
