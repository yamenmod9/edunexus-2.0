import { useEffect, useState } from 'react'

import { questions as questionsApi, taxonomy as taxonomyApi } from '../api/client.js'
import MathText from '../components/MathText.jsx'
import { Alert, Badge, Button, Card, Spinner, humanize } from '../components/ui.jsx'

const EMPTY_FILTERS = {
  section: '',
  domain: '',
  skill: '',
  difficulty: '',
  question_type: '',
}

function Select({ id, label, value, onChange, options, disabled }) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm
          disabled:bg-slate-100 disabled:text-slate-400"
      >
        <option value="">Any</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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

  useEffect(() => {
    setAnswer('')
    setResult(null)
    setError(null)
  }, [question.id])

  async function check() {
    setBusy(true)
    setError(null)
    try {
      setResult(await questionsApi.check(question.id, answer))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const isGridIn = question.question_type === 'grid_in'

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="info">{humanize(question.section)}</Badge>
        <Badge>{humanize(question.domain)}</Badge>
        <Badge>{humanize(question.difficulty)}</Badge>
        <span className="text-xs text-ink-faint">{question.skill}</span>
      </div>

      {question.stimulus && (
        <MathText className="mb-3 border-l-2 border-slate-200 pl-3 text-sm text-ink-soft">
          {question.stimulus}
        </MathText>
      )}
      <MathText className="mb-4 font-medium">{question.stem}</MathText>

      {question.figure_url && (
        <img
          src={question.figure_url}
          alt="Figure accompanying the question"
          className="mb-4 max-w-full rounded border border-slate-200"
        />
      )}

      {error && <Alert>{error}</Alert>}

      {isGridIn ? (
        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium">Your answer</span>
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={Boolean(result)}
            className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      ) : (
        <fieldset className="mb-3" disabled={Boolean(result)}>
          <legend className="sr-only">Answer choices</legend>
          <div className="space-y-2">
            {(question.choices ?? []).map((choice) => {
              const selected = answer === choice.id
              const isKey = result && result.correct_answer === choice.id
              const isWrongPick = result && selected && !result.is_correct
              return (
                <label
                  key={choice.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm
                    ${isKey ? 'border-emerald-400 bg-emerald-50' : ''}
                    ${isWrongPick ? 'border-red-400 bg-red-50' : ''}
                    ${!result && selected ? 'border-accent bg-accent-soft' : ''}
                    ${!result && !selected ? 'border-slate-200 hover:bg-slate-50' : ''}`}
                >
                  <input
                    type="radio"
                    name={`q-${question.id}`}
                    value={choice.id}
                    checked={selected}
                    onChange={() => setAnswer(choice.id)}
                    className="mt-0.5"
                  />
                  <span className="font-semibold">{choice.id}.</span>
                  <MathText>{choice.text}</MathText>
                </label>
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
        <div>
          <Alert tone={result.is_correct ? 'success' : 'error'}>
            {result.is_correct
              ? 'Correct.'
              : `Not quite — the answer is ${result.correct_answer}.`}
          </Alert>
          {result.rationale && (
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <p className="mb-1 font-semibold">Explanation</p>
              <MathText>{result.rationale}</MathText>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

export default function PracticePage() {
  const [taxonomy, setTaxonomy] = useState(null)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    taxonomyApi.get().then(setTaxonomy).catch(() => setTaxonomy(null))
  }, [])

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
    <div>
      <h1 className="mb-1 text-2xl font-bold">Practice</h1>
      <p className="mb-5 text-sm text-ink-faint">
        Single questions from the bank, with the explanation after you answer.
      </p>

      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        </div>
        <div className="mt-3">
          <Button variant="ghost" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1) }}>
            Clear filters
          </Button>
        </div>
      </Card>

      {error && <Alert>{error}</Alert>}
      {loading && <Spinner label="Loading questions" />}

      {!loading && data && data.items.length === 0 && (
        <Alert tone="info">No questions match these filters.</Alert>
      )}

      {!loading && data && (
        <>
          <p className="mb-3 text-sm text-ink-faint" aria-live="polite">
            {data.total} question{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
            {Math.max(1, data.pages)}
          </p>
          <div className="space-y-4">
            {data.items.map((question) => (
              <PracticeQuestion key={question.id} question={question} />
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2">
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
          </div>
        </>
      )}
    </div>
  )
}
