import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import SplitPane from './SplitPane.jsx'

// jsdom reports 0 for every matchMedia query unless told otherwise, and the
// divider only exists on wide layouts.
function beWide(wide = true) {
  window.matchMedia = (query) => ({
    matches: wide,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })
}

describe('SplitPane', () => {
  beforeEach(() => {
    localStorage.clear()
    beWide(true)
  })

  it('starts at an even split', () => {
    render(<SplitPane storageKey="k" left={<p>left</p>} right={<p>right</p>} />)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50')
  })

  it('resizes from the keyboard, so a mouse is not required to use it', async () => {
    const user = userEvent.setup()
    render(<SplitPane storageKey="k" left={<p>left</p>} right={<p>right</p>} />)
    const divider = screen.getByRole('separator')

    divider.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(divider).toHaveAttribute('aria-valuenow', '54')

    await user.keyboard('{ArrowLeft}')
    expect(divider).toHaveAttribute('aria-valuenow', '52')
  })

  it('clamps rather than letting a pane be dragged out of existence', async () => {
    const user = userEvent.setup()
    render(<SplitPane storageKey="k" left={<p>left</p>} right={<p>right</p>} />)
    const divider = screen.getByRole('separator')

    divider.focus()
    await user.keyboard('{End}')
    expect(divider).toHaveAttribute('aria-valuenow', '75')
    await user.keyboard('{ArrowRight}')
    expect(divider).toHaveAttribute('aria-valuenow', '75')

    await user.keyboard('{Home}')
    expect(divider).toHaveAttribute('aria-valuenow', '25')
    await user.keyboard('{ArrowLeft}')
    expect(divider).toHaveAttribute('aria-valuenow', '25')
  })

  it('remembers the split, because it is a statement about how you read', () => {
    localStorage.setItem('k', '0.7')
    render(<SplitPane storageKey="k" left={<p>left</p>} right={<p>right</p>} />)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '70')
  })

  it('ignores a stored ratio that would hide a pane', () => {
    localStorage.setItem('k', '0.98')
    render(<SplitPane storageKey="k" left={<p>left</p>} right={<p>right</p>} />)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '75')
  })

  it('has no divider and no empty half when there is nothing to split', () => {
    // A multiple-choice maths question carries no passage and is not a
    // grid-in, so the question belongs centred, the way it was before.
    render(<SplitPane storageKey="k" left={null} right={<p>right</p>} />)
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByText('right')).toBeInTheDocument()
  })

  it('has no divider on a narrow screen, where there is no width to divide', () => {
    beWide(false)
    render(<SplitPane storageKey="k" left={<p>left</p>} right={<p>right</p>} />)
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByText('left')).toBeInTheDocument()
  })
})
