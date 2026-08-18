import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { attempts as attemptsApi } from '../api/client.js'
import MathText from '../components/MathText.jsx'
import {
  AccuracyRow,
  Alert,
  Badge,
  Button,
  buttonClass,
  Card,
  ChoicePip,
  ChoiceRow,
  Eyebrow,
  Meter,
  SectionLabel,
  Spinner,
  humanize,
} from '../components/ui.jsx'

/**
 * A section score. The total gets its own, larger treatment in the hero, so
 * this is only ever the 200-800 pair.
 */
function SectionScore({ section }) {
  const pct = section.scaled_score == null ? 0 : (section.scaled_score - 200) / 600
  return (
    <div>
      <Eyebrow className="mb-1.5">{humanize(section.section)}</Eyebrow>
      <p className="mb-2 font-serif text-4xl font-bold leading-none tracking-tight tabular-nums">
        {section.scaled_score ?? '—'}
      </p>
      <Meter value={pct} className="mb-2 w-32" />
      <p className="text-xs text-ink-soft">
        {section.complete
          ? `${section.raw_correct} of ${section.raw_possible} correct`
          : section.incomplete_reason}
      </p>
    </div>
  )
}

function ReviewQuestion({ entry, position }) {
  const { question } = entry

  function toneFor(choiceId) {
    if (choiceId === question.correct_answer) return 'good'
    if (choiceId === entry.answer) return 'bad'
    return 'idle'
  }

  return (
    <Card className="mb-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Question {position}</span>
        <Badge tone={entry.is_correct ? 'good' : 'bad'}>
          {entry.is_correct ? 'Correct' : entry.answer ? 'Incorrect' : 'Skipped'}
        </Badge>
        <Badge>{humanize(question.domain)}</Badge>
        <Badge>{humanize(question.difficulty)}</Badge>
        {entry.flagged && <Badge tone="info">Flagged</Badge>}
      </div>

      {question.stimulus && (
        <MathText className="mb-4 border-l-2 border-line pl-4 font-serif text-[15px] leading-relaxed text-ink-soft">
          {question.stimulus}
        </MathText>
      )}
      <MathText className="mb-4 font-serif text-[17px] leading-relaxed">
        {question.stem}
      </MathText>

      <div className="mb-4 flex flex-col gap-2">
        {(question.choices ?? []).map((choice) => {
          const tone = toneFor(choice.id)
          return (
            <ChoiceRow key={choice.id} tone={tone}>
              <ChoicePip letter={choice.id} tone={tone} />
              <MathText className="flex-grow">{choice.text}</MathText>
              {tone === 'good' && (
                <span className="whitespace-nowrap text-xs font-semibold text-good">Correct</span>
              )}
              {tone === 'bad' && (
                <span className="whitespace-nowrap text-xs font-semibold text-bad">
                  Your answer
                </span>
              )}
            </ChoiceRow>
          )
        })}
        {!question.choices && (
          <p className="text-sm">
            Your answer: <strong>{entry.answer || '—'}</strong> · Correct:{' '}
            <strong>{question.correct_answer}</strong>
          </p>
        )}
      </div>

      {question.rationale && (
        <div className="border-l-2 border-good pl-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-good">
            Why
          </p>
          <MathText className="text-sm leading-relaxed text-ink-soft">
            {question.rationale}
          </MathText>
        </div>
      )}
    </Card>
  )
}

