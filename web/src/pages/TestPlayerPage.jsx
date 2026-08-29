import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { attempts as attemptsApi } from '../api/client.js'
import Annotatable from '../components/Annotatable.jsx'
import DesmosCalculator from '../components/DesmosCalculator.jsx'
import FloatingPanel from '../components/FloatingPanel.jsx'
import GridInDirections from '../components/GridInDirections.jsx'
import MathText from '../components/MathText.jsx'
import ReferenceSheet from '../components/ReferenceSheet.jsx'
import SplitPane from '../components/SplitPane.jsx'
import { QuestionNav, Tool } from '../components/playerChrome.jsx'
import { DIRECTIONS, seatLabel, splitAnnotations } from '../components/playerRules.js'
import { Alert, Button, Modal, Spinner, formatClock, humanize } from '../components/ui.jsx'
import { useQuestionTimer } from '../hooks/useQuestionTimer.js'
import { readLocal, writeLocal } from '../storage.js'

/**
 * The test player, laid out as a Bluebook simulation.
 *
 * Three rules this screen exists to respect:
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
 *
 * 3. The tools are the real exam's tools, not the real exam's content. The
 *    chrome below - directions, the timer toggle, cross-out, the reference
 *    sheet, highlighting, the navigator popup - reproduces how Bluebook
 *    behaves so practice transfers. Nothing here is copied from College Board
 *    (see CLAUDE.md section 6).
 */

