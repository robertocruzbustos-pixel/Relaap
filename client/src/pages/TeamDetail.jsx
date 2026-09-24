import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, ChevronRight, ListOrdered, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { POSITIONS, POSITION_ORDER } from '../lib/constants.js'
import { parseRoster } from '../lib/format.js'
import { EmptyState, Field, Modal, PageHeader, PageLoader, useAction, useFeedback } from '../components/ui.jsx'

export default function TeamDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(null)
  const [run, busy] = useAction()
  const [bulk, setBulk] = useState(false)

  const load = useCallback(
    () =>
      api
        .get(`/teams/${id}`)
        .then((d) => {
          setData(d)
          setForm(d.team)
        })
        .catch((err) => setError(err.status === 404 ? 'Equipo no encontrado.' : err.message)),
    [id],
  )

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <EmptyState title={error} action={<Link to="/equipos" className="btn-secondary">Volver a equipos</Link>} />
    )
  }
  if (!data) return <PageLoader />

  const { team, players } = data
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const saveTeam = (e) => {
    e.preventDefault()
    run(async () => {
      const fields = ['name', 'short_name', 'color', 'coach', 'city', 'stadium', 'notes']
      const body = Object.fromEntries(fields.map((k) => [k, form[k] === '' && k !== 'name' && k !== 'notes' ? null : form[k]]))
      const d = await api.patch(`/teams/${team.id}`, body)
      setData((cur) => ({ ...cur, team: d.team }))
      feedback.success('Equipo guardado')
    })
  }

  const removeTeam = async () => {
    const ok = await feedback.confirm({
      title: 'Eliminar equipo',
      message: `Se borrará ${team.name} y su plantel. Los partidos ya creados conservan sus datos.`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    run(async () => {
      await api.del(`/teams/${team.id}`)
      navigate('/equipos')
    })
  }

  const sync = () =>
    run(async () => {
      const r = await api.post(`/sports/teams/${team.id}/sync`)
      feedback.success(`Plantel actualizado (${r.synced} jugadores)`)
      load()
    })

  const grouped = POSITION_ORDER.map((pos) => ({ pos, list: players.filter((p) => p.position === pos) })).filter((g) => g.list.length)

  return (
    <div className="mx-auto max-w-5xl">
      <nav className="mb-3 flex items-center gap-1 text-sm text-slate-400" aria-label="Ruta">
        <Link to="/equipos" className="hover:text-white">Equipos</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-slate-200">{team.name}</span>
      </nav>

      <PageHeader title={team.name} subtitle={`${players.length} jugadores`}>
        {team.external_id && (
          <button className="btn-secondary" onClick={sync} disabled={busy}>
            <RefreshCw className="h-4 w-4" /> Sincronizar plantel
          </button>
        )}
        <button className="btn-ghost text-red-400" onClick={removeTeam}>
          <Trash2 className="h-4 w-4" /> Eliminar
        </button>
      </PageHeader>

      <form onSubmit={saveTeam} className="card mb-6 grid gap-3 p-4 sm:grid-cols-6">
        <Field label="Nombre" className="sm:col-span-3">
          <input className="input" value={form.name} onChange={set('name')} required />
        </Field>
        <Field label="Sigla" className="sm:col-span-1">
          <input className="input" value={form.short_name ?? ''} onChange={set('short_name')} maxLength={10} />
        </Field>
        <Field label="Color" className="sm:col-span-2">
          <input className="input h-10 cursor-pointer p-1" type="color" value={form.color} onChange={set('color')} />
        </Field>
        <Field label="Director técnico" className="sm:col-span-2">
          <input className="input" value={form.coach ?? ''} onChange={set('coach')} />
        </Field>
        <Field label="Ciudad" className="sm:col-span-2">
          <input className="input" value={form.city ?? ''} onChange={set('city')} />
        </Field>
        <Field label="Estadio" className="sm:col-span-2">
          <input className="input" value={form.stadium ?? ''} onChange={set('stadium')} />
        </Field>
        <Field label="Ficha del equipo (datos, historia, curiosidades)" className="sm:col-span-6">
          <textarea className="input min-h-24" value={form.notes ?? ''} onChange={set('notes')} />
        </Field>
        <div className="sm:col-span-6">
          <button className="btn-primary" disabled={busy}>
            <Save className="h-4 w-4" /> Guardar cambios
          </button>
        </div>
      </form>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-wide">Plantel</h2>
        <button className="btn-secondary btn-sm" onClick={() => setBulk(true)}>
          <ListOrdered className="h-4 w-4" /> Carga rápida
        </button>
      </div>

      <AddPlayer teamId={team.id} onAdded={load} />

      {players.length === 0 ? (
        <EmptyState title="Plantel vacío">Agregá jugadores uno por uno o pegá la lista completa con “Carga rápida”.</EmptyState>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ pos, list }) => (
            <section key={pos}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{POSITIONS[pos]}s</h3>
              <div className="card divide-y divide-slate-800">
                {list.map((p) => (
                  <PlayerRow key={p.id} teamId={team.id} player={p} onChanged={load} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {bulk && <BulkModal teamId={team.id} onClose={() => setBulk(false)} onDone={load} />}
    </div>
  )
}

function AddPlayer({ teamId, onAdded }) {
  const [run, busy] = useAction()
  const [p, setP] = useState({ number: '', name: '', position: 'M' })

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      await api.post(`/teams/${teamId}/players`, { name: p.name, number: p.number === '' ? null : Number(p.number), position: p.position })
      setP({ number: '', name: '', position: p.position })
      onAdded()
    })
  }

  return (
    <form onSubmit={submit} className="card mb-4 flex flex-wrap items-end gap-2 p-3">
      <Field label="N°" className="w-20">
        <input className="input" type="number" min="0" max="99" value={p.number} onChange={(e) => setP({ ...p, number: e.target.value })} />
      </Field>
      <Field label="Nombre" className="min-w-40 flex-1">
        <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required />
      </Field>
      <Field label="Posición" className="w-44">
        <select className="input" value={p.position} onChange={(e) => setP({ ...p, position: e.target.value })}>
          {POSITION_ORDER.map((k) => (
            <option key={k} value={k}>{POSITIONS[k]}</option>
          ))}
        </select>
      </Field>
      <button className="btn-primary" disabled={busy}>
        <Plus className="h-4 w-4" /> Agregar
      </button>
    </form>
  )
}

function PlayerRow({ teamId, player, onChanged }) {
  const feedback = useFeedback()
  const [draft, setDraft] = useState({ name: player.name, number: player.number ?? '', notes: player.notes })

  useEffect(() => {
    setDraft({ name: player.name, number: player.number ?? '', notes: player.notes })
  }, [player])

  const patch = async (body) => {
    try {
      await api.patch(`/teams/${teamId}/players/${player.id}`, body)
      onChanged()
    } catch (err) {
      feedback.error(err)
    }
  }

  const commit = (field) => {
    const value = field === 'number' ? (draft.number === '' ? null : Number(draft.number)) : draft[field]
    if (value === (player[field] ?? (field === 'number' ? null : ''))) return
    if (field === 'name' && !draft.name.trim()) return setDraft((d) => ({ ...d, name: player.name }))
    patch({ [field]: value })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        aria-label="Número"
        className="input w-16 text-center font-display text-lg"
        type="number"
        min="0"
        max="99"
        value={draft.number}
        onChange={(e) => setDraft({ ...draft, number: e.target.value })}
        onBlur={() => commit('number')}
      />
      <input
        aria-label="Nombre"
        className="input min-w-36 flex-1"
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        onBlur={() => commit('name')}
      />
      <select aria-label="Posición" className="input w-40" value={player.position} onChange={(e) => patch({ position: e.target.value })}>
        {POSITION_ORDER.map((k) => (
          <option key={k} value={k}>{POSITIONS[k]}</option>
        ))}
      </select>
      <input
        aria-label="Notas"
        className="input min-w-48 flex-[2]"
        placeholder="Datos para el relato…"
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        onBlur={() => commit('notes')}
      />
      <button
        className="btn-ghost btn-sm text-red-400"
        aria-label={`Eliminar a ${player.name}`}
        onClick={async () => {
          if (await feedback.confirm({ title: 'Eliminar jugador', message: `¿Quitar a ${player.name} del plantel?`, confirmLabel: 'Eliminar', danger: true })) {
            try {
              await api.del(`/teams/${teamId}/players/${player.id}`)
              onChanged()
            } catch (err) {
              feedback.error(err)
            }
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

function BulkModal({ teamId, onClose, onDone }) {
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [text, setText] = useState('')
  const parsed = parseRoster(text)

  const submit = () =>
    run(async () => {
      await api.post(`/teams/${teamId}/players`, { players: parsed })
      feedback.success(`${parsed.length} jugadores agregados`)
      onDone()
      onClose()
    })

  return (
    <Modal
      title="Carga rápida de plantel"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={busy || parsed.length === 0}>
            Agregar {parsed.length || ''} jugadores <ArrowRight className="h-4 w-4" />
          </button>
        </>
      }
    >
      <p className="mb-2 text-sm text-slate-400">
        Un jugador por línea: <code className="rounded bg-slate-800 px-1">número nombre posición</code> (posición: G, D, M o F). Ejemplo:
      </p>
      <pre className="mb-3 rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{'1 Juan Pérez G\n4 Marcos Gómez D\n10 Diego Ruiz M'}</pre>
      <textarea className="input min-h-48 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="Pegá acá tu lista…" />
      {parsed.length > 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Se detectaron {parsed.length} jugadores: {parsed.slice(0, 4).map((p) => `${p.number ?? '–'} ${p.name} (${p.position})`).join(', ')}
          {parsed.length > 4 ? '…' : ''}
        </p>
      )}
    </Modal>
  )
}
