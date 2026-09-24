import { useMemo, useState } from 'react'
import { ArrowLeftRight } from 'lucide-react'
import { api } from '../lib/api.js'
import { Field, Modal, useAction } from './ui.jsx'

const label = (p) => `${p.number ?? '–'} · ${p.name}`

export default function SubstitutionModal({ match, players, matchId, apply, initial = {}, onClose }) {
  const [run, busy] = useAction()
  const [side, setSide] = useState(initial.side ?? 'home')
  const [outId, setOutId] = useState(initial.outId ?? '')
  const [inId, setInId] = useState(initial.inId ?? '')

  const sidePlayers = useMemo(() => players.filter((p) => p.side === side), [players, side])
  const onPitch = sidePlayers.filter((p) => p.on_pitch)
  const bench = sidePlayers.filter((p) => !p.on_pitch && !p.red)

  const changeSide = (s) => {
    setSide(s)
    setOutId('')
    setInId('')
  }

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      apply(await api.post(`/matches/${matchId}/substitution`, { out_id: Number(outId), in_id: Number(inId) }))
      onClose()
    })
  }

  return (
    <Modal
      title="Cambio"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" form="sub-form" disabled={busy || !outId || !inId}>
            <ArrowLeftRight className="h-4 w-4" /> Registrar cambio
          </button>
        </>
      }
    >
      <form id="sub-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Equipo">
          {[
            ['home', match.home_name, match.home_color],
            ['away', match.away_name, match.away_color],
          ].map(([s, name, color]) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => changeSide(s)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                side === s ? 'border-emerald-400 bg-emerald-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} /> <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
        <Field label="Sale (en cancha)">
          <select className="input" value={outId} onChange={(e) => setOutId(e.target.value)} required>
            <option value="">Elegí jugador…</option>
            {onPitch.map((p) => (
              <option key={p.id} value={p.id}>{label(p)}</option>
            ))}
          </select>
        </Field>
        <Field label="Entra (banco)" hint={bench.length === 0 ? 'No hay suplentes cargados para este equipo. Sumalos desde la previa.' : undefined}>
          <select className="input" value={inId} onChange={(e) => setInId(e.target.value)} required>
            <option value="">Elegí jugador…</option>
            {bench.map((p) => (
              <option key={p.id} value={p.id}>{label(p)}</option>
            ))}
          </select>
        </Field>
      </form>
    </Modal>
  )
}
