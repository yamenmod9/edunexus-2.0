import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { analytics as analyticsApi } from '../api/client.js'
import {
  AccuracyRow,
  Alert,
  Card,
  Meter,
  SectionLabel,
  Spinner,
  buttonClass,
  humanize,
} from '../components/ui.jsx'

// The platform's scale is fixed by design (CLAUDE.md section 7: 200-800 per
// section), not by whichever conversion table happens to be active - so the
// chart's y-axis is a constant, the same bound ResultPage's total dial uses.
const TOTAL_MIN = 400
const TOTAL_MAX = 1600

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'Z').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatPercent(value) {
  return value == null ? '—' : `${Math.round(value * 100)}%`
}

/**
 * Score trend across finished attempts. A single point cannot be a line, so
 * it renders as a stat instead - a one-point "trend" is not a trend.
 */
function ScoreTrend({ history }) {
  const points = useMemo(
    () =>
      history
        .map((h, index) => ({ index, score: h.total_scaled_score, entry: h }))
        .filter((p) => p.score != null),
    [history],
  )

  const svgRef = useRef(null)
  const [hovered, setHovered] = useState(null)

  const width = 600
  const height = 220
  const padding = { top: 20, right: 24, bottom: 28, left: 44 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const xFor = (i) =>
    padding.left +
    (points.length <= 1 ? plotWidth / 2 : (i / (points.length - 1)) * plotWidth)
  const yFor = (score) =>
    padding.top +
    plotHeight -
    ((score - TOTAL_MIN) / (TOTAL_MAX - TOTAL_MIN)) * plotHeight

  function handleMove(event) {
    if (points.length < 2 || !svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const relX = ((event.clientX - rect.left) / rect.width) * width
    let nearest = 0
    let best = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(xFor(i) - relX)
      if (d < best) {
        best = d
        nearest = i
      }
    })
    setHovered(nearest)
  }

  if (points.length === 0) {
    return (
      <>
        <SectionLabel>Total score</SectionLabel>
        <p className="text-sm text-ink-faint">No completed attempts yet.</p>
      </>
    )
  }

  if (points.length === 1) {
    const only = points[0].entry
    return (
      <>
        <SectionLabel>Latest total score</SectionLabel>
        <p className="font-serif text-5xl font-bold leading-none tracking-tight tabular-nums">
          {only.total_scaled_score}
        </p>
        <p className="mt-3 text-sm text-ink-faint">
          {only.form_name} · {formatDate(only.submitted_at)} · one more finished test
          will start a trend line
        </p>
      </>
    )
  }

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.score)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const delta = last.score - first.score
  const active = hovered ?? points.length - 1
  const activePoint = points[active]

  return (
    <div>
      <div className="mb-5 flex items-baseline gap-4">
        <SectionLabel className="!mb-0 flex-grow">Total score</SectionLabel>
        {delta !== 0 && (
          <span
            className={`flex-shrink-0 text-xs font-medium ${delta > 0 ? 'text-good' : 'text-bad'}`}
          >
            {delta > 0 ? '+' : ''}
            {delta} since your first test
          </span>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Total score across ${points.length} finished attempts, most recent ${last.score}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Recessive gridlines at the scale quarter-marks. */}
        {[400, 700, 1000, 1300, 1600].map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="var(--c-line)"
              strokeWidth="1"
            />
            <text x={padding.left - 8} y={yFor(tick) + 4} textAnchor="end" fontSize="10" fill="var(--c-ink-faint)">
              {tick}
            </text>
          </g>
        ))}

        {/* Crosshair, snapped to the nearest point. */}
        {hovered != null && (
          <line
            x1={xFor(hovered)}
            x2={xFor(hovered)}
            y1={padding.top}
            y2={height - padding.bottom}
            stroke="var(--c-ink-faint)"
            strokeWidth="1"
          />
        )}

        <path d={path} fill="none" stroke="var(--c-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle
            key={p.entry.attempt_id}
            tabIndex={0}
            cx={xFor(i)}
            cy={yFor(p.score)}
            r={i === active ? 6 : 4}
            fill="var(--c-accent)"
            stroke="var(--c-surface)"
            strokeWidth="2"
            onFocus={() => setHovered(i)}
            onMouseEnter={() => setHovered(i)}
          >
            <title>
              {formatDate(p.entry.submitted_at)}: {p.score}
            </title>
          </circle>
        ))}

        {/* Direct label on the most recent point only. */}
        <text x={xFor(points.length - 1)} y={yFor(last.score) - 12} textAnchor="end" fontSize="14" fontWeight="600" fill="var(--c-ink)">
          {last.score}
        </text>
      </svg>

      <div className="mt-1.5 flex items-center justify-between text-xs text-ink-faint">
        <span>{formatDate(first.entry.submitted_at)}</span>
        <span>{formatDate(last.entry.submitted_at)}</span>
      </div>

      {/* Same detail as the tooltip, always visible - the table view. */}
      <p className="mt-4 text-sm" aria-live="polite">
        <strong className="tabular-nums">{activePoint.score}</strong>{' '}
        <span className="text-ink-faint">
          — {activePoint.entry.form_name} · {formatDate(activePoint.entry.submitted_at)}
        </span>
      </p>
    </div>
  )
}

