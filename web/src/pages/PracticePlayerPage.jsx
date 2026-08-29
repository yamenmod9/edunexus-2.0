import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useResource } from '../api/cache.js'
import { questions as questionsApi, taxonomy as taxonomyApi } from '../api/client.js'
import Annotatable from '../components/Annotatable.jsx'
import DesmosCalculator from '../components/DesmosCalculator.jsx'
import FloatingPanel from '../components/FloatingPanel.jsx'
import GridInDirections from '../components/GridInDirections.jsx'
import MathText from '../components/MathText.jsx'
import ReferenceSheet from '../components/ReferenceSheet.jsx'
import SplitPane from '../components/SplitPane.jsx'
import { QuestionNav, Tool } from '../components/playerChrome.jsx'
import { DIRECTIONS } from '../components/playerRules.js'
import { Alert, Button, Modal, Spinner, formatClock, humanize } from '../components/ui.jsx'
import { useQuestionTimer } from '../hooks/useQuestionTimer.js'
import { readLocal, writeLocal } from '../storage.js'
import { selectionTitle } from './practiceSelection.js'

/**
 * Practice, in the test player's clothes.
 *
 * Deliberately the same screen as a real module: the same split pane, the same
 * cross-out, highlighter, calculator, reference sheet and question navigator,
 * laid out identically. The point of practising is that nothing about the
 * screen is new on test day, and a practice mode that looks like a quiz app
 * trains the wrong thing.
 *
 * Three things differ, and each for a reason:
 *
 * 1. **A stopwatch, not a countdown.** Practice is untimed - the clock counts
 *    up so a student can see a question getting faster, and running long costs
 *    them nothing.
 * 2. **It grades.** The bank never ships `correct_answer` to a student, so
 *    checking is a server round trip, and the rationale arrives with the
 *    verdict rather than being sat on.
 * 3. **Marks are not saved.** Highlights and cross-outs live in this
 *    component. In a test they belong to the attempt; here there is no attempt
 *    to hang them on, and inventing per-user scratch storage for a study
 *    session is a bigger thing than it looks.
 *
 * Full-bleed and outside the app shell, exactly like the test player, which is
 * also what makes the filter sidebar disappear the moment practice starts.
 */

const CALC_KEY = 'edunexus.calculator'
// One request, then everything is local. The API caps a page at 200.
const MAX_QUESTIONS = 100