export default function TestPlayerPage() {
  const { attemptId } = useParams()
  const navigate = useNavigate()

  const [attempt, setAttempt] = useState(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  // Tool state. Deliberately client-only: which panels a student had open is
  // not part of their attempt.
  const [showTimer, setShowTimer] = useState(true)
  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [calculatorKind, setCalculatorKind] = useState(
    () => readLocal('edunexus.calculator') || 'graphing',
  )
  const [crossOut, setCrossOut] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

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
    setNavOpen(false)
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

  /**
   * Report time on a question as a delta the server accumulates.
   *
   * Failures are swallowed on purpose. A lost timing report is a lost study
   * statistic, not a lost answer, and surfacing it would put an error banner
   * over a question the student answered perfectly well.
   */
  const reportTiming = useCallback(
    (questionId, secondsSpent) => {
      if (!questionId || secondsSpent <= 0) return
      attemptsApi
        .respond(attemptId, questionId, { seconds_spent: secondsSpent })
        .catch(() => {})
    },
    [attemptId],
  )

  const currentQuestionId = module?.questions?.[index]?.id
  const { takeDelta } = useQuestionTimer(currentQuestionId, {
    running: Boolean(currentQuestionId) && !reviewing,
    onFlush: reportTiming,
  })

  const saveResponse = useCallback(
    async (questionId, payload) => {
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
                    ...('annotations' in payload
                      ? { annotations: payload.annotations }
                      : {}),
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
    },
    [attemptId, load],
  )

  async function completeModule() {
    setBusy(true)
    setError(null)
    // Bank the time on the last question before the module goes away.
    reportTiming(currentQuestionId, takeDelta())
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
    reportTiming(currentQuestionId, takeDelta())
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
  const markedCount = responses.filter((r) => r.flagged).length

  // The real exam reveals the timer at five minutes whether or not you hid it,
  // and this is the point at which knowing matters most.
  const warning = seconds <= 300
  const lowTime = seconds <= 60
  const timerVisible = showTimer || warning

  const isMath = module.section === 'math'
  const { highlights, eliminated } = splitAnnotations(response.annotations)
  const hasPassage = Boolean(question.stimulus)
  const isGridIn = question.question_type === 'grid_in'
  // The calculator floats over the page now, so it no longer decides the
  // layout. The left pane is for whatever the student has to read alongside
  // the question: the passage, or the answer-entry rules on a grid-in.
  const showLeftPane = hasPassage || isGridIn
  const isLastModule = module.order_index === attempt.modules_total

  function chooseCalculator(kind) {
    setCalculatorKind(kind)
    writeLocal('edunexus.calculator', kind)
  }

  function setAnnotations(next) {
    saveResponse(question.id, { annotations: next })
  }

  function toggleEliminated(choiceId) {
    const list = Array.isArray(response.annotations) ? response.annotations : []
    const already = eliminated.includes(choiceId)
    const next = already
      ? list.filter((a) => !(a.kind === 'eliminated' && a.choice === choiceId))
      : [...list, { kind: 'eliminated', choice: choiceId }]
    // Crossing out the choice you had selected clears the selection, or the
    // student ends up submitting an answer they just told us they'd ruled out.
    const clearing = !already && response.answer === choiceId
    saveResponse(question.id, {
      annotations: next,
      ...(clearing ? { answer: '' } : {}),
    })
  }

  return (
    // Full-bleed and no app nav: for the duration of a module nothing on
    // screen competes with the question. The route sits outside Layout.
    <div className="flex min-h-screen flex-col bg-page">
      <header className="grid grid-cols-3 items-center gap-4 border-b border-line px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{humanize(module.section)}</span>
          <span className="hidden text-xs text-ink-faint sm:inline">
            Module {module.order_index} of {attempt.modules_total}
          </span>
          <button
            type="button"
            onClick={() => setDirectionsOpen(true)}
            className="flex items-center gap-1 text-xs font-medium text-ink-soft
              underline decoration-dotted underline-offset-4 hover:text-ink"
          >
            Directions
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 9l7 7 7-7" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col items-center">
          <div
            className={`font-mono text-xl font-medium tabular-nums tracking-tight
              ${lowTime ? 'text-bad' : 'text-ink'} ${timerVisible ? '' : 'invisible'}`}
            role="timer"
            aria-live={lowTime ? 'polite' : 'off'}
            aria-label={`Time remaining: ${formatClock(seconds)}`}
          >
            {formatClock(seconds)}
          </div>
          <button
            type="button"
            onClick={() => setShowTimer((v) => !v)}
            disabled={warning}
            className="rounded px-2 py-0.5 text-[11px] font-medium text-ink-soft
              ring-1 ring-line-strong hover:bg-sunken disabled:opacity-40"
          >
            {timerVisible ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="flex items-center justify-end gap-1">
          {isMath && (
            <>
              <Tool
                label="Calculator"
                active={calculatorOpen}
                onClick={() => setCalculatorOpen((v) => !v)}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  <rect x="5" y="2.5" width="14" height="19" rx="2" />
                  <rect x="8" y="5.5" width="8" height="3.5" rx="0.5" />
                  <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
                  <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" />
                  <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
                  <circle cx="15" cy="17" r="1" fill="currentColor" stroke="none" />
                </svg>
              </Tool>
              <Tool label="Reference" onClick={() => setReferenceOpen(true)}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 4h6a3 3 0 013 3v13a2.5 2.5 0 00-2.5-2.5H4z" />
                  <path d="M20 4h-6a3 3 0 00-3 3v13a2.5 2.5 0 012.5-2.5H20z" />
                </svg>
              </Tool>
            </>
          )}
          {question.question_type !== 'grid_in' && (
            <Tool label="Cross out" active={crossOut} onClick={() => setCrossOut((v) => !v)}>
              <span className="font-mono text-[13px] font-bold line-through">ABC</span>
            </Tool>
          )}
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

      {directionsOpen && (
        <Modal title={`${humanize(module.section)} directions`} onClose={() => setDirectionsOpen(false)}>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
            {DIRECTIONS[module.section] ?? ''}
          </div>
        </Modal>
      )}

      {referenceOpen && (
        <Modal title="Reference sheet" wide onClose={() => setReferenceOpen(false)}>
          <ReferenceSheet />
        </Modal>
      )}

      {reviewing ? (
        <div className="mx-auto w-full max-w-3xl flex-grow px-6 py-10 sm:px-8">
          <h1 className="mb-2 text-center font-serif text-2xl font-bold tracking-tight">
            Check your work
          </h1>
          <p className="mb-8 text-center text-sm text-ink-soft">
            {answeredCount} of {responses.length} answered, {markedCount} marked for
            review. You cannot return to this module once you move on.
          </p>

          <div className="mb-8 rounded-lg bg-surface p-5 ring-1 ring-line">
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-line pb-3 text-[11px] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-accent" />
                Answered
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-flag" />
                Marked for review
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-3 w-3 rounded-sm ring-1 ring-line-strong" />
                Unanswered
              </span>
            </div>
            <nav aria-label="Questions in this module" className="flex flex-wrap gap-2">
              {responses.map((r, i) => {
                const tone = r.flagged
                  ? 'bg-flag-soft text-flag ring-flag'
                  : r.answered
                    ? 'bg-accent text-accent-on ring-accent'
                    : 'bg-surface text-ink-soft ring-line-strong'
                return (
                  <button
                    key={r.question_id}
                    type="button"
                    onClick={() => {
                      setIndex(i)
                      setReviewing(false)
                    }}
                    aria-label={seatLabel(r, i)}
                    className={`h-9 w-9 rounded-md text-sm font-medium ring-1 transition hover:opacity-80 ${tone}`}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
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
        <SplitPane
          storageKey="edunexus.split"
          leftLabel={hasPassage ? 'passage pane' : 'directions pane'}
          left={
            showLeftPane ? (
              <div className="border-line px-6 py-8 md:border-r md:px-8 md:py-10">
                {hasPassage ? (
                  <>
                    <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                      Passage
                    </p>
                    <Annotatable
                      text={question.stimulus}
                      annotations={highlights}
                      onChange={(next) =>
                        setAnnotations([
                          ...next,
                          ...eliminated.map((c) => ({ kind: 'eliminated', choice: c })),
                        ])
                      }
                      className="font-serif text-[17px] leading-[1.75]"
                    />
                  </>
                ) : (
                  <GridInDirections />
                )}
              </div>
            ) : null
          }
          right={
          <div className="px-6 py-8 sm:px-8 md:py-10">
            <div className="mb-5 flex items-center gap-3 border-b border-line pb-3">
              <span className="flex h-6 min-w-6 items-center justify-center rounded bg-ink px-1.5 text-xs font-semibold text-page">
                {index + 1}
              </span>
              <button
                type="button"
                aria-pressed={response.flagged}
                // The visible label shortens once set; the accessible name
                // stays explicit about what was marked.
                aria-label={response.flagged ? 'Marked for review' : 'Mark for Review'}
                onClick={() => saveResponse(question.id, { flagged: !response.flagged })}
                className={`flex items-center gap-1.5 text-xs font-medium transition
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
                  <path d="M6 3h12v18l-6-5-6 5z" />
                </svg>
                {response.flagged ? 'Marked for Review' : 'Mark for Review'}
              </button>
            </div>

            <MathText className="mb-6 text-base leading-relaxed">{question.stem}</MathText>

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
                    const struck = eliminated.includes(choice.id)
                    return (
                      <div key={choice.id} className="flex items-center gap-2">
                        <label
                          className={`flex flex-grow items-start gap-3 rounded-md p-3.5 text-sm ring-1 transition
                            ${
                              struck
                                ? 'cursor-default bg-surface text-ink-faint line-through opacity-60 ring-line'
                                : picked
                                  ? 'cursor-pointer bg-accent-soft ring-accent'
                                  : 'cursor-pointer bg-surface ring-line-strong hover:ring-ink-faint'
                            }`}
                        >
                          <input
                            type="radio"
                            name={`q-${question.id}`}
                            value={choice.id}
                            checked={picked}
                            disabled={struck}
                            onChange={() => saveResponse(question.id, { answer: choice.id })}
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1
                              ${
                                picked && !struck
                                  ? 'bg-accent text-accent-on ring-accent'
                                  : 'text-ink-faint ring-line-strong'
                              }`}
                          >
                            {choice.id}
                          </span>
                          <MathText>{choice.text}</MathText>
                        </label>
                        {crossOut && (
                          <button
                            type="button"
                            onClick={() => toggleEliminated(choice.id)}
                            aria-pressed={struck}
                            aria-label={
                              struck
                                ? `Undo cross out for choice ${choice.id}`
                                : `Cross out choice ${choice.id}`
                            }
                            className="w-14 flex-shrink-0 rounded-md py-1.5 text-[11px] font-medium
                              text-ink-soft ring-1 ring-line-strong hover:bg-sunken"
                          >
                            {struck ? 'Undo' : <span className="line-through">{choice.id}</span>}
                          </button>
                        )}
                      </div>
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
          }
        />
      )}

      {/* Non-modal on purpose: the point of the calculator is to use it while
          reading the question, so it floats over the page and gets dragged out
          of the way rather than covering it and trapping focus. */}
      {calculatorOpen && isMath && (
        <FloatingPanel
          title="Calculator"
          storageKey="edunexus.calculator.position"
          // Wide enough that Desmos lays the expression list beside the graph
          // instead of collapsing to its stacked narrow layout.
          width={660}
          height={480}
          initial={{ x: 24, y: 110 }}
          onClose={() => setCalculatorOpen(false)}
          toolbar={
            <div
              role="radiogroup"
              aria-label="Calculator type"
              className="flex gap-0.5 rounded bg-line p-0.5"
            >
              {[
                ['graphing', 'Graphing'],
                ['scientific', 'Scientific'],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={calculatorKind === kind}
                  onClick={() => chooseCalculator(kind)}
                  className={`rounded px-2.5 py-1 text-[11px] font-medium transition
                    ${
                      calculatorKind === kind
                        ? 'bg-surface text-ink shadow-sm'
                        : 'text-ink-soft hover:text-ink'
                    }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        >
          <DesmosCalculator variant={calculatorKind} className="h-full !rounded-none !ring-0" />
        </FloatingPanel>
      )}

      {!reviewing && (
        <footer className="relative flex items-center gap-4 border-t border-line bg-surface px-5 py-3">
          <span className="hidden whitespace-nowrap text-xs text-ink-faint sm:inline">
            {answeredCount} of {responses.length} answered
          </span>

          {navOpen && (
            <QuestionNav
              responses={responses}
              index={index}
              onSelect={(i) => {
                setIndex(i)
                setNavOpen(false)
              }}
              onReview={() => {
                setNavOpen(false)
                setReviewing(true)
              }}
              onClose={() => setNavOpen(false)}
            />
          )}

          <button
            type="button"
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            className="absolute left-1/2 -translate-x-1/2 rounded-md bg-ink px-4 py-1.5
              text-sm font-medium text-page transition hover:opacity-90"
          >
            Question {index + 1} of {responses.length}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ml-2 inline">
              <path d={navOpen ? 'M5 15l7-7 7 7' : 'M5 9l7 7 7-7'} />
            </svg>
          </button>

          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              Back
            </Button>
            {index < responses.length - 1 ? (
              <Button onClick={() => setIndex((i) => i + 1)}>Next</Button>
            ) : (
              <Button onClick={() => setReviewing(true)}>Review</Button>
            )}
          </div>
        </footer>
      )}
    </div>
  )
}

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
