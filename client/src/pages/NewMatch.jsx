import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarSearch, Globe, PencilLine, Search, Trophy, X } from 'lucide-react'
import { api, qs } from '../lib/api.js'
import { FORMATIONS } from '../lib/constants.js'
import { formatDateTime, fromLocalInput, todayISO } from '../lib/format.js'
import { EmptyState, Field, PageHeader, Spinner, useAction, useFeedback } from '../components/ui.jsx'

export default function NewMatch() {
  const [tab, setTab] = useState('api')
  const [sports, setSports] = useState(null)

  useEffect(() => {
    api.get('/sports/status').then(setSports).catch(() => setSports({ configured: false }))
  }, [])

  const tabs = [
    { id: 'api', label: 'Desde la API deportiva', icon: Globe },
    { id: 'manual', label: 'Carga manual', icon: PencilLine },
  ]

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nuevo partido" subtitle="Importá un partido real con su alineación o armalo a mano." />

      <div className="mb-5 flex gap-1 border-b border-slate-800" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium sm:px-4 ${
              tab === id ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'api' ? <FromApi sports={sports} onManual={() => setTab('manual')} /> : <Manual />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function FromApi({ sports, onManual }) {
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [filters, setFilters] = useState({ date: todayISO(), season: '', league: null, team: null })
  const [fixtures, setFixtures] = useState(null)
  const [importing, setImporting] = useState(null)

  if (sports && !sports.configured) {
    return (
      <EmptyState
        icon={Globe}
        title="Conectá la API deportiva"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/ajustes" className="btn-primary">Cargar mi API key</Link>
            <button className="btn-secondary" onClick={onManual}>Cargar manualmente</button>
          </div>
        }
      >
        Con una key de API-Football podés buscar partidos, y traer planteles y alineaciones oficiales con un click.
      </EmptyState>
    )
  }

  const search = (e) => {
    e.preventDefault()
    run(async () => {
      const params = {
        date: filters.date || undefined,
        season: filters.season || undefined,
        league: filters.league?.external_id,
        team: filters.team?.external_id,
      }
      const d = await api.get(`/sports/fixtures${qs(params)}`)
      setFixtures(d.fixtures)
    })
  }

  const prepare = async (fx) => {
    setImporting(fx.external_id)
    try {
      const r = await api.post('/sports/import/fixture', { fixture_id: fx.external_id })
      if (r.existing) feedback.success('Ese partido ya estaba en tu cuenta.')
      else if (!r.lineup_loaded) feedback.success('Aún no hay alineación oficial: armamos una con el plantel. Podés ajustarla en la previa.')
      navigate(`/partidos/${r.match_id}?tab=previa`)
    } catch (err) {
      feedback.error(err)
      setImporting(null)
    }
  }

  return (
    <div>
      <form onSubmit={search} className="card mb-5 grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Fecha">
          <input className="input" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        </Field>
        <Field label="Temporada" hint="Necesaria si filtrás por liga o equipo (ej. 2024).">
          <input className="input" type="number" min="1990" max="2100" value={filters.season} onChange={(e) => setFilters({ ...filters, season: e.target.value })} placeholder="Año" />
        </Field>
        <Picker
          label="Liga o torneo"
          placeholder="Ej. Liga Profesional"
          endpoint="leagues"
          listKey="leagues"
          value={filters.league}
          onPick={(league) =>
            setFilters((f) => ({ ...f, league, season: f.season || league?.current_season || '' }))
          }
          render={(l) => `${l.name}${l.country ? ` · ${l.country}` : ''}`}
        />
        <Picker
          label="Equipo"
          placeholder="Ej. River"
          endpoint="teams"
          listKey="teams"
          value={filters.team}
          onPick={(team) => setFilters((f) => ({ ...f, team }))}
          render={(t) => `${t.name}${t.country ? ` · ${t.country}` : ''}`}
        />
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <p className="text-xs text-slate-500">Podés combinar filtros. Sin filtros se listan los partidos de hoy.</p>
          <button className="btn-primary" disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <CalendarSearch className="h-4 w-4" />} Buscar partidos
          </button>
        </div>
      </form>

      {fixtures && fixtures.length === 0 && (
        <EmptyState icon={Trophy} title="No se encontraron partidos">Probá con otra fecha, temporada o filtro.</EmptyState>
      )}

      <ul className="space-y-2">
        {fixtures?.map((fx) => (
          <li key={fx.external_id} className="card flex flex-wrap items-center gap-3 p-3">
            <div className="w-full text-xs text-slate-400 sm:w-44">
              <p className="truncate font-medium text-slate-300">{fx.league.name}</p>
              <p>{formatDateTime(fx.date)}</p>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2 font-medium">
              <TeamLogo team={fx.home} />
              <span className="truncate">{fx.home.name}</span>
              <span className="px-1 text-slate-500">
                {fx.goals?.home !== null && fx.goals?.home !== undefined ? `${fx.goals.home}–${fx.goals.away}` : 'vs'}
              </span>
              <TeamLogo team={fx.away} />
              <span className="truncate">{fx.away.name}</span>
            </div>
            <button className="btn-primary btn-sm" onClick={() => prepare(fx)} disabled={importing !== null}>
              {importing === fx.external_id ? <Spinner className="h-4 w-4" /> : 'Preparar partido'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const TeamLogo = ({ team }) =>
  team.logo ? <img src={team.logo} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" /> : null

/** Campo de búsqueda con resultados desplegables y valor elegido. */
function Picker({ label, placeholder, endpoint, listKey, value, onPick, render }) {
  const feedback = useFeedback()
  const [text, setText] = useState('')
  const [results, setResults] = useState(null)
  const [busy, setBusy] = useState(false)

  const find = async () => {
    if (text.trim().length < 3) return feedback.error('Escribí al menos 3 letras.')
    setBusy(true)
    try {
      const d = await api.get(`/sports/${endpoint}?search=${encodeURIComponent(text.trim())}`)
      setResults(d[listKey])
    } catch (err) {
      feedback.error(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      <span className="label">{label}</span>
      {value ? (
        <div className="input flex items-center justify-between gap-2">
          <span className="truncate">{render(value)}</span>
          <button type="button" onClick={() => onPick(null)} aria-label={`Quitar ${label}`} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <input
            className="input"
            placeholder={placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                find()
              }
            }}
          />
          <button type="button" className="btn-secondary px-3" onClick={find} disabled={busy} aria-label={`Buscar ${label}`}>
            {busy ? <Spinner className="h-4 w-4" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
      )}
      {!value && results && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          {results.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">Sin resultados</li>}
          {results.map((r) => (
            <li key={r.external_id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-800"
                onClick={() => {
                  onPick(r)
                  setResults(null)
                }}
              >
                {render(r)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Manual() {
  const navigate = useNavigate()
  const [run, busy] = useAction()
  const [teams, setTeams] = useState([])
  const [form, setForm] = useState({
    home: { team_id: '', name: '', color: '#2563eb', formation: '4-4-2' },
    away: { team_id: '', name: '', color: '#dc2626', formation: '4-4-2' },
    competition: '',
    venue: '',
    kickoff: '',
  })

  useEffect(() => {
    api.get('/teams').then((d) => setTeams(d.teams)).catch(() => {})
  }, [])

  const setSide = (side, patch) => setForm((f) => ({ ...f, [side]: { ...f[side], ...patch } }))

  const pickTeam = (side, value) => {
    const team = teams.find((t) => String(t.id) === value)
    setSide(side, team ? { team_id: value, name: team.name, color: team.color } : { team_id: '' })
  }

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      const side = (s) => ({
        ...(s.team_id ? { team_id: Number(s.team_id) } : { name: s.name, color: s.color }),
        formation: s.formation,
      })
      const bundle = await api.post('/matches', {
        home: side(form.home),
        away: side(form.away),
        competition: form.competition,
        venue: form.venue,
        kickoff_at: fromLocalInput(form.kickoff),
      })
      navigate(`/partidos/${bundle.match.id}?tab=previa`)
    })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['home', 'Local'],
          ['away', 'Visitante'],
        ].map(([side, title]) => {
          const s = form[side]
          return (
            <fieldset key={side} className="card space-y-3 p-4">
              <legend className="px-1 font-display text-lg font-semibold tracking-wide text-slate-200">{title}</legend>
              <Field label="Equipo">
                <select className="input" value={s.team_id} onChange={(e) => pickTeam(side, e.target.value)}>
                  <option value="">Escribir a mano…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.player_count} jug.)</option>
                  ))}
                </select>
              </Field>
              {!s.team_id && (
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Field label="Nombre">
                    <input className="input" value={s.name} onChange={(e) => setSide(side, { name: e.target.value })} required />
                  </Field>
                  <Field label="Color">
                    <input className="input h-10 w-14 cursor-pointer p-1" type="color" value={s.color} onChange={(e) => setSide(side, { color: e.target.value })} />
                  </Field>
                </div>
              )}
              <Field label="Formación">
                <select className="input" value={s.formation} onChange={(e) => setSide(side, { formation: e.target.value })}>
                  {FORMATIONS.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
            </fieldset>
          )
        })}
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        <Field label="Torneo / competencia">
          <input className="input" value={form.competition} onChange={(e) => setForm({ ...form, competition: e.target.value })} />
        </Field>
        <Field label="Estadio / sede">
          <input className="input" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} />
        </Field>
        <Field label="Fecha y hora">
          <input className="input" type="datetime-local" value={form.kickoff} onChange={(e) => setForm({ ...form, kickoff: e.target.value })} />
        </Field>
      </div>

      <p className="text-xs text-slate-500">
        Si elegís equipos con plantel cargado, se arma la alineación automáticamente. Si no, podés cargar los jugadores en la previa del partido.
      </p>

      <button className="btn-primary" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />} Crear partido
      </button>
    </form>
  )
}
