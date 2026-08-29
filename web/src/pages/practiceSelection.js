/**
 * Turning "these categories" into a question-bank query, and back.
 *
 * A selection is a set of leaves — one skill within one domain within one
 * section — keyed as `section::domain::skill`. Ticking a whole domain is
 * shorthand for ticking every leaf under it.
 *
 * The encoding has one real constraint to respect. The API ANDs across fields
 * and ORs within one, so `?domain=algebra&skill=Circles` asks for questions
 * that are Algebra *and* named Circles — which is empty, not "Algebra plus
 * Circles". So a mixed selection is expanded to skills only, and `domain` is
 * used only when nothing else is selected alongside it, where it is exact and
 * makes for a far shorter URL.
 *
 * Known limit, worth stating rather than discovering: `skill` is free text
 * (CLAUDE.md section 5), so if the same skill name ever appeared under two
 * domains, a skills-only query would pull both. No name is currently shared,
 * and the alternative encodings are all worse.
 */

export const SEPARATOR = '::'

export function leafKey(section, domain, skill) {
  return [section, domain, skill].join(SEPARATOR)
}

export function parseLeaf(key) {
  const [section, domain, skill] = key.split(SEPARATOR)
  return { section, domain, skill }
}

/** Every leaf under a taxonomy domain. */
export function leavesOfDomain(section, domain) {
  return (domain.skills ?? []).map((skill) => leafKey(section, domain.value, skill))
}

/** Turns a set of leaf keys into query params for the questions API. */
export function selectionToQuery(selected, taxonomy) {
  const leaves = [...selected].map(parseLeaf).filter((leaf) => leaf.skill)
  if (leaves.length === 0) return {}

  const byDomain = new Map()
  for (const leaf of leaves) {
    if (!byDomain.has(leaf.domain)) byDomain.set(leaf.domain, new Set())
    byDomain.get(leaf.domain).add(leaf.skill)
  }

  // A single, fully selected domain is the common case — one click on a
  // category — and `?domain=algebra` says exactly that.
  if (byDomain.size === 1) {
    const [domainValue, skills] = [...byDomain.entries()][0]
    const declared = findDomain(taxonomy, domainValue)
    if (declared && skills.size === (declared.skills ?? []).length) {
      return { domain: [domainValue] }
    }
  }

  return { skill: [...new Set(leaves.map((leaf) => leaf.skill))] }
}

function findDomain(taxonomy, value) {
  for (const section of taxonomy?.sections ?? []) {
    const found = (section.domains ?? []).find((domain) => domain.value === value)
    if (found) return found
  }
  return null
}

/** Rebuilds the selected leaves from query params, so a link restores it. */
export function queryToSelection(params, taxonomy) {
  const domains = params.getAll('domain').filter(Boolean)
  const skills = new Set(params.getAll('skill').filter(Boolean))
  const selected = new Set()

  for (const section of taxonomy?.sections ?? []) {
    for (const domain of section.domains ?? []) {
      const whole = domains.includes(domain.value)
      for (const skill of domain.skills ?? []) {
        if (whole || skills.has(skill)) {
          selected.add(leafKey(section.value, domain.value, skill))
        }
      }
    }
  }
  return selected
}

/** How many questions a selection covers, from the counts payload. */
export function countSelected(selected, counts) {
  let total = 0
  for (const key of selected) {
    const { section, domain, skill } = parseLeaf(key)
    total += counts?.sections?.[section]?.domains?.[domain]?.skills?.[skill] ?? 0
  }
  return total
}

/**
 * How many things the student thinks they ticked.
 *
 * The internal unit is a leaf, but ticking "Algebra" is one action that
 * selects several - so counting leaves reports "4 selected" to someone who
 * ticked two boxes. A fully selected domain counts as one; anything partial
 * counts its skills.
 */
export function describeSelection(selected, taxonomy) {
  const byDomain = new Map()
  for (const key of selected) {
    const { domain, skill } = parseLeaf(key)
    if (!byDomain.has(domain)) byDomain.set(domain, new Set())
    byDomain.get(domain).add(skill)
  }

  let count = 0
  for (const [value, skills] of byDomain) {
    const declared = findDomain(taxonomy, value)
    const whole = declared && skills.size === (declared.skills ?? []).length
    count += whole ? 1 : skills.size
  }
  return count
}

/** A short name for whatever is being solved, for the page heading. */
export function selectionTitle(domains, skills, taxonomy) {
  if (domains.length === 1 && skills.length === 0) {
    return findDomain(taxonomy, domains[0])?.label ?? domains[0]
  }
  if (skills.length === 1 && domains.length === 0) return skills[0]

  // Counted the way the student ticked it, not the way the URL spells it.
  // Ticking two domains becomes four skills in the query, and a heading that
  // then says "4 categories" contradicts the footer they clicked to get here.
  const params = new URLSearchParams()
  for (const domain of domains) params.append('domain', domain)
  for (const skill of skills) params.append('skill', skill)
  const ticked = describeSelection(queryToSelection(params, taxonomy), taxonomy)

  return `${ticked || domains.length + skills.length} categories`
}
