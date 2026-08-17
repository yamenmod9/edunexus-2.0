import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext.jsx'
import { Button } from './ui.jsx'

function navClass({ isActive }) {
  return `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-accent-soft text-accent-hover' : 'text-ink-soft hover:bg-slate-100'
  }`
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
          <NavLink to="/" className="mr-2 text-lg font-bold tracking-tight">
            EduNexus
          </NavLink>

          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            <NavLink to="/practice" className={navClass}>
              Practice
            </NavLink>
            <NavLink to="/tests" className={navClass}>
              Tests
            </NavLink>
            <NavLink to="/progress" className={navClass}>
              Progress
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navClass}>
                Admin
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-ink-faint sm:inline">{user?.email}</span>
            <Button variant="secondary" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
