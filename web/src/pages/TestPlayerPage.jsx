import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { attempts as attemptsApi } from '../api/client.js'
import MathText from '../components/MathText.jsx'
import {
  Alert,
  Button,
  Card,
  Spinner,
  formatClock,
  humanize,
} from '../components/ui.jsx'

/**
 * The test player.
 *
 * Two rules this screen exists to respect:
 *
 * 1. The server owns the clock. The countdown here is a display convenience
 *    that re-syncs to `seconds_remaining` on every server response. When it
 *    reaches zero the client does not end the module - it asks the server,
 *    which decides. A client that expired its own module would let a user with
 *    devtools award themselves extra time.
 *
 * 2. The server owns routing. This screen never computes which module comes
 *    next; it renders whatever `current_module` the server returns and never
 *    learns which module 2 variant it was given.
 */

function useServerClock(secondsRemaining, onExpired) {
  const [seconds, setSeconds] = useState(secondsRemaining ?? 0)
  const expiredRef = useRef(false)

  // Re-sync whenever the server tells us the truth again.
  useEffect(() => {
    setSeconds(secondsRemaining ?? 0)
    expiredRef.current = false
  }, [secondsRemaining])

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((current) => {
        const next = current - 1
        if (next <= 0 && !expiredRef.current) {
          expiredRef.current = true
          onExpired()
        }
        return Math.max(0, next)
      })
    }, 1000)
    return () => clearInterval(id)
  }, [onExpired])

  return seconds
}

function QuestionNav({ responses, index, onSelect }) {
  return (
    <nav aria-label="Questions in this module" className="flex flex-wrap gap-2">
      {responses.map((response, i) => {
        const state = response.flagged
          ? 'ring-amber-400 bg-amber-50'
          : response.answered
            ? 'ring-accent bg-accent-soft'
            : 'ring-slate-300 bg-white'
        return (
          <button
            key={response.question_id}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={i === index ? 'true' : undefined}
            aria-label={`Question ${i + 1}${response.answered ? ', answered' : ', not answered'}${
              response.flagged ? ', flagged for review' : ''
            }`}
            className={`h-9 w-9 rounded-md text-sm font-medium ring-1 transition
              ${state} ${i === index ? 'ring-2 ring-offset-1 ring-ink' : ''}`}
          >
            {i + 1}
          </button>
        )
      })}
    </nav>
  )
}

