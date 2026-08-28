import { afterEach, describe, expect, it } from 'vitest'

import { readLocal, readLocalJson, writeLocal } from './storage.js'

const real = window.localStorage

function withStorage(fake) {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: fake })
}

afterEach(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: real })
})

function throwing(error) {
  const boom = () => {
    throw error
  }
  return { getItem: boom, setItem: boom, removeItem: boom, clear: boom }
}

describe('guarded localStorage', () => {
  it('reads and writes normally when storage works', () => {
    writeLocal('k', 'v')
    expect(readLocal('k')).toBe('v')
  })

  it('survives storage that is blocked outright', () => {
    // Safari private mode and "block all cookies" throw on read, not return null.
    withStorage(throwing(new DOMException('The operation is insecure.', 'SecurityError')))
    expect(readLocal('k')).toBeNull()
    expect(() => writeLocal('k', 'v')).not.toThrow()
  })

  it('survives a write that overflows the quota', () => {
    // The dangerous one: reads work, a one-time probe at boot passes, and the
    // throw arrives later from whichever write happens to overflow. Before
    // this guard it blanked the test player mid-module.
    const quota = new DOMException('QuotaExceededError', 'QuotaExceededError')
    withStorage({
      getItem: () => 'existing',
      setItem: () => {
        throw quota
      },
      removeItem: () => {},
      clear: () => {},
    })
    expect(readLocal('k')).toBe('existing')
    expect(() => writeLocal('k', 'v')).not.toThrow()
  })

  it('reads JSON, and treats malformed JSON as absent', () => {
    writeLocal('j', JSON.stringify({ x: 1 }))
    expect(readLocalJson('j')).toEqual({ x: 1 })

    writeLocal('j', 'not json')
    expect(readLocalJson('j')).toBeNull()
  })

  it('treats a missing key as null rather than throwing on JSON.parse', () => {
    expect(readLocalJson('never-written')).toBeNull()
  })
})

describe('the components that store preferences', () => {
  it('never reach localStorage directly', async () => {
    // The guard only helps if it is the single door. A direct call added later
    // reintroduces exactly the crash this module exists to prevent.
    const files = import.meta.glob(
      ['./components/SplitPane.jsx', './components/FloatingPanel.jsx', './pages/TestPlayerPage.jsx'],
      { query: '?raw', import: 'default', eager: true },
    )
    for (const [name, source] of Object.entries(files)) {
      expect(source, `${name} should use storage.js, not localStorage directly`).not.toMatch(
        /localStorage\./,
      )
    }
  })
})
