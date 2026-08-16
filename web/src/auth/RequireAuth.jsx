import { Navigate, useLocation } from 'react-router-dom'

import { Spinner } from '../components/ui.jsx'
import { useAuth } from './AuthContext.jsx'

/**
 * Route guard. This is a convenience for the user, not a security boundary -
 * every protected route is enforced server-side, and hiding a link has never
 * stopped anyone typing a URL.
 */
export default function RequireAuth({ admin = false, children }) {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Checking your session" />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (admin && !isAdmin) return <Navigate to="/" replace />
  return children
}
