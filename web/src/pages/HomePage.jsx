import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { attempts as attemptsApi } from '../api/client.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { Alert, Button, Card, humanize } from '../components/ui.jsx'

export default function HomePage() {
  const { user, isAdmin } = useAuth()
  const [openAttempt, setOpenAttempt] = useState(null)
  const [lastResult, setLastResult] = useState(null)

  useEffect(() => {
    attemptsApi
      .current()
      .then((data) => setOpenAttempt(data.attempt))
      .catch(() => {})
    attemptsApi
      .list()
      .then((data) => {
        const finished = data.items.filter((a) => a.status !== 'in_progress')
        setLastResult(finished[0] ?? null)
      })
      .catch(() => {})
  }, [])

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Welcome back</h1>
      <p className="mb-6 text-sm text-ink-faint">{user?.email}</p>

      {openAttempt && (
        <Alert tone="info" title="You have a test in progress">
          {openAttempt.form_name} — {humanize(openAttempt.current_module?.section)} module{' '}
          {openAttempt.current_module?.sequence}.{' '}
          <Link className="underline" to={`/tests/${openAttempt.id}`}>
            Resume it
          </Link>
          . The clock is still running.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Practice questions</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Work through single questions filtered by section, domain, skill and
            difficulty. Explanations appear once you answer.
          </p>
          <Link to="/practice">
            <Button>Start practising</Button>
          </Link>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold">Full adaptive test</h2>
          <p className="mb-4 text-sm text-ink-soft">
            Two sections, two modules each. How you do on module 1 decides which module 2
            you get — the same way the digital SAT works.
          </p>
          <Link to="/tests">
            <Button>Take a test</Button>
          </Link>
        </Card>

        {lastResult && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Your last result</h2>
            <p className="mb-4 text-sm text-ink-soft">
              {lastResult.form_name} ·{' '}
              {new Date(lastResult.started_at + 'Z').toLocaleDateString()}
            </p>
            <Link to={`/tests/${lastResult.id}/result`}>
              <Button variant="secondary">View score report</Button>
            </Link>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Admin tools</h2>
            <p className="mb-4 text-sm text-ink-soft">
              Author questions, bulk import a CSV, and assemble test forms.
            </p>
            <Link to="/admin">
              <Button variant="secondary">Open admin</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  )
}
