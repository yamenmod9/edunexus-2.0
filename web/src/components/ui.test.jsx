import { describe, expect, it } from 'vitest'

import { formatClock, humanize } from './ui.jsx'

describe('humanize', () => {
  it('uses the taxonomy display names, not a title-cased enum', () => {
    // CLAUDE.md section 5 fixes these names exactly, and they are what a
    // student reads on the score report. Title-casing the enum drops the
    // ampersands and the hyphen, which is what this used to do - and what the
    // redesign's question metadata line made visible.
    expect(humanize('reading_writing')).toBe('Reading & Writing')
    expect(humanize('information_ideas')).toBe('Information & Ideas')
    expect(humanize('craft_structure')).toBe('Craft & Structure')
    expect(humanize('expression_of_ideas')).toBe('Expression of Ideas')
    expect(humanize('standard_english_conventions')).toBe(
      'Standard English Conventions',
    )
    expect(humanize('problem_solving_data_analysis')).toBe(
      'Problem-Solving & Data Analysis',
    )
    expect(humanize('geometry_trigonometry')).toBe('Geometry & Trigonometry')
    expect(humanize('advanced_math')).toBe('Advanced Math')
  })

  it('title-cases anything not in the table', () => {
    // Skills are free text (CLAUDE.md section 5), so they never appear in the
    // map and must still come out readable.
    expect(humanize('math')).toBe('Math')
    expect(humanize('algebra')).toBe('Algebra')
    expect(humanize('grid_in')).toBe('Grid In')
  })

  it('returns an empty string for nothing', () => {
    expect(humanize(null)).toBe('')
    expect(humanize(undefined)).toBe('')
    expect(humanize('')).toBe('')
  })
})

describe('formatClock', () => {
  it('pads and never goes negative', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(9)).toBe('00:09')
    expect(formatClock(75)).toBe('01:15')
    expect(formatClock(1920)).toBe('32:00')
    // An overrun clock reads 00:00, not a negative time.
    expect(formatClock(-5)).toBe('00:00')
    expect(formatClock(null)).toBe('00:00')
  })
})
