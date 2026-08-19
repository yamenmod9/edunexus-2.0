import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import FloatingPanel from './FloatingPanel.jsx'

function panelAt() {
  const panel = screen.getByRole('dialog', { name: 'Calculator' })
  return { x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) }
}

function renderPanel(props = {}) {
  return render(
    <FloatingPanel
      title="Calculator"
      storageKey="pos"
      width={400}
      height={300}
      onClose={() => {}}
      {...props}
    >
      <p>body</p>
    </FloatingPanel>,
  )
}

describe('FloatingPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    window.innerWidth = 1000
    window.innerHeight = 800
  })

  it('is a non-modal dialog — the point is to use it while reading', () => {
    // aria-modal would tell a screen reader the rest of the page is inert,
    // which is the opposite of what a calculator beside a question is for.
    renderPanel()
    const panel = screen.getByRole('dialog', { name: 'Calculator' })
    expect(panel).not.toHaveAttribute('aria-modal')
  })

  it('moves with the arrow keys, so it can be got out of the way without a mouse', async () => {
    const user = userEvent.setup()
    renderPanel({ initial: { x: 100, y: 100 } })

    screen.getByRole('button', { name: /Move the calculator/ }).focus()
    await user.keyboard('{ArrowRight}{ArrowDown}')

    expect(panelAt()).toEqual({ x: 124, y: 124 })
  })

  it('keeps the whole panel on screen, not just its header', async () => {
    // Dragged half off the bottom, a calculator is one you cannot read the
    // answer off, and nothing on this screen scrolls to reveal it.
    const user = userEvent.setup()
    renderPanel({ initial: { x: 100, y: 100 } })

    screen.getByRole('button', { name: /Move the calculator/ }).focus()
    await user.keyboard('{ArrowDown}'.repeat(60))

    // 800 tall - 300 body - 34 header - 8 margin
    expect(panelAt().y).toBe(458)
  })

  it('pulls a stored position back on screen when the window has shrunk', () => {
    localStorage.setItem('pos', JSON.stringify({ x: 900, y: 700 }))
    renderPanel()
    const { x, y } = panelAt()
    expect(x).toBeLessThanOrEqual(1000 - 400 - 8)
    expect(y).toBeLessThanOrEqual(800 - 300 - 34 - 8)
  })

  it('survives a corrupt stored position rather than failing the module', () => {
    localStorage.setItem('pos', 'not json')
    renderPanel({ initial: { x: 42, y: 42 } })
    expect(panelAt()).toEqual({ x: 42, y: 42 })
  })

  it('can be closed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel({ onClose })
    await user.click(screen.getByRole('button', { name: 'Close Calculator' }))
    expect(onClose).toHaveBeenCalled()
  })
})
