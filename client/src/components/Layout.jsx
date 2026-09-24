import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Archive, LayoutDashboard, LogOut, Mic, NotebookPen, Plus, Settings, Shield, MessageSquareQuote, Users } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'

const NAV = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard, end: true },
  { to: '/partidos', label: 'Partidos', icon: Archive },
  { to: '/equipos', label: 'Equipos', icon: Shield },
  { to: '/frases', label: 'Frases', icon: MessageSquareQuote },
  { to: '/notas', label: 'Notas', icon: NotebookPen },
  { to: '/equipo', label: 'Mi equipo', icon: Users, desktopOnly: true },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
]

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen lg:flex">
      {/* Barra lateral (escritorio) */}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950 px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-emerald-950">
            <Mic className="h-5 w-5" />
          </span>
          <span className="font-display text-2xl font-bold tracking-wide">Relator Pro</span>
        </div>

        <button className="btn-primary mb-5 w-full" onClick={() => navigate('/partidos/nuevo')}>
          <Plus className="h-4 w-4" /> Nuevo partido
        </button>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Principal">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 pt-4">
          <p className="truncate px-2 text-sm font-medium text-slate-200">{user.name}</p>
          <p className="truncate px-2 text-xs text-slate-500">{user.email}</p>
          <button className="btn-ghost mt-2 w-full justify-start" onClick={logout}>
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8 lg:pt-7">
        <Outlet />
      </main>

      {/* Navegación inferior (móvil / tablet) */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-800 bg-slate-950/95 backdrop-blur lg:hidden" aria-label="Principal">
        {NAV.filter((n) => !n.desktopOnly && n.to !== '/ajustes').map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-emerald-300' : 'text-slate-500'}`
            }
          >
            <Icon className="h-5 w-5" /> {label}
          </NavLink>
        ))}
        <NavLink
          to="/ajustes"
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? 'text-emerald-300' : 'text-slate-500'}`
          }
        >
          <Settings className="h-5 w-5" /> Ajustes
        </NavLink>
      </nav>
    </div>
  )
}
