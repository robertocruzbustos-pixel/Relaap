import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Globe, Plus, Shield, Trophy, Users } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import MatchCard from '../components/MatchCard.jsx'
import { EmptyState, PageHeader, PageLoader, useFeedback } from '../components/ui.jsx'

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [matches, setMatches] = useState(null)
  const [teamCount, setTeamCount] = useState(0)

  useEffect(() => {
    Promise.all([api.get('/matches'), api.get('/teams')])
      .then(([m, t]) => {
        setMatches(m.matches)
        setTeamCount(t.teams.length)
      })
      .catch((err) => {
        feedback.error(err)
        setMatches([])
      })
  }, [feedback])

  if (!matches) return <PageLoader />

  const live = matches.filter((m) => m.status === 'live')
  const upcoming = matches.filter((m) => m.status === 'scheduled')
  const recent = matches.filter((m) => m.status === 'finished').slice(0, 6)
  const firstName = user.name.split(' ')[0]

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Hola, ${firstName}`}
        subtitle={new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
      >
        <button className="btn-primary" onClick={() => navigate('/partidos/nuevo')}>
          <Plus className="h-4 w-4" /> Nuevo partido
        </button>
      </PageHeader>

      <div className="mb-8 grid grid-cols-3 gap-3">
        {[
          { icon: Trophy, label: 'Partidos', value: matches.length },
          { icon: Shield, label: 'Equipos', value: teamCount },
          { icon: Users, label: 'En vivo', value: live.length },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="card flex items-center gap-3 px-4 py-3">
            <Icon className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="font-display text-2xl font-semibold leading-none tabular-nums">{value}</p>
              <p className="text-xs text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {matches.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="Tu cabina está vacía"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-primary" onClick={() => navigate('/partidos/nuevo')}>
                <Plus className="h-4 w-4" /> Crear mi primer partido
              </button>
              <Link to="/ajustes" className="btn-secondary">
                <Globe className="h-4 w-4" /> Conectar API deportiva
              </Link>
            </div>
          }
        >
          Podés importar partidos y plantillas reales desde API-Football, o cargar tus equipos a mano (ideal para ligas locales).
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {live.length > 0 && (
            <Section title="En vivo ahora">
              {live.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </Section>
          )}
          {upcoming.length > 0 && (
            <Section title="Próximos partidos">
              {upcoming.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </Section>
          )}
          {recent.length > 0 && (
            <Section title="Últimos partidos" more={{ to: '/partidos', label: 'Ver archivo' }}>
              {recent.map((m) => (
                <MatchCard key={m.id} match={m} />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, more, children }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold tracking-wide text-slate-200">{title}</h2>
        {more && (
          <Link to={more.to} className="text-sm text-emerald-400 hover:underline">
            {more.label}
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  )
}
