import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { attempts as attemptsApi } from '../api/client.js'
import MathText from '../components/MathText.jsx'
import {
  Alert,
  Badge,
  Button,
  Card,
  Spinner,
  humanize,
} from '../components/ui.jsx'

/**
 * One breakdown row.
 *
 * Accuracy is correct/answered, not correct/delivered - the server excludes
 * skipped questions on purpose, so running out of time does not read as being
 * inaccurate on questions you never saw. That means the fraction shown next to
 * it has to use the same denominator, or the row looks self-contradictory
 * ("2/4" beside "100%"). Skips are reported separately instead.
 */
function BreakdownRow({ label, row }) {
  const skipped = row.delivered - row.answered
  return (
    <tr className="border-b border-line">
      <th scope="row" className="py-2 text-left font-normal">
        {label}
        {skipped > 0 && (
          <span className="ml-1 text-xs text-ink-faint">({skipped} skipped)</span>
        )}
      </th>
      <td className="py-2 text-right tabular-nums">
        {row.correct}/{row.answered}
      </td>
      <td className="py-2 text-right tabular-nums">
        {row.accuracy == null ? '—' : `${Math.round(row.accuracy * 100)}%`}
      </td>
    </tr>
  )
}

function ScoreDial({ label, value, min, max, note }) {
  const pct = value == null ? 0 : ((value - min) / (max - min)) * 100
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="text-3xl font-bold tabular-nums">
        {value ?? '—'}
        {value != null && (
          <span className="ml-1 text-sm font-normal text-ink-faint">/ {max}</span>
        )}
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {note && <p className="mt-1 text-xs text-ink-faint">{note}</p>}
    </div>
  )
}

function ReviewQuestion({ entry, position }) {
  const { question } = entry
  return (
    <Card className="mb-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Question {position}</span>
        <Badge tone={entry.is_correct ? 'good' : 'bad'}>
          {entry.is_correct ? 'Correct' : entry.answer ? 'Incorrect' : 'Skipped'}
        </Badge>
        <Badge>{humanize(question.domain)}</Badge>
        <Badge>{humanize(question.difficulty)}</Badge>
        {entry.flagged && <Badge tone="info">Flagged</Badge>}
      </div>

      {question.stimulus && (
        <MathText className="mb-3 border-l-2 border-line pl-3 text-sm text-ink-soft">
          {question.stimulus}
        </MathText>
      )}
      <MathText className="mb-3 font-medium">{question.stem}</MathText>

      <div className="mb-3 space-y-1.5">
        {(question.choices ?? []).map((choice) => {
          const isKey = choice.id === question.correct_answer
          const isPick = choice.id === entry.answer
          return (
            <div
              key={choice.id}
              className={`flex items-start gap-2 rounded-md border p-2 text-sm
                ${isKey ? 'border-good bg-good-soft' : ''}
                ${isPick && !isKey ? 'border-bad bg-bad-soft' : ''}
                ${!isKey && !isPick ? 'border-line' : ''}`}
            >
              <span className="font-semibold">{choice.id}.</span>
              <MathText>{choice.text}</MathText>
              {isKey && <span className="ml-auto text-xs text-good">Correct</span>}
              {isPick && !isKey && (
                <span className="ml-auto text-xs text-bad">Your answer</span>
              )}
            </div>
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
        <div className="rounded-md bg-sunken p-3 text-sm">
          <p className="mb-1 font-semibold">Explanation</p>
          <MathText>{question.rationale}</MathText>
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

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="font-serif text-3xl font-bold tracking-tight">{review.form_name}</h1>
        <Badge tone={review.status === 'submitted' ? 'good' : 'neutral'}>
          {review.status}
        </Badge>
      </div>
      <p className="mb-5 text-sm text-ink-faint">
        {review.submitted_at &&
          new Date(review.submitted_at + 'Z').toLocaleString()}
      </p>

      {/* The API flags every score payload as approximate; showing the number
          without that caveat is exactly what CLAUDE.md section 7 forbids. */}
      <Alert tone="warn" title="These scores are an approximation">
        {score.approximation_note}
      </Alert>

      <Card className="mb-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <ScoreDial
            label="Total"
            value={total.scaled_score}
            min={total.min}
            max={total.max}
            note={total.complete ? null : 'Incomplete — no total score'}
          />
          {score.sections.map((section) => (
            <ScoreDial
              key={section.section}
              label={humanize(section.section)}
              value={section.scaled_score}
              min={200}
              max={800}
              note={
                section.complete
                  ? `${section.raw_correct} of ${section.raw_possible} correct`
                  : section.incomplete_reason
              }
            />
          ))}
        </div>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">By domain</h2>
          <table className="w-full text-sm">
            <caption className="sr-only">Accuracy by question domain</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-ink-faint">
                <th scope="col" className="pb-2">Domain</th>
                <th scope="col" className="pb-2 text-right">Of answered</th>
                <th scope="col" className="pb-2 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {score.domains.map((row) => (
                <BreakdownRow
                  key={`${row.section}-${row.domain}`}
                  label={humanize(row.domain)}
                  row={row}
                />
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">By difficulty</h2>
          <table className="w-full text-sm">
            <caption className="sr-only">Accuracy by question difficulty</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-ink-faint">
                <th scope="col" className="pb-2">Difficulty</th>
                <th scope="col" className="pb-2 text-right">Of answered</th>
                <th scope="col" className="pb-2 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {score.difficulty.map((row) => (
                <BreakdownRow
                  key={row.difficulty}
                  label={humanize(row.difficulty)}
                  row={row}
                />
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold">Modules</h2>
      <div className="mb-6 space-y-2">
        {review.modules.map((module) => (
          <Card key={module.order_index}>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="font-medium">
                  {humanize(module.section)} — Module {module.sequence}
                </p>
                <p className="text-xs text-ink-faint">
                  {module.raw_correct} of {module.question_count} correct · {module.status}
                </p>
              </div>
              {module.routing && (
                <Badge tone="info">
                  Routed to the {module.variant} module (
                  {module.routing.raw_correct}/{module.routing.total} on module 1)
                </Badge>
              )}
              <Button
                variant="secondary"
                className="ml-auto"
                aria-expanded={openModule === module.order_index}
                onClick={() =>
                  setOpenModule(
                    openModule === module.order_index ? null : module.order_index,
                  )
                }
              >
                {openModule === module.order_index ? 'Hide questions' : 'Review questions'}
              </Button>
            </div>

            {openModule === module.order_index && (
              <div className="mt-4">
                {module.questions.map((entry) => (
                  <ReviewQuestion
                    key={entry.question.id}
                    entry={entry}
                    position={entry.position}
                  />
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Link className="text-sm text-accent underline" to="/tests">
        Back to tests
      </Link>
    </div>
  )
}
