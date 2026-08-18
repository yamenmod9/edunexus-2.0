import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { attempts as attemptsApi, forms as formsApi } from '../api/client.js'
import { Alert, Badge, Button, Card, Spinner, humanize } from '../components/ui.jsx'

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
      <p className="mb-5 text-sm text-ink-faint">
        Full adaptive tests. Your performance on module 1 of each section decides
        which module 2 you get.
      </p>

      {error && <Alert>{error}</Alert>}

      {openAttempt && (
        <Card className="mb-6 ring-2 ring-accent">
          <h2 className="mb-1 text-lg font-semibold">You have a test in progress</h2>
          <p className="mb-3 text-sm text-ink-soft">
            {openAttempt.form_name} — module {openAttempt.current_module?.order_index} of{' '}
            {openAttempt.modules_total}. The clock has been running since you started.
          </p>
          <Button onClick={() => navigate(`/tests/${openAttempt.id}`)}>Resume test</Button>
        </Card>
      )}

      <div className="mb-8 space-y-4">
        {forms?.length === 0 && (
          <Alert tone="info">
            No tests are available yet. An administrator needs to assemble one from the
            question bank.
          </Alert>
        )}
        {forms?.map((form) => (
          <Card key={form.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{form.name}</h2>
                {form.description && (
                  <p className="mt-1 text-sm text-ink-soft">{form.description}</p>
                )}
                <p className="mt-2 text-sm text-ink-faint">
                  {totalQuestions(form)} questions · about {totalMinutes(form)} minutes
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(form.sections ?? []).map((section) => (
                    <Badge key={section.value ?? section.section}>
                      {humanize(section.section)}:{' '}
                      {section.modules.map((m) => m.question_count).join(' + ')}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                onClick={() => start(form.id)}
                disabled={Boolean(openAttempt) || starting === form.id}
              >
                {starting === form.id ? 'Starting…' : 'Start test'}
              </Button>
            </div>
            {openAttempt && (
              <p className="mt-3 text-xs text-ink-faint">
                Finish or abandon your test in progress before starting another.
              </p>
            )}
          </Card>
        ))}
      </div>

      {history.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Past attempts</h2>
          <div className="space-y-2">
            {history.map((attempt) => (
              <Card key={attempt.id} className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="font-medium">{attempt.form_name}</p>
                  <p className="text-xs text-ink-faint">
                    {new Date(attempt.started_at + 'Z').toLocaleString()} ·{' '}
                    {attempt.status}
                  </p>
                </div>
                <Link
                  to={`/tests/${attempt.id}/result`}
                  className="ml-auto text-sm text-accent underline"
                >
                  View results
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
