import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { attempts as attemptsApi, forms as formsApi } from '../api/client.js'
import {
  Alert,
  Button,
  Card,
  Eyebrow,
  SectionLabel,
  Spinner,
  humanize,
} from '../components/ui.jsx'

function totalMinutes(form) {
  const perSection = (form.sections ?? []).map((section) =>
    (section.modules ?? []).reduce((sum, m) => sum + m.time_limit_seconds, 0),
  )
  return Math.round(perSection.reduce((a, b) => a + b, 0) / 60)
}

function totalQuestions(form) {
  return (form.sections ?? []).reduce(
    (sum, section) =>
      sum + (section.modules ?? []).reduce((s, m) => s + m.question_count, 0),
    0,
  )
}

export default function TestsPage() {
  const [forms, setForms] = useState(null)
  const [openAttempt, setOpenAttempt] = useState(null)
  const [history, setHistory] = useState([])
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    Promise.all([formsApi.list(), attemptsApi.current(), attemptsApi.list()])
      .then(([formList, current, attemptList]) => {
        if (cancelled) return
        setForms(formList.items)
        setOpenAttempt(current.attempt)
        setHistory(attemptList.items.filter((a) => a.status !== 'in_progress'))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function start(formId) {
    setStarting(formId)
    setError(null)
    try {
      const attempt = await attemptsApi.start(formId)
      navigate(`/tests/${attempt.id}`)
    } catch (err) {
      setError(err.message)
      setStarting(null)
    }
  }

  if (!forms && !error) return <Spinner label="Loading tests" />

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">Practice tests</h1>
      <p className="mb-7 text-sm text-ink-faint">
        Full adaptive tests. How you do on module 1 of each section decides which
        module 2 you get — decided server-side, exactly like the real thing.
      </p>

      {error && <Alert>{error}</Alert>}

      {/* A live attempt outranks everything else on this page: it is the only
          thing on a clock. */}
      {openAttempt && (
        <Card className="mb-8 ring-2 ring-accent">
          <Eyebrow className="mb-2 text-accent">Test in progress</Eyebrow>
          <p className="mb-1 font-serif text-xl font-bold tracking-tight">
            {openAttempt.form_name}
          </p>
          <p className="mb-4 text-sm text-ink-soft">
            Module {openAttempt.current_module?.order_index} of{' '}
            {openAttempt.modules_total}. The clock has been running since you started.
          </p>
          <Button onClick={() => navigate(`/tests/${openAttempt.id}`)}>Resume test</Button>
        </Card>
      )}

      <SectionLabel>Available tests</SectionLabel>

      {forms?.length === 0 && (
        <Alert tone="info">
          No tests are available yet. An administrator needs to assemble one from the
          question bank.
        </Alert>
      )}

      <div className="mb-9">
        {forms?.map((form) => (
          <div
            key={form.id}
            className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line py-5"
          >
            <div className="min-w-[16rem] flex-grow">
              <p className="font-serif text-lg font-bold tracking-tight">{form.name}</p>
              {form.description && (
                <p className="mt-0.5 text-sm text-ink-soft">{form.description}</p>
              )}
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
                <span className="font-mono tabular-nums">{totalQuestions(form)}</span>
                <span>questions</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{totalMinutes(form)}</span>
                <span>minutes</span>
                {(form.sections ?? []).map((section) => (
                  <span key={section.value ?? section.section}>
                    <span aria-hidden="true" className="mr-2">
                      ·
                    </span>
                    {humanize(section.section)}{' '}
                    <span className="font-mono tabular-nums">
                      {section.modules.map((m) => m.question_count).join('+')}
                    </span>
                  </span>
                ))}
              </p>
            </div>
            <Button
              onClick={() => start(form.id)}
              disabled={Boolean(openAttempt) || starting === form.id}
            >
              {starting === form.id ? 'Starting…' : 'Start test'}
            </Button>
          </div>
        ))}
      </div>

      {openAttempt && (
        <p className="-mt-6 mb-9 text-xs text-ink-faint">
          Finish or abandon your test in progress before starting another.
        </p>
      )}

      {history.length > 0 && (
        <section>
          <SectionLabel>Past attempts</SectionLabel>
          {history.map((attempt) => (
            <div
              key={attempt.id}
              className="flex items-center gap-4 border-b border-line py-3"
            >
              <span className="flex-grow text-sm">{attempt.form_name}</span>
              <span className="hidden text-xs text-ink-faint sm:inline">
                {new Date(attempt.started_at + 'Z').toLocaleDateString()}
              </span>
              <span className="w-20 flex-shrink-0 text-xs text-ink-soft">
                {attempt.status}
              </span>
              <Link
                to={`/tests/${attempt.id}/result`}
                className="flex-shrink-0 whitespace-nowrap text-sm text-accent"
              >
                View results
              </Link>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