export default function ResultPage() {
  const { attemptId } = useParams()
  const [review, setReview] = useState(null)
  const [error, setError] = useState(null)
  const [openModule, setOpenModule] = useState(null)

  useEffect(() => {
    attemptsApi
      .review(attemptId)
      .then(setReview)
      .catch((err) => setError(err.message))
  }, [attemptId])

  if (error) {
    return (
      <div>
        <Alert>{error}</Alert>
        <Link className="text-sm text-accent underline" to="/tests">
          Back to tests
        </Link>
      </div>
    )
  }
  if (!review) return <Spinner label="Loading your results" />

  const score = review.score
  const total = score.total
  const openedModule = review.modules.find((m) => m.order_index === openModule)
  const submitted = review.submitted_at
    ? new Date(review.submitted_at + 'Z').toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
      })
    : null

  return (
    <div>
      <Eyebrow className="mb-1.5">Score report · {review.form_name}</Eyebrow>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-bold tracking-tight">
          {submitted ? `Submitted ${submitted}` : 'Not submitted'}
        </h1>
        {review.status !== 'submitted' && <Badge>{review.status}</Badge>}
      </div>

      {/* The number, then immediately the caveat — never one without the
          other. CLAUDE.md section 7 forbids presenting these as exact. */}
      <Card className="mb-3">
        <div className="flex flex-wrap items-end gap-x-12 gap-y-8">
          <div>
            <Eyebrow className="mb-1.5 !tracking-[0.12em]">Total</Eyebrow>
            <p className="font-serif text-7xl font-bold leading-none tracking-tighter tabular-nums">
              {total.scaled_score ?? '—'}
            </p>
            <p className="mt-2.5 text-xs text-ink-faint">
              {total.complete ? `out of ${total.max}` : 'Incomplete — no total score'}
            </p>
          </div>

          <div className="flex flex-wrap gap-x-10 gap-y-6 pb-1.5">
            {score.sections.map((section) => (
              <SectionScore key={section.section} section={section} />
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-9 flex items-start gap-2.5 rounded-md bg-flag-soft p-4">
        <svg
          aria-hidden="true"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          className="mt-0.5 flex-shrink-0 text-flag"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16.5v.5" />
        </svg>
        <p className="text-xs leading-relaxed text-ink-soft">
          <strong className="font-semibold text-ink">
            These scores are an approximation.
          </strong>{' '}
          {score.approximation_note}
        </p>
      </div>

      <div className="grid gap-x-10 gap-y-9 md:grid-cols-2">
        <div>
          <SectionLabel>By domain</SectionLabel>
          {score.domains.map((row) => (
            <AccuracyRow
              key={`${row.section}-${row.domain}`}
              label={humanize(row.domain)}
              row={row}
            />
          ))}

          <SectionLabel className="mt-9">By difficulty</SectionLabel>
          {score.difficulty.map((row) => (
            <AccuracyRow key={row.difficulty} label={humanize(row.difficulty)} row={row} />
          ))}
        </div>

        <div>
          <SectionLabel>Modules</SectionLabel>
          {review.modules.map((module) => (
            <div key={module.order_index} className="border-b border-line py-3">
              <div className="mb-1 flex items-center gap-3">
                <span className="text-sm font-medium">
                  {humanize(module.section)} · Module {module.sequence}
                </span>
                <span className="ml-auto font-mono text-xs tabular-nums text-ink-soft">
                  {module.raw_correct}/{module.question_count}
                </span>
              </div>
              <p className="text-xs text-ink-faint">
                {module.routing
                  ? `Routed to the ${module.variant} module (${module.routing.raw_correct}/${module.routing.total} on module 1)`
                  : 'Standard module, taken by everyone'}
              </p>
              <Button
                variant="ghost"
                className="-ml-4 mt-1.5 px-4 py-1 text-xs"
                aria-expanded={openModule === module.order_index}
                onClick={() =>
                  setOpenModule(openModule === module.order_index ? null : module.order_index)
                }
              >
                {openModule === module.order_index ? 'Hide questions' : 'Review questions'}
              </Button>
            </div>
          ))}

          {/* Navigation, so these are links wearing the button styling rather
              than buttons — a <button> inside an <a> is invalid and axe
              rightly objects to nested interactive controls. */}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/tests" className={buttonClass()}>
              Take another test
            </Link>
            <Link to="/progress" className={buttonClass('secondary')}>
              See your progress
            </Link>
          </div>
        </div>
      </div>

      {/* Full width: a question with its passage does not fit a half column. */}
      {openedModule && (
        <div className="mt-9">
          <SectionLabel>
            {humanize(openedModule.section)} · Module {openedModule.sequence} questions
          </SectionLabel>
          {openedModule.questions.map((entry) => (
            <ReviewQuestion key={entry.question.id} entry={entry} position={entry.position} />
          ))}
        </div>
      )}
    </div>
  )
}
