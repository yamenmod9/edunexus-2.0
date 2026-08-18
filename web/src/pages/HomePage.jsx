import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { attempts as attemptsApi } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { Button, Card, SectionLabel, humanize } from '../components/ui.jsx'

const BookIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
)

const ClockIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

function formatDay(iso) {
  if (!iso) return ''
  return new Date(iso + 'Z').toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
  })
}

export default function HomePage() {
  const { isAdmin } = useAuth()
  const [openAttempt, setOpenAttempt] = useState(null)
  const [finished, setFinished] = useState([])

  useEffect(() => {
    attemptsApi
      .current()
      .then((data) => setOpenAttempt(data.attempt))
      .catch(() => {})
    attemptsApi
      .list()
      .then((data) => setFinished(data.items.filter((a) => a.status !== 'in_progress')))
      .catch(() => {})
  }, [])

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">
        {today}
      </p>
      <h1 className="mb-7 font-serif text-3xl font-bold tracking-tight">Welcome back</h1>

      {/* One primary action. When a test is live, resuming it is the only thing
          that matters — everything else waits below. */}
      {openAttempt ? (
        <Card className="mb-7 flex flex-wrap items-center gap-6">
          <div className="min-w-64 flex-grow">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-flag">
              <span className="h-1.5 w-1.5 rounded-full bg-flag" aria-hidden="true" />
              Test in progress
            </p>
            <p className="mb-1.5 text-lg font-semibold">
              {openAttempt.form_name} — {humanize(openAttempt.current_module?.section)},
              module {openAttempt.current_module?.sequence}
            </p>
            <p className="text-sm text-ink-soft">
              The clock is still running on this module.
            </p>
          </div>
          <Link to={`/tests/${openAttempt.id}`}>
            <Button className="px-6 py-3">Resume test</Button>
          </Link>
        </Card>
      ) : (
        <Card className="mb-7 flex flex-wrap items-center gap-6">
          <div className="min-w-64 flex-grow">
            <p className="mb-1.5 text-lg font-semibold">Ready for a full-length test?</p>
            <p className="text-sm text-ink-soft">
              Two sections, two modules each, about two hours. Scored the way the real
              digital SAT scores.
            </p>
          </div>
          <Link to="/tests">
            <Button className="px-6 py-3">Start a test</Button>
          </Link>
        </Card>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Card>
          <span className="mb-3 block text-accent">{BookIcon}</span>
          <h2 className="mb-1.5 text-base font-semibold">Practice questions</h2>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">
            Single questions filtered by section, domain, skill and difficulty. The
            explanation appears once you answer.
          </p>
          <Link className="text-sm font-medium text-accent" to="/practice">
            Start practising →
          </Link>
        </Card>

        <Card>
          <span className="mb-3 block text-accent">{ClockIcon}</span>
          <h2 className="mb-1.5 text-base font-semibold">Your progress</h2>
          <p className="mb-4 text-sm leading-relaxed text-ink-soft">
            Score history across finished tests, and the domains and skills costing you
            the most marks.
          </p>
          <Link className="text-sm font-medium text-accent" to="/progress">
            See progress →
          </Link>
        </Card>
      </div>

      {finished.length > 0 && (
        <>
          <SectionLabel>Recent</SectionLabel>
          <ul>
            {finished.slice(0, 4).map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center gap-4 border-b border-line py-4"
              >
                <div className="min-w-40 flex-grow">
                  <p className="text-sm font-medium">{attempt.form_name}</p>
                  <p className="text-xs text-ink-faint">{formatDay(attempt.started_at)}</p>
                </div>
                <Link
                  className="text-sm font-medium text-accent"
                  to={`/tests/${attempt.id}/result`}
                >
                  Score report →
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {isAdmin && (
        <div className="mt-8">
          <SectionLabel>Admin</SectionLabel>
          <Link className="text-sm font-medium text-accent" to="/admin">
            Author questions and assemble forms →
          </Link>
        </div>
      )}
    </div>
  )
}