export default function PracticePlayerPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const query = useMemo(() => {
    const built = { per_page: MAX_QUESTIONS }
    for (const field of ['section', 'domain', 'skill', 'difficulty', 'question_type']) {
      const values = params.getAll(field).filter(Boolean)
      if (values.length) built[field] = values
    }
    return built
  }, [params])

  const { data: taxonomy } = useResource('taxonomy', () => taxonomyApi.get())
  const sessionTitle = selectionTitle(
    params.getAll('domain').filter(Boolean),
    params.getAll('skill').filter(Boolean),
    taxonomy,
  )

  const [questions, setQuestions] = useState(null)
  const [error, setError] = useState(null)
  const [index, setIndex] = useState(0)

  // Per question, keyed by id: what was chosen, and what the server said.
  const [answers, setAnswers] = useState({})
  const [results, setResults] = useState({})
  const [marks, setMarks] = useState({})
  const [checking, setChecking] = useState(false)

  const [directionsOpen, setDirectionsOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [calculatorKind, setCalculatorKind] = useState(
    () => readLocal(CALC_KEY) || 'graphing',
  )
  const [crossOut, setCrossOut] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    questionsApi
      .list(query)
      .then((data) => {
        if (cancelled) return
        setQuestions(data.items)
        setIndex(0)

        // Restore whatever this student already answered. Without this,
        // leaving a session and coming back showed every question blank again
        // while the category list correctly said they were solved - the server
        // knew, and nothing asked it.
        const restoredAnswers = {}
        const restoredResults = {}
        for (const item of data.items) {
          if (!item.practice) continue
          restoredAnswers[item.id] = item.practice.answer ?? ''
          restoredResults[item.id] = {
            is_correct: item.practice.is_correct,
            correct_answer: item.practice.correct_answer,
            rationale: item.practice.rationale,
          }
        }
        setAnswers(restoredAnswers)
        setResults(restoredResults)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [query])

  const question = questions?.[index]
  const questionId = question?.id
  const result = questionId ? results[questionId] : null

  // Stopwatch per question. Stops once the answer is graded, so the number the
  // student sees is how long the question actually took.
  const { seconds, takeDelta } = useQuestionTimer(questionId, {
    running: Boolean(questionId) && !result,
  })

  const setMark = useCallback((id, patch) => {
    setMarks((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
  }, [])

  async function check() {
    if (!questionId || checking) return
    setChecking(true)
    // Read the clock before awaiting, so network time is not charged to the
    // student's thinking time.
    const secondsSpent = takeDelta()
    try {
      const graded = await questionsApi.check(questionId, answers[questionId] ?? '', {
        seconds_spent: secondsSpent,
      })
      setResults((current) => ({ ...current, [questionId]: graded }))
    } catch (err) {
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  function chooseCalculator(kind) {
    setCalculatorKind(kind)
    writeLocal(CALC_KEY, kind)
  }

  if (error && !questions) return <Alert>{error}</Alert>
  if (!questions) return <Spinner label="Loading questions" />

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <Alert tone="info">No questions match these filters.</Alert>
        <Button className="mt-4" onClick={() => navigate('/practice')}>
          Back to categories
        </Button>
      </div>
    )
  }

  const answer = answers[questionId] ?? ''
  const mark = marks[questionId] ?? {}
  const eliminated = mark.eliminated ?? []
  const highlights = mark.highlights ?? []
  const isMath = question.section === 'math'
  const isGridIn = question.question_type === 'grid_in'
  const hasPassage = Boolean(question.stimulus)
  const solved = Object.keys(results).length

  /**
   * Colour says what happened to the question; the ring says which one you are
   * on. Letting "current" win outright meant the question you had just graded
   * showed no verdict at all - the one you most want to see.
   */
  function toneFor(_, i) {
    const graded = results[questions[i].id]
    const fill = graded
      ? graded.is_correct
        ? 'bg-good text-page'
        : 'bg-bad text-page'
      : marks[questions[i].id]?.flagged
        ? 'bg-flag-soft text-flag'
        : 'bg-surface text-ink-soft'
    const ring = i === index ? 'ring-2 ring-ink' : 'ring-line-strong'
    return `${fill} ${ring}`
  }

  function toneForChoice(choiceId) {
    if (!result) return answer === choiceId ? 'picked' : 'idle'
    if (result.correct_answer === choiceId) return 'good'
    if (answer === choiceId) return 'bad'
    return 'idle'
  }

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="grid grid-cols-3 items-center gap-4 border-b border-line px-5 py-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/practice')}
            className="flex items-center gap-1 text-sm font-semibold hover:text-accent"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span className="max-w-[22ch] truncate">{sessionTitle || 'Practice'}</span>
          </button>
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
          {/* Counting up, not down. Practice is untimed, and a countdown here
              would invent a limit the student does not have. */}
          <div
            className="font-mono text-xl font-medium tabular-nums tracking-tight"
            role="timer"
            aria-label={`Time on this question: ${formatClock(seconds)}`}
          >
            {formatClock(seconds)}
          </div>
          <span className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">
            On this question
          </span>
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
                  <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
                  <circle cx="9" cy="17" r="1" fill="currentColor" stroke="none" />
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
          {!isGridIn && (
            <Tool label="Cross out" active={crossOut} onClick={() => setCrossOut((v) => !v)}>
              <span className="font-mono text-[13px] font-bold line-through">ABC</span>
            </Tool>
          )}
        </div>
      </header>

      <div className="h-0.5 bg-line" aria-hidden="true">
        <div
          className="h-0.5 bg-accent transition-all"
          style={{ width: `${(solved / questions.length) * 100}%` }}
        />
      </div>

      {error && (
        <div className="px-6 pt-4 sm:px-8">
          <Alert>{error}</Alert>
        </div>
      )}

      {directionsOpen && (
        <Modal
          title={`${humanize(question.section)} directions`}
          onClose={() => setDirectionsOpen(false)}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
            {DIRECTIONS[question.section] ?? ''}
          </div>
        </Modal>
      )}

      {referenceOpen && (
        <Modal title="Reference sheet" wide onClose={() => setReferenceOpen(false)}>
          <ReferenceSheet />
        </Modal>
      )}

      {calculatorOpen && isMath && (
        <FloatingPanel
          title="Calculator"
          storageKey="edunexus.calculator.position"
          width={660}
          height={480}
          initial={{ x: 24, y: 110 }}
          onClose={() => setCalculatorOpen(false)}
          toolbar={
            <div role="radiogroup" aria-label="Calculator type" className="flex gap-0.5 rounded bg-line p-0.5">
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
                    ${calculatorKind === kind ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`}
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

      <SplitPane
        storageKey="edunexus.split"
        leftLabel={hasPassage ? 'passage pane' : 'directions pane'}
        left={
          hasPassage || isGridIn ? (
            <div className="border-line px-6 py-8 md:border-r md:px-8 md:py-10">
              {hasPassage ? (
                <>
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                    Passage
                  </p>
                  <Annotatable
                    key={questionId}
                    text={question.stimulus}
                    annotations={highlights}
                    onChange={(next) => setMark(questionId, { highlights: next })}
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
              <span className="text-xs text-ink-faint">
                {humanize(question.domain)} · {question.skill} · {humanize(question.difficulty)}
              </span>
              <button
                type="button"
                aria-pressed={Boolean(mark.flagged)}
                aria-label={mark.flagged ? 'Marked for review' : 'Mark for Review'}
                onClick={() => setMark(questionId, { flagged: !mark.flagged })}
                className={`ml-auto flex items-center gap-1.5 text-xs font-medium transition
                  ${mark.flagged ? 'text-flag' : 'text-ink-faint hover:text-ink-soft'}`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill={mark.flagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 3h12v18l-6-5-6 5z" />
                </svg>
                {mark.flagged ? 'Marked for Review' : 'Mark for Review'}
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

            {isGridIn ? (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-ink-soft">Your answer</span>
                <input
                  value={answer}
                  disabled={Boolean(result)}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, [questionId]: event.target.value }))
                  }
                  className="w-44 rounded-md border border-line-strong bg-surface px-3 py-2.5 text-sm"
                />
              </label>
            ) : (
              <fieldset disabled={Boolean(result)}>
                <legend className="sr-only">Answer choices</legend>
                <div className="flex flex-col gap-2.5">
                  {(question.choices ?? []).map((choice) => {
                    const tone = toneForChoice(choice.id)
                    const struck = !result && eliminated.includes(choice.id)
                    return (
                      <div key={choice.id} className="flex items-center gap-2">
                        <label
                          className={`flex flex-grow items-start gap-3 rounded-md p-3.5 text-sm ring-1 transition
                            ${
                              struck
                                ? 'cursor-default bg-surface text-ink-faint line-through opacity-60 ring-line'
                                : tone === 'good'
                                  ? 'bg-good-soft ring-good'
                                  : tone === 'bad'
                                    ? 'bg-bad-soft ring-bad'
                                    : tone === 'picked'
                                      ? 'cursor-pointer bg-accent-soft ring-accent'
                                      : 'cursor-pointer bg-surface ring-line-strong hover:ring-ink-faint'
                            }`}
                        >
                          <input
                            type="radio"
                            name={`q-${questionId}`}
                            value={choice.id}
                            checked={answer === choice.id}
                            disabled={struck}
                            onChange={() =>
                              setAnswers((current) => ({ ...current, [questionId]: choice.id }))
                            }
                            className="sr-only"
                          />
                          <span
                            aria-hidden="true"
                            className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1
                              ${
                                tone === 'good'
                                  ? 'bg-good text-page ring-good'
                                  : tone === 'bad'
                                    ? 'bg-bad text-page ring-bad'
                                    : tone === 'picked' && !struck
                                      ? 'bg-accent text-accent-on ring-accent'
                                      : 'text-ink-faint ring-line-strong'
                              }`}
                          >
                            {choice.id}
                          </span>
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
                        </label>
                        {crossOut && !result && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = struck
                                ? eliminated.filter((id) => id !== choice.id)
                                : [...eliminated, choice.id]
                              setMark(questionId, { eliminated: next })
                              // Crossing out what you had picked clears it, or
                              // you submit an answer you just ruled out.
                              if (!struck && answer === choice.id) {
                                setAnswers((current) => ({ ...current, [questionId]: '' }))
                              }
                            }}
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

            {!result ? (
              <Button className="mt-5" disabled={!answer || checking} onClick={check}>
                {checking ? 'Checking…' : 'Check answer'}
              </Button>
            ) : (
              // The verdict and the reasoning are one block: a student who got
              // it wrong should not be able to read the mark without the
              // explanation directly under it.
              <div
                role="status"
                className={`mt-6 border-l-2 pl-4 ${result.is_correct ? 'border-good' : 'border-bad'}`}
              >
                <p
                  className={`mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]
                    ${result.is_correct ? 'text-good' : 'text-bad'}`}
                >
                  {result.is_correct
                    ? `Correct · ${formatClock(seconds)}`
                    : `Not quite — the answer is ${result.correct_answer}`}
                </p>
                {result.rationale && (
                  <MathText className="text-sm leading-relaxed text-ink-soft">
                    {result.rationale}
                  </MathText>
                )}
              </div>
            )}
          </div>
        }
      />

      <footer className="relative flex items-center gap-4 border-t border-line bg-surface px-5 py-3">
        <span className="hidden whitespace-nowrap text-xs text-ink-faint sm:inline">
          {solved} of {questions.length} solved
        </span>

        {navOpen && (
          <QuestionNav
            responses={questions.map((q) => ({
              question_id: q.id,
              answered: Boolean(results[q.id]),
              flagged: Boolean(marks[q.id]?.flagged),
            }))}
            index={index}
            toneFor={toneFor}
            legend={[
              ['bg-good', 'Correct'],
              ['bg-bad', 'Incorrect'],
              ['bg-flag', 'Marked'],
            ]}
            onSelect={(i) => {
              setIndex(i)
              setNavOpen(false)
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
          Question {index + 1} of {questions.length}
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
          <Button
            disabled={index >= questions.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next
          </Button>
        </div>
      </footer>
    </div>
  )
}