export default function TestPlayerPage() {
  const { attemptId } = useParams()
  const navigate = useNavigate()

  const [attempt, setAttempt] = useState(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  const load = useCallback(async () => {
    try {
      const next = await attemptsApi.get(attemptId)
      setAttempt(next)
      setError(null)
      return next
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [attemptId])

  useEffect(() => {
    load()
  }, [load])

  // Reset position when the server moves us to a different module.
  const moduleKey = attempt?.current_module?.module_attempt_id
  useEffect(() => {
    setIndex(0)
    setReviewing(false)
  }, [moduleKey])

  const module = attempt?.current_module
  const finished = attempt && attempt.status !== 'in_progress'

  useEffect(() => {
    if (finished) navigate(`/tests/${attemptId}/result`, { replace: true })
  }, [finished, attemptId, navigate])

  // Ask the server what happens now; never decide locally.
  const handleExpiry = useCallback(() => {
    load()
  }, [load])

  const seconds = useServerClock(module?.seconds_remaining, handleExpiry)

  async function saveResponse(questionId, payload) {
    // Optimistic: the student should never wait on the network to see their
    // own selection. The server's copy is authoritative and every later load
    // overwrites this.
    setAttempt((current) => {
      if (!current?.current_module) return current
      return {
        ...current,
        current_module: {
          ...current.current_module,
          responses: current.current_module.responses.map((r) =>
            r.question_id === questionId
              ? {
                  ...r,
                  ...('answer' in payload
                    ? { answer: payload.answer, answered: Boolean(payload.answer) }
                    : {}),
                  ...('flagged' in payload ? { flagged: payload.flagged } : {}),
                }
              : r,
          ),
        },
      }
    })

    try {
      await attemptsApi.respond(attemptId, questionId, payload)
    } catch (err) {
      setError(err.message)
      load() // resync to whatever the server actually believes
    }
  }

  async function completeModule() {
    setBusy(true)
    setError(null)
    try {
      const next = await attemptsApi.completeModule(attemptId)
      setAttempt(next)
      if (next.status !== 'in_progress') navigate(`/tests/${attemptId}/result`)
    } catch (err) {
      setError(err.message)
      load()
    } finally {
      setBusy(false)
    }
  }

  async function submitAttempt() {
    setBusy(true)
    try {
      await attemptsApi.submit(attemptId)
      navigate(`/tests/${attemptId}/result`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!attempt && !error) return <Spinner label="Loading your test" />
  if (error && !attempt) return <Alert>{error}</Alert>
  if (!module) return <Spinner label="Moving to the next module" />

  const responses = module.responses
  const question = module.questions[index]
  const response = responses[index]
  const answeredCount = responses.filter((r) => r.answered).length
  const lowTime = seconds <= 60

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div>
          <p className="text-sm font-semibold">
            {humanize(module.section)} — Module {module.sequence}
          </p>
          <p className="text-xs text-ink-faint">
            Module {module.order_index} of {attempt.modules_total} · {answeredCount} of{' '}
            {responses.length} answered
          </p>
        </div>
        <div
          className={`ml-auto rounded-md px-3 py-1.5 font-mono text-lg font-semibold tabular-nums
            ${lowTime ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-ink'}`}
          role="timer"
          aria-live={lowTime ? 'polite' : 'off'}
          aria-label={`Time remaining: ${formatClock(seconds)}`}
        >
          {formatClock(seconds)}
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {reviewing ? (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Review this module</h2>
          <p className="mb-4 text-sm text-ink-soft">
            {answeredCount} of {responses.length} answered.{' '}
            {responses.filter((r) => r.flagged).length} flagged for review. You cannot
            return to this module once you move on.
          </p>
          <div className="mb-5">
            <QuestionNav
              responses={responses}
              index={-1}
              onSelect={(i) => {
                setIndex(i)
                setReviewing(false)
              }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setReviewing(false)}>
              Back to questions
            </Button>
            <Button onClick={completeModule} disabled={busy}>
              {busy
                ? 'Submitting…'
                : module.order_index === attempt.modules_total
                  ? 'Finish test'
                  : 'Submit module and continue'}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <Card className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Question {index + 1} of {responses.length}
            </p>

            {question.stimulus && (
              <MathText className="mb-4 border-l-2 border-slate-200 pl-3 text-sm text-ink-soft">
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

            {question.question_type === 'grid_in' ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Your answer</span>
                <input
                  value={response.answer ?? ''}
                  onChange={(e) => saveResponse(question.id, { answer: e.target.value })}
                  className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ) : (
              <fieldset>
                <legend className="sr-only">Answer choices</legend>
                <div className="space-y-2">
                  {(question.choices ?? []).map((choice) => (
                    <label
                      key={choice.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm
                        ${
                          response.answer === choice.id
                            ? 'border-accent bg-accent-soft'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        value={choice.id}
                        checked={response.answer === choice.id}
                        onChange={() => saveResponse(question.id, { answer: choice.id })}
                        className="mt-0.5"
                      />
                      <span className="font-semibold">{choice.id}.</span>
                      <MathText>{choice.text}</MathText>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                aria-pressed={response.flagged}
                onClick={() => saveResponse(question.id, { flagged: !response.flagged })}
              >
                {response.flagged ? '★ Flagged for review' : '☆ Flag for review'}
              </Button>
              {response.answered && (
                <Button
                  variant="ghost"
                  onClick={() => saveResponse(question.id, { answer: '' })}
                >
                  Clear answer
                </Button>
              )}
            </div>
          </Card>

          <Card className="mb-4">
            <QuestionNav responses={responses} index={index} onSelect={setIndex} />
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={index >= responses.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              Next
            </Button>
            <Button className="ml-auto" onClick={() => setReviewing(true)}>
              Review and continue
            </Button>
          </div>

          <details className="mt-8 text-sm text-ink-faint">
            <summary className="cursor-pointer">Abandon this test</summary>
            <p className="mt-2">
              Your answers so far are kept and scored, but you cannot return to it.
            </p>
            <Button
              variant="danger"
              className="mt-2"
              disabled={busy}
              onClick={submitAttempt}
            >
              End test now
            </Button>
          </details>
        </>
      )}
    </div>
  )
}
