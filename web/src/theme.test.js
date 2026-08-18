import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readPreference, resolveTheme } from './theme.js'

/**
 * The preference is deliberately three-valued. Storing a resolved boolean
 * instead would freeze someone who picked "system" into whichever theme their
 * OS happened to be in, and stop them following it when it changes.
 */

function mockSystemDark(dark) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === '(prefers-color-scheme: dark)' ? dark : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  mockSystemDark(false)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('readPreference', () => {
  it('defaults to system when nothing is stored', () => {
    expect(readPreference()).toBe('system')
  })

  it('reads a stored explicit choice', () => {
    localStorage.setItem('edunexus-theme', 'dark')
    expect(readPreference()).toBe('dark')
  })

  it('treats an unrecognised stored value as system', () => {
    localStorage.setItem('edunexus-theme', 'sepia')
    expect(readPreference()).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('honours an explicit choice over the system setting', () => {
    mockSystemDark(true)
    expect(resolveTheme('light')).toBe('light')
    mockSystemDark(false)
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('follows the system when the choice is system', () => {
    mockSystemDark(true)
    expect(resolveTheme('system')).toBe('dark')
    mockSystemDark(false)
    expect(resolveTheme('system')).toBe('light')
  })
})

describe('the pre-paint script in index.html', () => {
  it('applies the same rules as this module', async () => {
    // The inline script duplicates the logic because the bundle loads far too
    // late to prevent a flash. If they drift, the page flashes the wrong
    // theme on load — so pin that they agree.
    // process.cwd() is the web/ project root under vitest; import.meta.url is
    // not a file: URL here, so it cannot be resolved against.
    const fs = await import('node:fs')
    const path = await import('node:path')
    const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain("localStorage.getItem('edunexus-theme')")
    expect(html).toContain("saved === 'dark'")
    expect(html).toContain("saved !== 'light'")
    expect(html).toContain('(prefers-color-scheme: dark)')
    expect(html).toContain("classList.add('dark')")
  })
})
