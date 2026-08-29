import { describe, expect, it } from 'vitest'

import {
  countSelected,
  describeSelection,
  leafKey,
  leavesOfDomain,
  queryToSelection,
  selectionTitle,
  selectionToQuery,
} from './practiceSelection.js'

const taxonomy = {
  sections: [
    {
      value: 'math',
      label: 'Math',
      domains: [
        { value: 'algebra', label: 'Algebra', skills: ['Linear equations', 'Systems'] },
        { value: 'geometry_trigonometry', label: 'Geometry & Trigonometry', skills: ['Circles'] },
      ],
    },
    {
      value: 'reading_writing',
      label: 'Reading & Writing',
      domains: [
        { value: 'craft_structure', label: 'Craft & Structure', skills: ['Words in context'] },
      ],
    },
  ],
}

const ALGEBRA = taxonomy.sections[0].domains[0]
const GEOMETRY = taxonomy.sections[0].domains[1]

describe('leavesOfDomain', () => {
  it('is one leaf per skill', () => {
    expect(leavesOfDomain('math', ALGEBRA)).toEqual([
      'math::algebra::Linear equations',
      'math::algebra::Systems',
    ])
  })
})

describe('selectionToQuery', () => {
  it('sends nothing when nothing is selected', () => {
    expect(selectionToQuery(new Set(), taxonomy)).toEqual({})
  })

  it('collapses a fully selected domain to that one domain', () => {
    // The common case - one click on a category - and the shortest URL that
    // says exactly it.
    const selection = new Set(leavesOfDomain('math', ALGEBRA))
    expect(selectionToQuery(selection, taxonomy)).toEqual({ domain: ['algebra'] })
  })

  it('sends skills when only part of a domain is selected', () => {
    const selection = new Set([leafKey('math', 'algebra', 'Systems')])
    expect(selectionToQuery(selection, taxonomy)).toEqual({ skill: ['Systems'] })
  })

  it('never mixes domain and skill in one query', () => {
    // The API ANDs across fields, so `domain=algebra&skill=Circles` asks for
    // questions that are Algebra AND named Circles - which is empty, not
    // "Algebra plus Circles". A mixed selection has to become skills only.
    const selection = new Set([
      ...leavesOfDomain('math', ALGEBRA),
      leafKey('math', 'geometry_trigonometry', 'Circles'),
    ])
    const query = selectionToQuery(selection, taxonomy)

    expect(query.domain).toBeUndefined()
    expect(query.skill.sort()).toEqual(['Circles', 'Linear equations', 'Systems'])
  })

  it('spans sections, because a student may want both at once', () => {
    const selection = new Set([
      leafKey('math', 'algebra', 'Systems'),
      leafKey('reading_writing', 'craft_structure', 'Words in context'),
    ])
    expect(selectionToQuery(selection, taxonomy).skill.sort()).toEqual([
      'Systems',
      'Words in context',
    ])
  })

  it('does not collapse to a domain the taxonomy does not know', () => {
    // A stale link naming a removed domain must not be read as "all of it".
    const selection = new Set(['math::retired_domain::Something'])
    expect(selectionToQuery(selection, taxonomy)).toEqual({ skill: ['Something'] })
  })
})

describe('queryToSelection', () => {
  it('expands a domain back to all its leaves', () => {
    const selection = queryToSelection(new URLSearchParams('domain=algebra'), taxonomy)
    expect([...selection].sort()).toEqual([
      'math::algebra::Linear equations',
      'math::algebra::Systems',
    ])
  })

  it('restores individually chosen skills', () => {
    const selection = queryToSelection(
      new URLSearchParams('skill=Systems&skill=Circles'),
      taxonomy,
    )
    expect([...selection].sort()).toEqual([
      'math::algebra::Systems',
      'math::geometry_trigonometry::Circles',
    ])
  })

  it('round-trips a partial selection', () => {
    const original = new Set([
      leafKey('math', 'algebra', 'Systems'),
      leafKey('math', 'geometry_trigonometry', 'Circles'),
    ])
    const query = selectionToQuery(original, taxonomy)
    const params = new URLSearchParams()
    for (const skill of query.skill) params.append('skill', skill)

    expect(queryToSelection(params, taxonomy)).toEqual(original)
  })

  it('ignores names that are no longer in the taxonomy', () => {
    const selection = queryToSelection(new URLSearchParams('skill=Vanished'), taxonomy)
    expect(selection.size).toBe(0)
  })

  it('is empty before the taxonomy has loaded', () => {
    expect(queryToSelection(new URLSearchParams('domain=algebra'), null).size).toBe(0)
  })
})

