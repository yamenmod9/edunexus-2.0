import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { analytics as analyticsApi } from '../api/client.js'
import { Alert, Badge, Card, Spinner, humanize } from '../components/ui.jsx'

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
    return <p className="text-sm text-ink-faint">No completed attempts yet.</p>
  }

  if (points.length === 1) {
    const only = points[0].entry
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Latest total score
        </p>
        <p className="text-4xl font-bold tabular-nums">{only.total_scaled_score}</p>
        <p className="mt-1 text-sm text-ink-faint">
          {only.form_name} · {formatDate(only.submitted_at)} · one more finished test
          will start a trend line
        </p>
      </div>
    )
  }

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.score)}`).join(' ')
  const last = points[points.length - 1]
  const active = hovered ?? points.length - 1
  const activePoint = points[active]

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Total score by attempt
      </p>
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
              stroke="#e2e8f0"
              strokeWidth="1"
            />
            <text x={padding.left - 8} y={yFor(tick) + 4} textAnchor="end" fontSize="10" fill="#64748b">
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
            stroke="#94a3b8"
            strokeWidth="1"
          />
        )}

        <path d={path} fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p, i) => (
          <circle
            key={p.entry.attempt_id}
            tabIndex={0}
            cx={xFor(i)}
            cy={yFor(p.score)}
            r={i === active ? 6 : 4}
            fill="#1d4ed8"
            stroke="#fff"
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
        <text x={xFor(points.length - 1)} y={yFor(last.score) - 12} textAnchor="end" fontSize="12" fontWeight="600" fill="#0f172a">
          {last.score}
        </text>
      </svg>

      <div className="mt-2 flex items-center justify-between text-xs text-ink-faint">
        <span>{formatDate(points[0].entry.submitted_at)}</span>
        <span>{formatDate(last.entry.submitted_at)}</span>
      </div>

      {/* Same detail as the tooltip, always visible - the table view. */}
      <p className="mt-3 text-sm" aria-live="polite">
        <strong className="tabular-nums">{activePoint.score}</strong>{' '}
        <span className="text-ink-faint">
          — {activePoint.entry.form_name} · {formatDate(activePoint.entry.submitted_at)}
        </span>
      </p>
    </div>
  )
}

/** Ranked, low-accuracy-first. One hue: this is magnitude, not identity. */
function WeakAreasBars({ items, labelFor, emptyNote }) {
  if (items.length === 0) {
    return <p className="text-sm text-ink-faint">{emptyNote}</p>
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={labelFor(item)} className="group">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span>{labelFor(item)}</span>
            <span className="tabular-nums text-ink-faint">
              {formatPercent(item.accuracy)} ({item.correct}/{item.answered})
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-accent transition-all group-hover:bg-accent-hover"
              style={{ width: `${Math.max(2, (item.accuracy ?? 0) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function AccuracyTable({ rows, labelFor }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase text-ink-faint">
          <th scope="col" className="pb-2">Area</th>
          <th scope="col" className="pb-2 text-right">Of answered</th>
          <th scope="col" className="pb-2 text-right">Accuracy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const skipped = row.delivered - row.answered
          return (
            <tr key={labelFor(row)} className="border-b border-slate-100">
              <th scope="row" className="py-2 text-left font-normal">
                {labelFor(row)}
                {skipped > 0 && (
                  <span className="ml-1 text-xs text-ink-faint">({skipped} skipped)</span>
                )}
              </th>
              <td className="py-2 text-right tabular-nums">
                {row.correct}/{row.answered}
              </td>
              <td className="py-2 text-right tabular-nums">{formatPercent(row.accuracy)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
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
      <div>
        <h1 className="mb-4 text-2xl font-bold">Your progress</h1>
        <Card>
          <p className="mb-4 text-sm text-ink-soft">
            Finish a full adaptive test to start seeing your score history and
            accuracy breakdown here.
          </p>
          <Link className="text-sm text-accent underline" to="/tests">
            Take a test
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Your progress</h1>
      <p className="mb-5 text-sm text-ink-faint">
        Based on {dashboard.attempts_analyzed} finished{' '}
        {dashboard.attempts_analyzed === 1 ? 'attempt' : 'attempts'}. Practice-mode
        questions aren't tracked here — only full tests are.
      </p>

      <Card className="mb-6">
        <ScoreTrend history={dashboard.score_history} />
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Weakest domains</h2>
          <WeakAreasBars
            items={dashboard.weak_domains}
            labelFor={(row) => `${humanize(row.section)} · ${humanize(row.domain)}`}
            emptyNote={`Not enough answered questions yet in any one domain (need ${dashboard.min_sample_size}+).`}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Weakest skills</h2>
          <WeakAreasBars
            items={dashboard.weak_skills}
            labelFor={(row) => row.skill}
            emptyNote={`Not enough answered questions yet in any one skill (need ${dashboard.min_sample_size}+).`}
          />
        </Card>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">By domain</h2>
          <AccuracyTable
            rows={dashboard.domains}
            labelFor={(row) => `${humanize(row.section)} · ${humanize(row.domain)}`}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-lg font-semibold">By difficulty</h2>
          <AccuracyTable rows={dashboard.difficulty} labelFor={(row) => humanize(row.difficulty)} />
        </Card>
      </div>

      <Card className="mb-6">
        <h2 className="mb-3 text-lg font-semibold">By skill</h2>
        <AccuracyTable rows={dashboard.skills} labelFor={(row) => row.skill} />
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Test history</h2>
      <div className="space-y-2">
        {dashboard.score_history
          .slice()
          .reverse()
          .map((h) => (
            <Card key={h.attempt_id} className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <p className="font-medium">{h.form_name}</p>
                <p className="text-xs text-ink-faint">{formatDate(h.submitted_at)}</p>
              </div>
              <Badge tone={h.status === 'submitted' ? 'good' : 'neutral'}>{h.status}</Badge>
              <span className="tabular-nums font-semibold">
                {h.total_scaled_score ?? '—'}
              </span>
              <Link className="text-sm text-accent underline" to={`/tests/${h.attempt_id}/result`}>
                View report
              </Link>
            </Card>
          ))}
      </div>
    </div>
  )
}
