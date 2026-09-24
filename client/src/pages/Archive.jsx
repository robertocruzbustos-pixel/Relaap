import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive as ArchiveIcon, Plus, Search } from 'lucide-react'
import { api, qs } from '../lib/api.js'
import MatchCard from '../components/MatchCard.jsx'
import { EmptyState, PageHeader, PageLoader, useFeedback } from '../components/ui.jsx'

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'live', label: 'En vivo' },
  { value: 'scheduled', label: 'Programados' },
  { value: 'finished', label: 'Finalizados' },
]

export default function Archive() {
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState(null)

  // Espera a que dejes de escribir antes de consultar.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    api
      .get(`/matches${qs({ status, q: query })}`)
      .then((d) => setMatches(d.matches))
      .catch((err) => {
        feedback.error(err)
        setMatches([])
      })
  }, [status, query, feedback])

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Partidos" subtitle="Todo tu archivo de relatos, en vivo y finalizados.">
        <button className="btn-primary" onClick={() => navigate('/partidos/nuevo')}>
          <Plus className="h-4 w-4" /> Nuevo partido
        </button>
      </PageHeader>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Buscar equipo o torneo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar partidos"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              aria-pressed={status === f.value}
              className={`rounded-full px-3 py-1 text-sm ${
                status === f.value ? 'bg-emerald-500 font-medium text-emerald-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!matches ? (
        <PageLoader />
      ) : matches.length === 0 ? (
        <EmptyState icon={ArchiveIcon} title="No hay partidos para mostrar">
          {query || status ? 'Probá con otro filtro o búsqueda.' : 'Cuando crees o importes partidos, van a aparecer acá.'}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}
