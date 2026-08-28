import { describe, expect, it } from 'vitest'

import { flattenQuestions, isReviewFilter, matchesFilter } from './reviewFilters.js'

const modules = [
  {
    order_index: 1,
    sequence: 1,
    section: 'reading_writing',
    questions: [
      { position: 1, is_correct: true, answer: 'B', flagged: false, question: { id: 'a' } },
      { position: 2, is_correct: false, answer: 'C', flagged: true, question: { id: 'b' } },
    ],
  },
  {
    order_index: 2,
    sequence: 2,
    section: 'math',
    questions: [
      { position: 1, is_correct: false, answer: '', flagged: false, question: { id: 'c' } },
      { position: 2, is_correct: false, answer: null, flagged: true, question: { id: 'd' } },
    ],
  },
]

describe('flattenQuestions', () => {
  it('returns every question across every module, in order', () => {
    expect(flattenQuestions(modules).map((e) => e.question.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('carries the module along, so a flat list can still say where it came from', () => {
    expect(flattenQuestions(modules)[3].module.section).toBe('math')
  })

  it('survives a payload with no modules', () => {
    expect(flattenQuestions(undefined)).toEqual([])
    expect(flattenQuestions([{ order_index: 1 }])).toEqual([])
  })
})

describe('matchesFilter', () => {
  const entries = flattenQuestions(modules)
  const ids = (filter) => entries.filter((e) => matchesFilter(e, filter)).map((e) => e.question.id)

  it('all keeps everything', () => {
    expect(ids('all')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('incorrect means answered and wrong, never unanswered', () => {
    // Running out of time and getting it wrong are different problems with
    // different fixes; counting a skip as an error hides which one you have.
    expect(ids('incorrect')).toEqual(['b'])
  })

  it('skipped catches both an empty answer and a missing one', () => {
    expect(ids('skipped')).toEqual(['c', 'd'])
  })

  it('marked is independent of whether it was right', () => {
    expect(ids('marked')).toEqual(['b', 'd'])
  })

  it('an unknown filter falls back to showing everything', () => {
    // The filter comes from the URL, where anyone can type anything.
    expect(ids('nonsense')).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('isReviewFilter', () => {
  it('accepts the four real filters and nothing else', () => {
    expect(['all', 'incorrect', 'skipped', 'marked'].every(isReviewFilter)).toBe(true)
    expect(isReviewFilter('nonsense')).toBe(false)
    expect(isReviewFilter(null)).toBe(false)
  })
})