describe('countSelected', () => {
  const counts = {
    total: 9,
    sections: {
      math: {
        total: 9,
        domains: {
          algebra: { total: 7, skills: { 'Linear equations': 5, Systems: 2 } },
          geometry_trigonometry: { total: 2, skills: { Circles: 2 } },
        },
      },
    },
  }

  it('adds up the leaves that are selected', () => {
    const selection = new Set([
      leafKey('math', 'algebra', 'Systems'),
      leafKey('math', 'geometry_trigonometry', 'Circles'),
    ])
    expect(countSelected(selection, counts)).toBe(4)
  })

  it('counts a category the current filters emptied as zero, not as missing', () => {
    // With difficulty set to hard, a skill can vanish from the counts payload
    // entirely; the footer must say 0 rather than NaN.
    const selection = new Set([leafKey('math', 'algebra', 'Gone')])
    expect(countSelected(selection, counts)).toBe(0)
  })

  it('is zero before the counts have loaded', () => {
    expect(countSelected(new Set([leafKey('math', 'algebra', 'Systems')]), null)).toBe(0)
  })
})

describe('describeSelection', () => {
  it('counts a fully ticked domain as one thing, not as its skills', () => {
    // Ticking "Algebra" is one action. Reporting "2 selected" to someone who
    // ticked one box is just wrong.
    const selection = new Set(leavesOfDomain('math', ALGEBRA))
    expect(describeSelection(selection, taxonomy)).toBe(1)
  })

  it('counts individual skills when a domain is only partly ticked', () => {
    const selection = new Set([leafKey('math', 'algebra', 'Systems')])
    expect(describeSelection(selection, taxonomy)).toBe(1)
  })

  it('adds up across domains', () => {
    const selection = new Set([
      ...leavesOfDomain('math', ALGEBRA),
      ...leavesOfDomain('math', GEOMETRY),
    ])
    expect(describeSelection(selection, taxonomy)).toBe(2)
  })

  it('is zero for an empty selection', () => {
    expect(describeSelection(new Set(), taxonomy)).toBe(0)
  })
})

describe('selectionTitle', () => {
  it('names a single domain', () => {
    expect(selectionTitle(['algebra'], [], taxonomy)).toBe('Algebra')
  })

  it('names a single skill', () => {
    expect(selectionTitle([], ['Circles'], taxonomy)).toBe('Circles')
  })

  it('summarises rather than listing every skill', () => {
    // Four skill names concatenated is not a heading, it is a paragraph.
    expect(selectionTitle([], ['Circles', 'Systems'], taxonomy)).toBe('2 categories')
  })

  it('counts the way the student ticked, so it agrees with the footer', () => {
    // Ticking Algebra and Geometry sends four skills, but the student ticked
    // two boxes and the footer said "2 categories" a moment earlier.
    const query = selectionToQuery(
      new Set([...leavesOfDomain('math', ALGEBRA), ...leavesOfDomain('math', GEOMETRY)]),
      taxonomy,
    )
    expect(selectionTitle([], query.skill, taxonomy)).toBe('2 categories')
  })

  it('falls back to the raw number before the taxonomy has loaded', () => {
    expect(selectionTitle([], ['A', 'B', 'C'], null)).toBe('3 categories')
  })

  it('falls back to the raw value for a domain the taxonomy lost', () => {
    expect(selectionTitle(['retired'], [], taxonomy)).toBe('retired')
  })
})
