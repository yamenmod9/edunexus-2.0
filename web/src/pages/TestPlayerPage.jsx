import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { attempts as attemptsApi } from '../api/client.js'
import MathText from '../components/MathText.jsx'
import { Alert, Button, Spinner, formatClock, humanize } from '../components/ui.jsx'

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

function seatLabel(response, i) {
  return `Question ${i + 1}${response.answered ? ', answered' : ', not answered'}${
    response.flagged ? ', flagged for review' : ''
  }`
}

function QuestionNav({ responses, index, onSelect }) {
  return (
    <nav aria-label="Questions in this module" className="flex flex-wrap gap-2">
      {responses.map((response, i) => {
        const state = response.flagged
          ? 'ring-flag bg-flag-soft'
          : response.answered
            ? 'ring-accent bg-accent-soft'
            : 'ring-line-strong bg-surface'
        return (
          <button
            key={response.question_id}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={i === index ? 'true' : undefined}
            aria-label={seatLabel(response, i)}
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

/**
 * The footer seat strip: the whole module at a glance without a grid of
 * buttons competing with the question. Still individually clickable, and
 * still carries the same labels as the full palette.
 */
function SeatStrip({ responses, index, onSelect }) {
  return (
    <nav aria-label="Questions in this module" className="flex flex-wrap gap-[3px]">
      {responses.map((response, i) => {
        const tone =
          i === index
            ? 'bg-accent'
            : response.flagged
              ? 'bg-flag'
              : response.answered
                ? 'bg-line-strong'
                : 'bg-line'
        return (
          <button
            key={response.question_id}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={i === index ? 'true' : undefined}
            aria-label={seatLabel(response, i)}
            className={`h-2 w-4 rounded-sm transition hover:opacity-70 ${tone}`}
          />
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

  const hasPassage = Boolean(question.stimulus)
  const isLastModule = module.order_index === attempt.modules_total

  return (
    // Full-bleed and no app nav: for the duration of a module nothing on
    // screen competes with the question. The route sits outside Layout.
    <div className="flex min-h-screen flex-col bg-page">
      <header className="flex items-center gap-4 border-b border-line px-6 py-4 sm:px-8">
        <span className="text-sm font-semibold">{humanize(module.section)}</span>
        <span className="text-sm text-ink-faint">
          Module {module.order_index} of {attempt.modules_total}
        </span>
        <div
          className={`ml-auto font-mono text-2xl font-medium tabular-nums tracking-tight
            ${lowTime ? 'text-bad' : 'text-ink'}`}
          role="timer"
          aria-live={lowTime ? 'polite' : 'off'}
          aria-label={`Time remaining: ${formatClock(seconds)}`}
        >
          {formatClock(seconds)}
        </div>
      </header>

      {/* Progress is a hairline, not a counter chip fighting for attention. */}
      <div className="h-0.5 bg-line" aria-hidden="true">
        <div
          className="h-0.5 bg-accent transition-all"
          style={{ width: `${((index + 1) / responses.length) * 100}%` }}
        />
      </div>

      {error && (
        <div className="px-6 pt-4 sm:px-8">
          <Alert>{error}</Alert>
        </div>
      )}

      {reviewing ? (
        <div className="mx-auto w-full max-w-3xl flex-grow px-6 py-10 sm:px-8">
          <h1 className="mb-2 font-serif text-2xl font-bold tracking-tight">
            Review this module
          </h1>
          <p className="mb-6 text-sm text-ink-soft">
            {answeredCount} of {responses.length} answered.{' '}
            {responses.filter((r) => r.flagged).length} flagged for review. You cannot
            return to this module once you move on.
          </p>
          <div className="mb-8">
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
                : isLastModule
                  ? 'Finish test'
                  : 'Submit module and continue'}
            </Button>
          </div>

          <details className="mt-12 text-sm text-ink-faint">
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
        </div>
      ) : (
        <div
          className={`flex-grow ${
            hasPassage ? 'grid grid-cols-1 md:grid-cols-2' : 'mx-auto w-full max-w-2xl'
          }`}
        >
          {/* Passage left, question right — the shape of the real digital SAT.
              Math questions carry no passage, so they get one centred column
              rather than an empty half. */}
          {hasPassage && (
            <div className="border-line px-6 py-8 md:border-r md:px-8 md:py-10">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Passage
              </p>
              <MathText className="font-serif text-[17px] leading-[1.75]">
                {question.stimulus}
              </MathText>
            </div>
          )}

          <div className="px-6 py-8 sm:px-8 md:py-10">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-6 min-w-6 items-center justify-center rounded px-1.5 text-xs font-semibold bg-accent text-accent-on">
                {index + 1}
              </span>
              <span className="text-sm text-ink-faint">of {responses.length}</span>
              <button
                type="button"
                aria-pressed={response.flagged}
                // The visible label shortens to "Flagged" once set; the
                // accessible name stays explicit about what was flagged.
                aria-label={response.flagged ? 'Flagged for review' : 'Flag for review'}
                onClick={() => saveResponse(question.id, { flagged: !response.flagged })}
                className={`ml-auto flex items-center gap-1.5 text-xs font-medium transition
                  ${response.flagged ? 'text-flag' : 'text-ink-faint hover:text-ink-soft'}`}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill={response.flagged ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" strokeLinecap="round" />
                </svg>
                {response.flagged ? 'Flagged' : 'Flag for review'}
              </button>
            </div>

            <MathText className="mb-6 text-base font-medium leading-relaxed">
              {question.stem}
            </MathText>

            {question.figure_url && (
              <img
                src={question.figure_url}
                alt="Figure accompanying the question"
                className="mb-6 max-w-full rounded border border-line"
              />
            )}

            {question.question_type === 'grid_in' ? (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink-soft">Your answer</span>
                <input
                  value={response.answer ?? ''}
                  onChange={(e) => saveResponse(question.id, { answer: e.target.value })}
                  className="w-44 rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm"
                />
              </label>
            ) : (
              <fieldset>
                <legend className="sr-only">Answer choices</legend>
                <div className="flex flex-col gap-2.5">
                  {(question.choices ?? []).map((choice) => {
                    const picked = response.answer === choice.id
                    return (
                      <label
                        key={choice.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-md p-3.5 text-sm ring-1 transition
                          ${
                            picked
                              ? 'bg-accent-soft ring-accent'
                              : 'bg-surface ring-line-strong hover:ring-ink-faint'
                          }`}
                      >
                        <input
                          type="radio"
                          name={`q-${question.id}`}
                          value={choice.id}
                          checked={picked}
                          onChange={() => saveResponse(question.id, { answer: choice.id })}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1
                            ${
                              picked
                                ? 'bg-accent text-accent-on ring-accent'
                                : 'text-ink-faint ring-line-strong'
                            }`}
                        >
                          {choice.id}
                        </span>
                        <MathText>{choice.text}</MathText>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            )}

            {response.answered && (
              <Button
                variant="ghost"
                className="mt-4 px-0"
                onClick={() => saveResponse(question.id, { answer: '' })}
              >
                Clear answer
              </Button>
            )}
          </div>
        </div>
      )}

      {!reviewing && (
        <footer className="flex flex-wrap items-center gap-4 border-t border-line bg-surface px-6 py-3.5 sm:px-8">
          <SeatStrip responses={responses} index={index} onSelect={setIndex} />
          <span className="whitespace-nowrap text-xs text-ink-faint">
            {answeredCount} answered
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              Back
            </Button>
            {index < responses.length - 1 && (
              <Button variant="secondary" onClick={() => setIndex((i) => i + 1)}>
                Next
              </Button>
            )}
            {/* Always reachable: a student must be able to review and move on
                without paging to the end of the module first. */}
            <Button onClick={() => setReviewing(true)}>Review and continue</Button>
          </div>
        </footer>
      )}
    </div>
  )
}
