import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '../auth/AuthContext.jsx'
import SiteFooter from './SiteFooter.jsx'
import ThemeToggle from './ThemeToggle.jsx'
import { Button } from './ui.jsx'

function navClass({ isActive }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-sunken'
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
    // Column, so the footer is pushed to the bottom of the viewport rather
    // than sitting directly under short content with dead space beneath it.
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-1.5 px-4 py-3">
          <NavLink
            to="/"
            className="mr-4 font-serif text-lg font-bold tracking-tight text-ink"
          >
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
            <ThemeToggle />
            <span className="hidden text-xs text-ink-faint sm:inline">{user?.email}</span>
            <Button variant="secondary" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-grow px-4 py-8">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  )
}
