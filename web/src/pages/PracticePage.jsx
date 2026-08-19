import { useEffect, useState } from 'react'

import { useResource } from '../api/cache.js'
import { questions as questionsApi, taxonomy as taxonomyApi } from '../api/client.js'
import MathText from '../components/MathText.jsx'
import {
  Alert,
  Button,
  Card,
  ChoicePip,
  ChoiceRow,
  Eyebrow,
  Spinner,
  formatClock,
  humanize,
} from '../components/ui.jsx'
import { useQuestionTimer } from '../hooks/useQuestionTimer.js'

const EMPTY_FILTERS = {
  section: '',
  domain: '',
  skill: '',
  difficulty: '',
  question_type: '',
}

/**
 * A rail filter. The ring goes accent once a value is set, so which filters
 * are narrowing the pool is legible without reading each one.
 */
function Select({ id, label, value, onChange, options, disabled }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-ink-soft">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-md bg-surface px-2.5 py-2 text-sm ring-1 ring-inset
          disabled:bg-sunken disabled:text-ink-faint
          ${value ? 'text-ink ring-accent' : 'text-ink-faint ring-line-strong'}`}
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/**
 * One question with its answer controls.
 *
 * The correct answer is not in the payload the bank returns - it is only
 * revealed by POST /api/questions/<id>/check, which grades server-side. That
 * endpoint refuses questions that are live in the student's test attempt, so
 * practice mode cannot be used to read the key mid-test.
 */
function PracticeQuestion({ question }) {
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)

  // The stopwatch starts on the first interaction with this card, not on
  // mount: a page shows five questions at once, and five clocks running while
  // the student reads the first one would report four fictional minutes.
  const { seconds, takeDelta } = useQuestionTimer(question.id, {
    running: started && !result,
  })

  useEffect(() => {
    setAnswer('')
    setResult(null)
    setError(null)
    setStarted(false)
  }, [question.id])

  async function check() {
    setBusy(true)
    setError(null)
    // Read the clock before awaiting, so network time is not charged to the
    // student's thinking time.
    const seconds_spent = takeDelta()
    try {
      setResult(await questionsApi.check(question.id, answer, { seconds_spent }))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const isGridIn = question.question_type === 'grid_in'

  function toneFor(choiceId) {
    if (!result) return answer === choiceId ? 'picked' : 'idle'
    if (result.correct_answer === choiceId) return 'good'
    if (answer === choiceId) return 'bad'
    return 'idle'
  }

  return (
    <Card
      className="mb-4"
      onFocusCapture={() => setStarted(true)}
      onMouseDownCapture={() => setStarted(true)}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Eyebrow className="!tracking-[0.07em]">
          {humanize(question.section)} · {humanize(question.domain)}
        </Eyebrow>
        <span aria-hidden="true" className="h-[3px] w-[3px] rounded-full bg-line-strong" />
        <span className="text-[11px] text-ink-faint">{question.skill}</span>
        <span className="ml-auto rounded bg-sunken px-2 py-0.5 text-[11px] font-semibold text-ink-soft">
          {humanize(question.difficulty)}
        </span>
        <span
          className={`font-mono text-[11px] tabular-nums ${
            started ? 'text-ink-soft' : 'text-ink-faint'
          }`}
          aria-label={
            result
              ? `Answered in ${formatClock(seconds)}`
              : `Time on this question: ${formatClock(seconds)}`
          }
        >
          {formatClock(seconds)}
        </span>
      </div>

      {question.stimulus && (
        <MathText className="mb-4 border-l-2 border-line pl-4 font-serif text-[15px] leading-relaxed text-ink-soft">
          {question.stimulus}
        </MathText>
      )}
      <MathText className="mb-5 font-serif text-[17px] leading-relaxed">
        {question.stem}
      </MathText>

      {question.figure_url && (
        <img
          src={question.figure_url}
          alt="Figure accompanying the question"
          className="mb-4 max-w-full rounded ring-1 ring-line"
        />
      )}

      {error && <Alert>{error}</Alert>}

      {isGridIn ? (
        <label className="mb-4 block text-sm">
          <span className="mb-1.5 block text-xs font-semibold text-ink-soft">
            Your answer
          </span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={Boolean(result)}
            className="w-44 rounded-md bg-surface px-3 py-2 text-sm ring-1 ring-inset ring-line-strong"
          />
        </label>
      ) : (
        <fieldset className="mb-4" disabled={Boolean(result)}>
          <legend className="sr-only">Answer choices</legend>
          <div className="flex flex-col gap-2.5">
            {(question.choices ?? []).map((choice) => {
              const tone = toneFor(choice.id)
              return (
                <ChoiceRow
                  key={choice.id}
                  as="label"
                  tone={tone}
                  className={result ? '' : 'cursor-pointer'}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={choice.id}
                    checked={answer === choice.id}
                    onChange={() => setAnswer(choice.id)}
                    className="sr-only"
                  />
                  <ChoicePip letter={choice.id} tone={tone} />
                  <MathText className="flex-grow">{choice.text}</MathText>
                  {result && tone === 'good' && (
                    <span className="whitespace-nowrap text-xs font-semibold text-good">
                      Correct answer
                    </span>
                  )}
                  {result && tone === 'bad' && (
                    <span className="whitespace-nowrap text-xs font-semibold text-bad">
                      Your answer
                    </span>
                  )}
                </ChoiceRow>
              )
            })}
          </div>
        </fieldset>
      )}

      {!result ? (
        <Button onClick={check} disabled={!answer || busy}>
          {busy ? 'Checking…' : 'Check answer'}
        </Button>
      ) : (
        // The verdict and the reasoning are one block: a student who got it
        // wrong should not be able to read the mark without the explanation
        // sitting directly under it. role=status announces the grade, which is
        // the only thing on this screen that changes without a navigation.
        <div
          role="status"
          className={`border-l-2 pl-4 ${result.is_correct ? 'border-good' : 'border-bad'}`}
        >
          <p
            className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]
              ${result.is_correct ? 'text-good' : 'text-bad'}`}
          >
            {result.is_correct
              ? 'Correct'
              : `Not quite — the answer is ${result.correct_answer}`}
          </p>
          {result.rationale && (
            <MathText className="text-sm leading-relaxed text-ink-soft">
              {result.rationale}
            </MathText>
          )}
        </div>
      )}
    </Card>
  )
}