/** Ranked, low-accuracy-first. One hue: this is magnitude, not identity. */
function WeakAreasBars({ items, labelFor, emptyNote, minSample }) {
  // The ranking note only makes sense above an actual ranking - printed over
  // the empty state it contradicts the sentence right under it.
  if (items.length === 0) {
    return <p className="text-sm text-ink-faint">{emptyNote}</p>
  }
  return (
    <>
      <p className="mb-5 text-xs text-ink-faint">
        Ranked by accuracy, minimum {minSample} answered.
      </p>
      <ul className="space-y-3.5">
      {items.map((item) => (
        <li key={labelFor(item)}>
          <div className="mb-1.5 flex items-baseline gap-2.5">
            <span className="flex-grow text-sm">{labelFor(item)}</span>
            <span className="font-mono text-xs tabular-nums text-ink-soft">
              {formatPercent(item.accuracy)}
            </span>
            <span className="w-9 text-right text-xs text-ink-faint">
              {item.correct}/{item.answered}
            </span>
          </div>
          <Meter value={item.accuracy} />
        </li>
      ))}
      </ul>
    </>
  )
}

export default function ProgressPage() {
  const [dashboard, setDashboard] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    analyticsApi
      .dashboard()
      .then(setDashboard)
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!dashboard) return <Spinner label="Loading your progress" />

  if (dashboard.attempts_analyzed === 0) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center">
        <h1 className="mb-3 font-serif text-3xl font-bold tracking-tight">Your progress</h1>
        <p className="mb-7 text-sm leading-relaxed text-ink-soft">
          Finish a full adaptive test to start seeing your score history and accuracy
          breakdown here. Practice questions are not counted — only full tests are.
        </p>
        <Link className={buttonClass()} to="/tests">
          Take a test
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-1 font-serif text-3xl font-bold tracking-tight">Your progress</h1>
      <p className="mb-7 text-sm text-ink-faint">
        Based on {dashboard.attempts_analyzed} finished{' '}
        {dashboard.attempts_analyzed === 1 ? 'attempt' : 'attempts'}. Practice-mode
        questions aren't tracked here — only full tests are.
      </p>

      <Card className="mb-6">
        <ScoreTrend history={dashboard.score_history} />
      </Card>

      <div className="mb-6 grid gap-6 md:grid-cols-2">
        <Card>
          <SectionLabel>Weakest domains</SectionLabel>
          <WeakAreasBars
            items={dashboard.weak_domains}
            minSample={dashboard.min_sample_size}
            labelFor={(row) => `${humanize(row.section)} · ${humanize(row.domain)}`}
            emptyNote={`Not enough answered questions yet in any one domain (need ${dashboard.min_sample_size}+).`}
          />
        </Card>
        <Card>
          <SectionLabel>Weakest skills</SectionLabel>
          <WeakAreasBars
            items={dashboard.weak_skills}
            minSample={dashboard.min_sample_size}
            labelFor={(row) => row.skill}
            emptyNote={`Not enough answered questions yet in any one skill (need ${dashboard.min_sample_size}+).`}
          />
        </Card>
      </div>

      <div className="mb-9 grid gap-x-10 gap-y-9 md:grid-cols-2">
        <div>
          <SectionLabel>By domain</SectionLabel>
          {dashboard.domains.map((row) => (
            <AccuracyRow
              key={`${row.section}-${row.domain}`}
              label={`${humanize(row.section)} · ${humanize(row.domain)}`}
              row={row}
            />
          ))}
        </div>
        <div>
          <SectionLabel>By difficulty</SectionLabel>
          {dashboard.difficulty.map((row) => (
            <AccuracyRow key={row.difficulty} label={humanize(row.difficulty)} row={row} />
          ))}
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Hard items are the ones the adaptive engine gives you more of when module 1
            goes well, so accuracy there moves your score furthest.
          </p>
        </div>
      </div>

      <div className="mb-9">
        <SectionLabel>By skill</SectionLabel>
        <div className="md:columns-2 md:gap-x-10">
          {dashboard.skills.map((row) => (
            <div key={row.skill} className="break-inside-avoid">
              <AccuracyRow label={row.skill} row={row} />
            </div>
          ))}
        </div>
      </div>

      <SectionLabel>Test history</SectionLabel>
      {dashboard.score_history
        .slice()
        .reverse()
        .map((h) => (
          <div key={h.attempt_id} className="flex items-center gap-4 border-b border-line py-3">
            <span className="flex-grow text-sm">{h.form_name}</span>
            <span className="w-16 flex-shrink-0 text-xs text-ink-faint">
              {formatDate(h.submitted_at)}
            </span>
            <span className="hidden w-20 flex-shrink-0 text-xs text-ink-soft sm:inline">
              {h.status}
            </span>
            <span className="w-12 flex-shrink-0 text-right font-mono text-base tabular-nums">
              {h.total_scaled_score ?? '—'}
            </span>
            <Link
              className="flex-shrink-0 whitespace-nowrap text-right text-sm text-accent"
              to={`/tests/${h.attempt_id}/result`}
            >
              View report
            </Link>
          </div>
        ))}
    </div>
  )
}
