import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext.jsx'
import SiteFooter from '../components/SiteFooter.jsx'
import { Alert, Button, Field } from '../components/ui.jsx'

// The sign-in screens sit outside the app shell, so they carry the trademark
// notice themselves rather than inheriting Layout's.
//
// Two panels: the left states what the product actually is — server-side
// adaptive routing — rather than a generic welcome, and the right carries the
// form and nothing else. Below `md` the panels stack and the pitch drops away,
// because on a phone the form is the only thing worth showing.
function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto grid w-full max-w-5xl flex-grow grid-cols-1 md:grid-cols-2">
        <div className="hidden flex-col justify-between border-line px-10 py-14 md:flex md:border-r">
          <span className="font-serif text-xl font-bold tracking-tight">EduNexus</span>

          <div>
            <p className="mb-4 font-serif text-3xl font-bold leading-tight tracking-tight">
              Practice the digital SAT the way it actually adapts.
            </p>
            <p className="mb-8 text-sm leading-relaxed text-ink-soft">
              Two sections, two modules each. How you do on the first module decides
              which second module you get — scored server-side, exactly like the real
              thing.
            </p>
            <dl className="flex gap-8">
              {[
                ['639', 'tagged questions'],
                ['4', 'full-length tests'],
                ['98', 'questions per test'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd>
                    <span className="block font-mono text-xl tabular-nums">{value}</span>
                    <span className="text-xs text-ink-faint">{label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

        </div>

        <div className="flex flex-col justify-center px-6 py-14 sm:px-10">
          <p className="mb-1 font-serif text-lg font-bold tracking-tight md:hidden">
            EduNexus
          </p>
          <h1 className="mb-1 text-xl font-semibold">{title}</h1>
          <p className="mb-6 text-sm text-ink-faint">{subtitle}</p>
          {children}
          <p className="mt-5 text-sm text-ink-soft">{footer}</p>
        </div>
      </div>

      <SiteFooter className="mt-0" />
    </div>
  )
}

function useAuthForm(action, redirectTo) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function onSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setFieldErrors({})
    try {
      await action(email.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
      setFieldErrors(err.fieldErrors ?? {})
    } finally {
      setBusy(false)
    }
  }

  const fieldError = (name) => {
    const value = fieldErrors[name]
    return Array.isArray(value) ? value.join(' ') : value
  }

  return { email, setEmail, password, setPassword, error, fieldError, busy, onSubmit }
}

export function LoginPage() {
  const { login, user } = useAuth()
  const location = useLocation()
  const from = location.state?.from?.pathname ?? '/'
  const form = useAuthForm(login, from)

  if (user) return <Navigate to={from} replace />

  return (
    <AuthShell
      title="Sign in"
      subtitle="Digital SAT practice"
      footer={
        <>
          No account yet? <Link className="text-accent underline" to="/register">Create one</Link>
        </>
      }
    >
      <form onSubmit={form.onSubmit} noValidate>
        {form.error && <Alert>{form.error}</Alert>}
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          error={form.fieldError('email')}
          onChange={(e) => form.setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          error={form.fieldError('password')}
          onChange={(e) => form.setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={form.busy}>
          {form.busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { register, user } = useAuth()
  const form = useAuthForm(register, '/')

  if (user) return <Navigate to="/" replace />

  return (
    <AuthShell
      title="Create an account"
      subtitle="Signing up unlocks the question bank"
      footer={
        <>
          Already have one? <Link className="text-accent underline" to="/login">Sign in</Link>
        </>
      }
    >
      <form onSubmit={form.onSubmit} noValidate>
        {form.error && <Alert>{form.error}</Alert>}
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          error={form.fieldError('email')}
          onChange={(e) => form.setEmail(e.target.value)}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          error={form.fieldError('password')}
          hint="At least 10 characters, including a letter and a digit."
          onChange={(e) => form.setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={form.busy}>
          {form.busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </AuthShell>
  )
}
