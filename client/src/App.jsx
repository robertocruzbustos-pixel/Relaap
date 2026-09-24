import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { useAuth } from './lib/auth.jsx'
import Layout from './components/Layout.jsx'
import { PageLoader } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'

// El resto se carga bajo demanda para que el primer ingreso sea rápido.
const MatchPage = lazy(() => import('./pages/MatchPage.jsx'))
const NewMatch = lazy(() => import('./pages/NewMatch.jsx'))
const Archive = lazy(() => import('./pages/Archive.jsx'))
const Teams = lazy(() => import('./pages/Teams.jsx'))
const TeamDetail = lazy(() => import('./pages/TeamDetail.jsx'))
const Phrases = lazy(() => import('./pages/Phrases.jsx'))
const Notes = lazy(() => import('./pages/Notes.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname + location.search }} />
  return children
}

export default function App() {
  const { user, loading, connectionError, retry } = useAuth()
  if (loading) return <PageLoader />

  if (connectionError && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <WifiOff className="h-10 w-10 text-amber-400" aria-hidden />
        <div>
          <p className="text-lg font-semibold">No pudimos conectar con el servidor</p>
          <p className="mt-1 text-sm text-slate-400">{connectionError}. Tu sesión sigue guardada.</p>
        </div>
        <button className="btn-primary" onClick={retry}>Reintentar</button>
      </div>
    )
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/entrar" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="partidos" element={<Archive />} />
          <Route path="partidos/nuevo" element={<NewMatch />} />
          <Route path="partidos/:id" element={<MatchPage />} />
          <Route path="equipos" element={<Teams />} />
          <Route path="equipos/:id" element={<TeamDetail />} />
          <Route path="frases" element={<Phrases />} />
          <Route path="notas" element={<Notes />} />
          <Route path="ajustes" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
