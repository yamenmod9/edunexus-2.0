import { Link, Route, Routes } from 'react-router-dom'

import RequireAuth from './auth/RequireAuth.jsx'
import Layout from './components/Layout.jsx'
import { LoginPage, RegisterPage } from './pages/AuthPages.jsx'
import HomePage from './pages/HomePage.jsx'
import PracticePage from './pages/PracticePage.jsx'
import ProgressPage from './pages/ProgressPage.jsx'
import ResultPage from './pages/ResultPage.jsx'
import TestPlayerPage from './pages/TestPlayerPage.jsx'
import TestsPage from './pages/TestsPage.jsx'
import AdminPage from './pages/admin/AdminPage.jsx'

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <Link className="text-accent underline" to="/">
        Back to the dashboard
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/tests" element={<TestsPage />} />
        <Route path="/tests/:attemptId" element={<TestPlayerPage />} />
        <Route path="/tests/:attemptId/result" element={<ResultPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route
          path="/admin"
          element={
            <RequireAuth admin>
              <AdminPage />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
