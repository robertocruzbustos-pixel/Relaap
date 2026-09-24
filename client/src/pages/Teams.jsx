import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Plus, Search, Shield } from 'lucide-react'
import { api } from '../lib/api.js'
import { textOn } from '../lib/format.js'
import { EmptyState, Field, Modal, PageHeader, PageLoader, Spinner, useAction, useFeedback } from '../components/ui.jsx'

export default function Teams() {
  const feedback = useFeedback()
  const [teams, setTeams] = useState(null)
  const [modal, setModal] = useState(null) // 'new' | 'import'

  const load = () =>
    api
      .get('/teams')
      .then((d) => setTeams(d.teams))
      .catch((err) => {
        feedback.error(err)
        setTeams([])
      })

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!teams) return <PageLoader />

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Equipos" subtitle="Tus planteles: manuales o importados desde la API deportiva.">
        <button className="btn-secondary" onClick={() => setModal('import')}>
          <Download className="h-4 w-4" /> Importar de la API
        </button>
        <button className="btn-primary" onClick={() => setModal('new')}>
          <Plus className="h-4 w-4" /> Nuevo equipo
        </button>
      </PageHeader>

      {teams.length === 0 ? (
        <EmptyState icon={Shield} title="Todavía no cargaste equipos">
          Creá un equipo y cargá su plantel, o importalo con un click desde API-Football.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} to={`/equipos/${t.id}`} className="card flex items-center gap-4 p-4 transition-colors hover:border-emerald-500/50">
              {t.logo_url ? (
                <img src={t.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-lg bg-white/5 object-contain p-1" loading="lazy" />
              ) : (
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg font-display text-lg font-bold"
                  style={{ backgroundColor: t.color, color: textOn(t.color) }}
                >
                  {(t.short_name || t.name).slice(0, 3).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-white">{t.name}</p>
                <p className="text-xs text-slate-400">
                  {t.player_count} jugadores{t.city ? ` · ${t.city}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {modal === 'new' && <NewTeamModal onClose={() => setModal(null)} onDone={load} />}
      {modal === 'import' && <ImportTeamModal onClose={() => setModal(null)} onDone={load} />}
    </div>
  )
}

function NewTeamModal({ onClose, onDone }) {
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [form, setForm] = useState({ name: '', short_name: '', color: '#2563eb', city: '', stadium: '' })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await api.post('/teams', { ...form, short_name: form.short_name || null, city: form.city || null, stadium: form.stadium || null })
      feedback.success('Equipo creado')
      onDone()
      onClose()
    })
  }

  return (
    <Modal
      title="Nuevo equipo"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="new-team" disabled={busy}>
            Crear equipo
          </button>
        </>
      }
    >
      <form id="new-team" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" className="sm:col-span-2">
          <input className="input" value={form.name} onChange={set('name')} required maxLength={100} />
        </Field>
        <Field label="Sigla">
          <input className="input" value={form.short_name} onChange={set('short_name')} maxLength={10} placeholder="RIV" />
        </Field>
        <Field label="Color de camiseta">
          <input className="input h-10 cursor-pointer p-1" type="color" value={form.color} onChange={set('color')} />
        </Field>
        <Field label="Ciudad">
          <input className="input" value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Estadio">
          <input className="input" value={form.stadium} onChange={set('stadium')} />
        </Field>
      </form>
    </Modal>
  )
}

function ImportTeamModal({ onClose, onDone }) {
  const feedback = useFeedback()
  const [search, setSearch] = useState('')
  const [results, setResults] = useState(null)
  const [run, busy] = useAction()
  const [importing, setImporting] = useState(null)

  const find = (e) => {
    e.preventDefault()
    run(async () => {
      const d = await api.get(`/sports/teams?search=${encodeURIComponent(search)}`)
      setResults(d.teams)
    })
  }

  const importTeam = async (team) => {
    setImporting(team.external_id)
    try {
      await api.post('/sports/import/team', { external_id: team.external_id })
      feedback.success(`${team.name} importado con su plantel`)
      onDone()
      onClose()
    } catch (err) {
      feedback.error(err)
    } finally {
      setImporting(null)
    }
  }

  return (
    <Modal title="Importar equipo de la API" onClose={onClose} wide>
      <form onSubmit={find} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input className="input pl-9" placeholder="Nombre del equipo (mín. 3 letras)" value={search} onChange={(e) => setSearch(e.target.value)} minLength={3} required />
        </div>
        <button className="btn-primary" disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : 'Buscar'}
        </button>
      </form>
      {results && results.length === 0 && <p className="text-sm text-slate-400">Sin resultados.</p>}
      <ul className="divide-y divide-slate-800">
        {results?.map((t) => (
          <li key={t.external_id} className="flex items-center gap-3 py-2.5">
            {t.logo_url && <img src={t.logo_url} alt="" className="h-9 w-9 object-contain" loading="lazy" />}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{t.name}</p>
              <p className="text-xs text-slate-400">{[t.country, t.city].filter(Boolean).join(' · ')}</p>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => importTeam(t)} disabled={importing !== null}>
              {importing === t.external_id ? <Spinner className="h-4 w-4" /> : 'Importar'}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
