import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useResource } from '../api/cache.js'
import { questions as questionsApi, taxonomy as taxonomyApi } from '../api/client.js'
import PracticeQuestion from '../components/PracticeQuestion.jsx'
import { Alert, Button, SectionLabel, Spinner } from '../components/ui.jsx'
import { readLocal, writeLocal } from '../storage.js'
import {
  countSelected,
  describeSelection,
  leafKey,
  leavesOfDomain,
  queryToSelection,
  selectionTitle,
  selectionToQuery,
} from './practiceSelection.js'

/**
 * Practice: browse the bank by category, then solve.
 *
 * Two views on one route, told apart by the URL. With no category chosen you
 * get the browser — both sections side by side, each showing its domains and
 * the skills under them with a count beside every row. Choose one and the same
 * route becomes the solving view.
 *
 * The URL carries the whole thing, so a category is a link a student can keep,
 * the back button leaves a set of questions the way they expect, and a reload
 * mid-session does not dump them back at the top.
 *
 * The counts come from the server per request rather than from the cached
 * taxonomy, because they move with the difficulty filter — a browser that
 * advertises 40 questions and then hands over 3 hard ones is worse than one
 * that says 3.
 */

const SIDEBAR_KEY = 'edunexus.practice.sidebar'

function Chevron({ open }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform ${open ? '' : '-rotate-90'}`}
    >
      <path d="M5 9l7 7 7-7" />
    </svg>
  )
}

/** One domain, with its skills underneath. */
function DomainRow({ section, domain, counts, combine, selected, onToggle, onPractice }) {
  const [open, setOpen] = useState(false)
  const stats = counts?.sections?.[section]?.domains?.[domain.value]
  const total = stats?.total ?? 0
  const leaves = leavesOfDomain(section, domain)
  const chosen = leaves.filter((leaf) => selected.has(leaf)).length
  const allChosen = leaves.length > 0 && chosen === leaves.length

  return (
    <div className="border-b border-line">
      <div className="flex items-center gap-2 py-2.5">
        {combine && (
          <input
            type="checkbox"
            checked={allChosen}
            ref={(node) => {
              // Partly chosen is neither ticked nor empty, and only the DOM
              // can say so.
              if (node) node.indeterminate = chosen > 0 && !allChosen
            }}
            onChange={() => onToggle(leaves, !allChosen)}
            aria-label={`${domain.label}, all ${leaves.length} skills`}
            disabled={total === 0}
            className="h-4 w-4 flex-shrink-0"
          />
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          disabled={leaves.length === 0}
          className="flex flex-grow items-center gap-2 text-left text-sm font-medium
            text-ink hover:text-accent disabled:text-ink-faint"
        >
          <Chevron open={open} />
          {domain.label}
        </button>

        <span className="font-mono text-xs tabular-nums text-ink-faint">{total}</span>

        {!combine && (
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            disabled={total === 0}
            onClick={() => onPractice(leaves)}
          >
            Practise
          </Button>
        )}
      </div>

      {open && (
        <ul className="mb-2 space-y-0.5 pl-6">
          {(domain.skills ?? []).map((skill) => {
            const key = leafKey(section, domain.value, skill)
            const count = stats?.skills?.[skill] ?? 0
            return (
              <li key={skill} className="flex items-center gap-2 py-1">
                {combine && (
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => onToggle([key], !selected.has(key))}
                    aria-label={skill}
                    disabled={count === 0}
                    className="h-3.5 w-3.5 flex-shrink-0"
                  />
                )}
                <span className="flex-grow text-[13px] text-ink-soft">{skill}</span>
                <span className="font-mono text-[11px] tabular-nums text-ink-faint">
                  {count}
                </span>
                {!combine && (
                  <Button
                    variant="ghost"
                    className="px-2 py-0.5 text-[11px]"
                    disabled={count === 0}
                    onClick={() => onPractice([key])}
                  >
                    Practise
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function PracticePage() {
  const [params, setParams] = useSearchParams()
  // The taxonomy is fixed by CLAUDE.md section 5 and never changes at runtime.
  const { data: taxonomy } = useResource('taxonomy', () => taxonomyApi.get())
  const [sidebarOpen, setSidebarOpen] = useState(() => readLocal(SIDEBAR_KEY) !== 'closed')

  const difficulty = params.get('difficulty') ?? ''
  const questionType = params.get('question_type') ?? ''
  const combine = params.get('combine') === '1'
  const chosenDomains = params.getAll('domain').filter(Boolean)
  const chosenSkills = params.getAll('skill').filter(Boolean)
  const solving = chosenDomains.length > 0 || chosenSkills.length > 0

  const filters = useMemo(
    () => ({ difficulty, question_type: questionType }),
    [difficulty, questionType],
  )

  const { data: counts } = useResource(`counts:${difficulty}:${questionType}`, () =>
    questionsApi.counts(filters),
  )

  // The draft selection only means anything while combining.
  const [draft, setDraft] = useState(() => new Set())
  const selected = combine ? draft : new Set()
  const selectedCount = countSelected(selected, counts)
  const tickedCount = describeSelection(selected, taxonomy)

  function update(next) {
    const query = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      query.delete(key)
      if (value !== '' && value != null) query.append(key, value)
    }
    setParams(query)
  }

  /** Keeps the sidebar's settings, replaces whatever was being solved. */
  function withFilters(extra = {}) {
    const query = new URLSearchParams()
    if (difficulty) query.set('difficulty', difficulty)
    if (questionType) query.set('question_type', questionType)
    for (const [key, values] of Object.entries(extra)) {
      for (const value of values) query.append(key, value)
    }
    return query
  }

  function practise(leaves) {
    setParams(withFilters(selectionToQuery(new Set(leaves), taxonomy)))
  }

  function toggleLeaves(leaves, on) {
    setDraft((current) => {
      const next = new Set(current)
      for (const leaf of leaves) {
        if (on) next.add(leaf)
        else next.delete(leaf)
      }
      return next
    })
  }

  function toggleCombine() {
    if (combine) {
      setDraft(new Set())
      update({ combine: '' })
    } else {
      // Carry whatever the URL already describes into the checkboxes, so
      // turning the option on mid-session does not start from nothing.
      setDraft(queryToSelection(params, taxonomy))
      update({ combine: '1' })
    }
  }

  function backToCategories() {
    const query = withFilters()
    if (combine) query.set('combine', '1')
    setParams(query)
  }

  const sections = taxonomy?.sections ?? []

  return (
    <div className="flex gap-6">
      {sidebarOpen ? (
        <aside className="w-56 flex-shrink-0 border-r border-line pr-5">
          <div className="mb-5 flex items-center">
            <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">
              Filters
            </h2>
            <button
              type="button"
              onClick={() => {
                setSidebarOpen(false)
                writeLocal(SIDEBAR_KEY, 'closed')
              }}
              aria-label="Hide filters"
              className="ml-auto rounded p-1 text-ink-faint hover:bg-sunken hover:text-ink"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>

          <label
            htmlFor="filter-difficulty"
            className="mb-1.5 block text-xs font-semibold text-ink-soft"
          >
            Difficulty
          </label>
          <select
            id="filter-difficulty"
            value={difficulty}
            onChange={(event) => update({ difficulty: event.target.value })}
            className={`mb-4 w-full rounded-md bg-surface px-2.5 py-2 text-sm ring-1 ring-inset
              ${difficulty ? 'text-ink ring-accent' : 'text-ink-faint ring-line-strong'}`}
          >
            <option value="">Any</option>
            {(taxonomy?.difficulties ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label
            htmlFor="filter-type"
            className="mb-1.5 block text-xs font-semibold text-ink-soft"
          >
            Question type
          </label>
          <select
            id="filter-type"
            value={questionType}
            onChange={(event) => update({ question_type: event.target.value })}
            className={`mb-5 w-full rounded-md bg-surface px-2.5 py-2 text-sm ring-1 ring-inset
              ${questionType ? 'text-ink ring-accent' : 'text-ink-faint ring-line-strong'}`}
          >
            <option value="">Any</option>
            {(taxonomy?.question_types ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="flex items-start gap-2.5 border-t border-line pt-4">
            {/* Label beside the input rather than wrapping it: a wrapping
                label forwards a second click to the box it contains, so the
                toggle fired twice and settled back where it started. */}
            <input
              id="combine-categories"
              type="checkbox"
              checked={combine}
              onChange={toggleCombine}
              className="mt-0.5 h-4 w-4 flex-shrink-0"
            />
            <label htmlFor="combine-categories" className="cursor-pointer">
              <span className="block text-xs font-semibold text-ink">
                Combine categories
              </span>
              <span className="block text-[11px] leading-snug text-ink-faint">
                Tick several and practise them in one set.
              </span>
            </label>
          </div>

          {counts && (
            <div className="mt-5 border-t border-line pt-4" aria-live="polite">
              <p className="font-mono text-2xl tabular-nums">{counts.total}</p>
              <p className="text-xs text-ink-faint">
                question{counts.total === 1 ? '' : 's'} available
              </p>
            </div>
          )}
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => {
            setSidebarOpen(true)
            writeLocal(SIDEBAR_KEY, 'open')
          }}
          aria-label="Show filters"
          className="h-9 flex-shrink-0 rounded-md px-2 text-ink-faint ring-1 ring-line-strong
            hover:bg-sunken hover:text-ink"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      )}

      <div className="min-w-0 flex-grow">
        {solving ? (
          <SolvingView
            filters={filters}
            domains={chosenDomains}
            skills={chosenSkills}
            title={selectionTitle(chosenDomains, chosenSkills, taxonomy)}
            onBack={backToCategories}
          />
        ) : (
          <>
            <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">Practice</h1>
            <p className="mb-7 text-sm text-ink-faint">
              Pick a category to work through. Nothing here is timed — the clock on each
              question is a study statistic, not a limit.
            </p>

            {!taxonomy && <Spinner label="Loading categories" />}

            {/* Both sections at once, each owning half the width: the bank is
                two subjects, and making a student choose one before they can
                see the other hides half of what they came to find. */}
            <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
              {sections.map((section) => (
                <section key={section.value}>
                  <SectionLabel>
                    {section.label}
                    <span className="ml-2 font-mono text-[11px] tabular-nums text-ink-faint">
                      {counts?.sections?.[section.value]?.total ?? 0}
                    </span>
                  </SectionLabel>
                  {(section.domains ?? []).map((domain) => (
                    <DomainRow
                      key={domain.value}
                      section={section.value}
                      domain={domain}
                      counts={counts}
                      combine={combine}
                      selected={selected}
                      onToggle={toggleLeaves}
                      onPractice={practise}
                    />
                  ))}
                </section>
              ))}
            </div>

            {combine && (
              <div
                className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-lg
                  bg-surface p-3.5 shadow-lg ring-1 ring-line-strong"
              >
                <span className="text-sm">
                  {selected.size === 0
                    ? 'Tick the categories you want to practise together.'
                    : `${tickedCount} categor${tickedCount === 1 ? 'y' : 'ies'} · ${selectedCount} question${
                        selectedCount === 1 ? '' : 's'
                      }`}
                </span>
                <div className="ml-auto flex gap-2">
                  {selected.size > 0 && (
                    <Button variant="secondary" onClick={() => setDraft(new Set())}>
                      Clear
                    </Button>
                  )}
                  <Button
                    disabled={selectedCount === 0}
                    onClick={() => practise([...selected])}
                  >
                    Practise {selectedCount} question{selectedCount === 1 ? '' : 's'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The questions themselves, once a category has been chosen. */
function SolvingView({ filters, domains, skills, title, onBack }) {
  const [page, setPage] = useState(1)
  const query = useMemo(
    () => ({ ...filters, domain: domains, skill: skills, page, per_page: 5 }),
    [filters, domains, skills, page],
  )
  const { data, error } = useResource(`practice:${JSON.stringify(query)}`, () =>
    questionsApi.list(query),
  )

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex items-center gap-1.5 text-sm text-accent hover:underline"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        All categories
      </button>

      <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mb-7 text-sm text-ink-faint">
        {data ? `${data.total} question${data.total === 1 ? '' : 's'}` : 'Loading…'}
      </p>

      {error && <Alert>{error}</Alert>}
      {!data && !error && <Spinner label="Loading questions" />}

      {data && data.items.length === 0 && (
        <Alert tone="info">No questions match these filters.</Alert>
      )}

      {data && data.items.length > 0 && (
        <>
          {data.items.map((question) => (
            <PracticeQuestion key={question.id} question={question} />
          ))}
          <div className="mt-6 flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={data.page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <span className="ml-auto text-xs text-ink-faint">
              Page {data.page} of {Math.max(1, data.pages)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
