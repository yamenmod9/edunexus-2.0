import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext.jsx'
import SiteFooter from '../components/SiteFooter.jsx'
import { Alert, Button, Card, Field } from '../components/ui.jsx'

// The sign-in screens sit outside the app shell, so they carry the trademark
// notice themselves rather than inheriting Layout's.
function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-1 text-center text-2xl font-bold">EduNexus</h1>
      <p className="mb-6 text-center text-sm text-ink-faint">{subtitle}</p>
      <Card>
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </Card>
      <p className="mt-4 text-center text-sm text-ink-faint">{footer}</p>
      <SiteFooter />
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