export default function PracticePage() {
  // The taxonomy is fixed by CLAUDE.md section 5 and never changes at runtime,
  // so refetching it on every visit to this page bought nothing but a wait.
  const { data: taxonomy } = useResource('taxonomy', () => taxonomyApi.get())
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    questionsApi
      .list({ ...filters, page, per_page: 5 })
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filters, page])

  const sections = taxonomy?.sections ?? []
  const activeSection = sections.find((s) => s.value === filters.section)
  const domains = activeSection?.domains ?? []
  const activeDomain = domains.find((d) => d.value === filters.domain)
  const anyFilter = Object.values(filters).some(Boolean)

  function update(name, value) {
    setPage(1)
    setFilters((current) => {
      const next = { ...current, [name]: value }
      // Changing a parent invalidates its children, and leaving a stale domain
      // selected silently returns nothing.
      if (name === 'section') {
        next.domain = ''
        next.skill = ''
      }
      if (name === 'domain') next.skill = ''
      return next
    })
  }

  return (
    // Filters sit in a rail rather than a bar across the top: they stay visible
    // while you work down the questions, and narrowing the pool is something
    // you do repeatedly rather than once.
    <div className="grid gap-8 md:grid-cols-[210px_minmax(0,1fr)]">
      <div className="md:border-r md:border-line md:pr-6">
        <div className="mb-5 flex items-baseline gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">
            Filters
          </h2>
          {anyFilter && (
            <button
              type="button"
              className="ml-auto text-xs text-accent"
              onClick={() => {
                setFilters(EMPTY_FILTERS)
                setPage(1)
              }}
            >
              Clear
            </button>
          )}
        </div>

        <Select
          id="filter-section"
          label="Section"
          value={filters.section}
          onChange={(v) => update('section', v)}
          options={sections}
        />
        <Select
          id="filter-domain"
          label="Domain"
          value={filters.domain}
          onChange={(v) => update('domain', v)}
          options={domains}
          disabled={!filters.section}
        />
        <Select
          id="filter-skill"
          label="Skill"
          value={filters.skill}
          onChange={(v) => update('skill', v)}
          options={(activeDomain?.skills ?? []).map((s) => ({ value: s, label: s }))}
          disabled={!filters.domain}
        />
        <Select
          id="filter-difficulty"
          label="Difficulty"
          value={filters.difficulty}
          onChange={(v) => update('difficulty', v)}
          options={taxonomy?.difficulties ?? []}
        />

        {data && (
          <div className="mt-6 border-t border-line pt-5" aria-live="polite">
            <p className="font-mono text-2xl tabular-nums">{data.total}</p>
            <p className="text-xs text-ink-faint">
              question{data.total === 1 ? '' : 's'} match
            </p>
          </div>
        )}
      </div>

      <div>
        <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">Practice</h1>
        <p className="mb-7 text-sm text-ink-faint">
          One question at a time, with a stopwatch. The explanation appears once
          you answer; the clock is a study statistic, never a limit.
        </p>

        {error && <Alert>{error}</Alert>}
        {loading && <Spinner label="Loading questions" />}

        {!loading && data && data.items.length === 0 && (
          <Alert tone="info">No questions match these filters.</Alert>
        )}

        {!loading && data && data.items.length > 0 && (
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
    </div>
  )
}
