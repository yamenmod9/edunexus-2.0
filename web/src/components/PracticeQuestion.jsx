import { useEffect, useState } from 'react'

import { questions as questionsApi } from '../api/client.js'
import { useQuestionTimer } from '../hooks/useQuestionTimer.js'
import MathText from './MathText.jsx'
import {
  Alert,
  Button,
  Card,
  ChoicePip,
  ChoiceRow,
  Eyebrow,
  formatClock,
  humanize,
} from './ui.jsx'

/**
 * One question with its answer controls.
 *
 * The correct answer is not in the payload the bank returns - it is only
 * revealed by POST /api/questions/<id>/check, which grades server-side. That
 * endpoint refuses questions that are live in the student's test attempt, so
 * practice mode cannot be used to read the key mid-test.
 */
export default function PracticeQuestion({ question }) {
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
