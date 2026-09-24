import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ListOrdered, Plus, Sparkles, Trash2 } from 'lucide-react'
import { api } from '../../lib/api.js'
import { FORMATIONS, POSITION_ORDER } from '../../lib/constants.js'
import { formatDate, fromLocalInput, parseRoster, toLocalInput } from '../../lib/format.js'
import { Field, Modal, Spinner, TeamDot, useAction, useFeedback } from '../../components/ui.jsx'

export default function PrematchTab({ ctx }) {
  const { bundle, canEdit } = ctx
  const { match } = bundle

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <InfoForm ctx={ctx} />
        <NotesEditor ctx={ctx} />
        {(match.external_id || (match.home_ext_id && match.away_ext_id)) && <ApiExtras match={match} canEdit={canEdit} />}
      </div>
      <div className="space-y-4">
        <LineupEditor ctx={ctx} side="home" />
        <LineupEditor ctx={ctx} side="away" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function InfoForm({ ctx }) {
  const { bundle, canEdit, apply, matchId } = ctx
  const { match } = bundle
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const initial = useMemo(
    () => ({
      home_name: match.home_name,
      away_name: match.away_name,
      home_color: match.home_color,
      away_color: match.away_color,
      competition: match.competition,
      venue: match.venue,
      kickoff: toLocalInput(match.kickoff_at),
    }),
    [match],
  )
  const [form, setForm] = useState(initial)
  useEffect(() => setForm(initial), [initial])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      const { kickoff, ...rest } = form
      apply(await api.patch(`/matches/${matchId}`, { ...rest, kickoff_at: fromLocalInput(kickoff) }))
      feedback.success('Datos del partido guardados')
    })
  }

  return (
    <form onSubmit={submit} className="card p-4">
      <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Datos del partido</h2>
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Local"><input className="input" value={form.home_name} onChange={set('home_name')} required /></Field>
          <Field label="Color"><input className="input h-10 w-12 cursor-pointer p-1" type="color" value={form.home_color} onChange={set('home_color')} /></Field>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Visitante"><input className="input" value={form.away_name} onChange={set('away_name')} required /></Field>
          <Field label="Color"><input className="input h-10 w-12 cursor-pointer p-1" type="color" value={form.away_color} onChange={set('away_color')} /></Field>
        </div>
        <Field label="Torneo"><input className="input" value={form.competition} onChange={set('competition')} /></Field>
        <Field label="Sede"><input className="input" value={form.venue} onChange={set('venue')} /></Field>
        <Field label="Fecha y hora" className="sm:col-span-2"><input className="input" type="datetime-local" value={form.kickoff} onChange={set('kickoff')} /></Field>
      </fieldset>
      {canEdit && (
        <button className="btn-primary mt-3" disabled={busy || !dirty}>Guardar datos</button>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------

function NotesEditor({ ctx }) {
  const { bundle, canEdit, matchId } = ctx
  const [text, setText] = useState(bundle.match.prematch_notes)
  const [state, setState] = useState('idle') // idle | saving | saved
  const lastSaved = useRef(bundle.match.prematch_notes)
  const feedback = useFeedback()

  // Si otro dispositivo edita las notas y acá no hay cambios pendientes, se actualiza.
  useEffect(() => {
    if (text === lastSaved.current) {
      setText(bundle.match.prematch_notes)
      lastSaved.current = bundle.match.prematch_notes
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.match.prematch_notes])

  useEffect(() => {
    if (!canEdit || text === lastSaved.current) return undefined
    setState('saving')
    const t = setTimeout(async () => {
      try {
        await api.patch(`/matches/${matchId}`, { prematch_notes: text })
        lastSaved.current = text
        setState('saved')
      } catch (err) {
        feedback.error(err)
        setState('idle')
      }
    }, 900)
    return () => clearTimeout(t)
  }, [text, canEdit, matchId, feedback])

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold tracking-wide">Notas de la previa</h2>
        <span className="flex items-center gap-1 text-xs text-slate-500" aria-live="polite">
          {state === 'saving' && <><Spinner className="h-3 w-3" /> Guardando…</>}
          {state === 'saved' && <><Check className="h-3 w-3 text-emerald-400" /> Guardado</>}
        </span>
      </div>
      <textarea
        className="input min-h-56"
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={!canEdit}
        placeholder="Datos de la previa: rachas, lesionados, historial, curiosidades, temas para el aire…"
        aria-label="Notas de la previa"
      />
    </section>
  )
}

// ---------------------------------------------------------------------------

function LineupEditor({ ctx, side }) {
  const { bundle, canEdit, apply, matchId, updatePlayer } = ctx
  const { match } = bundle
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const players = useMemo(() => bundle.players.filter((p) => p.side === side), [bundle.players, side])
  const serverStarters = useMemo(() => players.filter((p) => p.is_starter).map((p) => p.id), [players])
  const serverFormation = match[`${side}_formation`]

  const [starters, setStarters] = useState(() => new Set(serverStarters))
  const [formation, setFormation] = useState(serverFormation)
  const [showBulk, setShowBulk] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const startersKey = serverStarters.join(',')
  useEffect(() => setStarters(new Set(serverStarters)), [startersKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setFormation(serverFormation), [serverFormation])

  const name = match[`${side}_name`]
  const color = match[`${side}_color`]
  const dirty = formation !== serverFormation || [...starters].sort().join() !== [...serverStarters].sort().join()

  const toggle = (id) =>
    setStarters((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const save = (auto) =>
    run(async () => {
      const body = { side, formation }
      if (!auto && starters.size === 11) body.starter_ids = [...starters]
      apply(await api.post(`/matches/${matchId}/lineup`, body))
      feedback.success(auto ? 'Titulares elegidos según la formación' : 'Alineación guardada')
    })

  const patchPlayer = (p, fields) => updatePlayer(p.id, fields).catch((err) => feedback.error(err))
  const remove = async (p) => {
    if (!(await feedback.confirm({ title: 'Quitar jugador', message: `¿Sacar a ${p.name} de este partido?`, confirmLabel: 'Quitar', danger: true }))) return
    run(async () => apply(await api.del(`/matches/${matchId}/players/${p.id}`)))
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-wide">
          <TeamDot color={color} /> {name}
        </h2>
        <span className={`badge ${starters.size === 11 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{starters.size}/11 titulares</span>
        <select className="input !w-auto !py-1 text-sm" value={formation} onChange={(e) => setFormation(e.target.value)} disabled={!canEdit} aria-label={`Formación de ${name}`}>
          {[...new Set([formation, ...FORMATIONS])].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        {canEdit && (
          <span className="ml-auto flex flex-wrap gap-1.5">
            <button className="btn-secondary btn-sm" onClick={() => save(true)} disabled={busy || players.length === 0} title="Elige 11 titulares según posiciones y formación">
              <Sparkles className="h-3.5 w-3.5" /> Auto
            </button>
            <button className="btn-primary btn-sm" onClick={() => save(false)} disabled={busy || !dirty || starters.size !== 11}>
              Guardar
            </button>
          </span>
        )}
      </div>

      {players.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-700 p-4 text-center text-sm text-slate-400">
          Este equipo no tiene jugadores en el partido. Agregalos abajo{canEdit ? ' o pegá la lista completa con “Carga rápida”' : ''}.
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {players.map((p) => (
            <li key={p.id} className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-500"
                  checked={starters.has(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={!canEdit}
                  aria-label={`${p.name} titular`}
                />
                <NumberInput player={p} disabled={!canEdit} onCommit={(number) => patchPlayer(p, { number })} />
                <TextInput value={p.name} disabled={!canEdit} onCommit={(v) => v && patchPlayer(p, { name: v })} label="Nombre" className="min-w-0 flex-1" />
                <select
                  className="input !w-auto !px-1.5 !py-1 text-xs"
                  value={p.position}
                  disabled={!canEdit}
                  onChange={(e) => patchPlayer(p, { position: e.target.value })}
                  aria-label="Posición"
                >
                  {POSITION_ORDER.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <button className="btn-ghost btn-sm !px-1.5 text-xs" onClick={() => setExpanded(expanded === p.id ? null : p.id)} aria-expanded={expanded === p.id}>
                  {p.notes ? '📝' : 'Nota'}
                </button>
                {canEdit && (
                  <button className="btn-ghost btn-sm !px-1.5 text-red-400" onClick={() => remove(p)} aria-label={`Quitar a ${p.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {expanded === p.id && (
                <textarea
                  className="input mt-1.5 min-h-16 text-sm"
                  defaultValue={p.notes}
                  readOnly={!canEdit}
                  placeholder={`Datos de ${p.name} para el relato…`}
                  onBlur={(e) => e.target.value !== p.notes && patchPlayer(p, { notes: e.target.value })}
                  aria-label={`Notas de ${p.name}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          <QuickAdd side={side} matchId={matchId} apply={apply} />
          <button className="btn-ghost btn-sm mt-2" onClick={() => setShowBulk(true)}>
            <ListOrdered className="h-4 w-4" /> Carga rápida de plantel
          </button>
        </>
      )}
      {showBulk && <BulkModal side={side} name={name} matchId={matchId} apply={apply} onClose={() => setShowBulk(false)} />}
    </section>
  )
}

function NumberInput({ player, disabled, onCommit }) {
  const [v, setV] = useState(player.number ?? '')
  useEffect(() => setV(player.number ?? ''), [player.number])
  return (
    <input
      className="input !w-14 !px-1 text-center font-display text-base"
      type="number"
      min="0"
      max="99"
      value={v}
      disabled={disabled}
      aria-label="Número"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const n = v === '' ? null : Number(v)
        if (n !== player.number) onCommit(n)
      }}
    />
  )
}

function TextInput({ value, onCommit, label, className = '', disabled }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      className={`input !py-1 text-sm ${className}`}
      value={v}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = v.trim()
        if (t !== value) onCommit(t)
        if (!t) setV(value)
      }}
    />
  )
}

function QuickAdd({ side, matchId, apply }) {
  const [run, busy] = useAction()
  const [p, setP] = useState({ number: '', name: '', position: 'M' })
  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      apply(
        await api.post(`/matches/${matchId}/players`, {
          side,
          players: [{ name: p.name, number: p.number === '' ? null : Number(p.number), position: p.position }],
        }),
      )
      setP({ number: '', name: '', position: p.position })
    })
  }
  return (
    <form onSubmit={submit} className="mt-3 flex items-center gap-2">
      <input className="input !w-14 !px-1 text-center" type="number" min="0" max="99" placeholder="N°" value={p.number} onChange={(e) => setP({ ...p, number: e.target.value })} aria-label="Número del nuevo jugador" />
      <input className="input min-w-0 flex-1" placeholder="Agregar jugador…" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required aria-label="Nombre del nuevo jugador" />
      <select className="input !w-auto !px-1.5" value={p.position} onChange={(e) => setP({ ...p, position: e.target.value })} aria-label="Posición del nuevo jugador">
        {POSITION_ORDER.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <button className="btn-secondary px-2.5" disabled={busy} aria-label="Agregar jugador">
        <Plus className="h-4 w-4" />
      </button>
    </form>
  )
}

function BulkModal({ side, name, matchId, apply, onClose }) {
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [text, setText] = useState('')
  const parsed = parseRoster(text)

  return (
    <Modal
      title={`Carga rápida · ${name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            disabled={busy || parsed.length === 0}
            onClick={() =>
              run(async () => {
                apply(await api.post(`/matches/${matchId}/players`, { side, players: parsed }))
                feedback.success(`${parsed.length} jugadores agregados`)
                onClose()
              })
            }
          >
            Agregar {parsed.length || ''}
          </button>
        </>
      }
    >
      <p className="mb-2 text-sm text-slate-400">
        Un jugador por línea: <code className="rounded bg-slate-800 px-1">número nombre posición</code> (G, D, M o F).
      </p>
      <pre className="mb-3 rounded-lg bg-slate-950 p-3 text-xs text-slate-300">{'1 Juan Pérez G\n4 Marcos Gómez D\n10 Diego Ruiz M'}</pre>
      <textarea className="input min-h-48 font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder="Pegá acá la lista…" />
      {parsed.length > 0 && <p className="mt-2 text-xs text-slate-400">Se detectaron {parsed.length} jugadores.</p>}
    </Modal>
  )
}

// ---------------------------------------------------------------------------

function ApiExtras({ match, canEdit }) {
  const [h2h, setH2h] = useState(null)
  const [table, setTable] = useState(null)
  const [error, setError] = useState('')
  const [run, busy] = useAction()

  if (!canEdit && !match.home_ext_id) return null

  const loadH2h = () =>
    run(async () => {
      setError('')
      try {
        const d = await api.get(`/sports/h2h?home=${match.home_ext_id}&away=${match.away_ext_id}`)
        setH2h(d.fixtures)
      } catch (err) {
        setError(err.message)
      }
    })

  const loadTable = () =>
    run(async () => {
      setError('')
      try {
        const d = await api.get(`/sports/standings?league=${match.league_ext_id}&season=${match.season}`)
        setTable(d.standings[0]?.groups ?? [])
      } catch (err) {
        setError(err.message)
      }
    })

  return (
    <section className="card p-4">
      <h2 className="mb-1 font-display text-xl font-semibold tracking-wide">Datos de la API</h2>
      <p className="mb-3 text-xs text-slate-500">Cada consulta usa cuota de tu API key; los resultados se guardan en caché un rato.</p>
      <div className="flex flex-wrap gap-2">
        {match.home_ext_id && match.away_ext_id && (
          <button className="btn-secondary btn-sm" onClick={loadH2h} disabled={busy}>Últimos enfrentamientos</button>
        )}
        {match.league_ext_id && match.season && (
          <button className="btn-secondary btn-sm" onClick={loadTable} disabled={busy}>Tabla de posiciones</button>
        )}
        {busy && <Spinner className="h-5 w-5" />}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}

      {h2h && (
        <div className="mt-4">
          <h3 className="label">Historial directo</h3>
          {h2h.length === 0 ? (
            <p className="text-sm text-slate-500">No hay enfrentamientos previos registrados.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {h2h.map((f) => (
                <li key={f.external_id} className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/50 px-2.5 py-1.5">
                  <span className="text-xs text-slate-500">{formatDate(f.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-right">{f.home.name}</span>
                  <span className="font-display text-base font-semibold tabular-nums">{f.goals?.home ?? '-'} – {f.goals?.away ?? '-'}</span>
                  <span className="min-w-0 flex-1 truncate">{f.away.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {table?.map((group, i) => (
        <div key={i} className="mt-4 overflow-x-auto">
          <h3 className="label">{group[0]?.group ?? 'Posiciones'}</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-2 text-left">#</th>
                <th className="text-left">Equipo</th>
                <th>PJ</th><th>G</th><th>E</th><th>P</th><th>DG</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {group.map((r) => {
                const mine = r.team.external_id === match.home_ext_id || r.team.external_id === match.away_ext_id
                return (
                  <tr key={r.team.external_id} className={`border-t border-slate-800 text-center ${mine ? 'bg-emerald-500/10 font-medium' : ''}`}>
                    <td className="py-1 pr-2 text-left text-slate-400">{r.rank}</td>
                    <td className="text-left">{r.team.name}</td>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td><td>{r.goal_diff}</td>
                    <td className="font-semibold">{r.points}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
