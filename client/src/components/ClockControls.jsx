import { useState } from 'react'
import { Flag, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { api } from '../lib/api.js'
import { PERIOD_LABEL } from '../lib/constants.js'
import { formatClock } from '../lib/format.js'
import { Field, Modal, useAction, useFeedback } from './ui.jsx'

const PERIOD_OPTIONS = ['1T', 'ENT', '2T', 'ET1', 'ET2', 'FIN']

export default function ClockControls({ match, elapsed, matchId, apply }) {
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [adjusting, setAdjusting] = useState(false)

  const running = Boolean(match.clock_started_at)
  const post = (body) => run(async () => apply(await api.post(`/matches/${matchId}/clock`, body)))

  let primary = null
  if (match.status !== 'finished') {
    if (match.period === 'PRE') primary = { label: 'Comenzar partido', icon: Play, body: { action: 'start' } }
    else if (match.period === 'ENT') primary = { label: 'Comenzar 2º tiempo', icon: Play, body: { action: 'start' } }
    else if (running) primary = { label: 'Pausar', icon: Pause, body: { action: 'pause' }, tone: 'amber' }
    else primary = { label: 'Reanudar', icon: Play, body: { action: 'start' } }
  }

  let closing = null
  if (match.period === '1T') closing = { label: 'Fin del 1er tiempo', body: { action: 'period', period: 'ENT' } }
  else if (['2T', 'ET1', 'ET2'].includes(match.period)) closing = { label: 'Finalizar partido', body: { action: 'period', period: 'FIN' } }

  const reset = async () => {
    const ok = await feedback.confirm({
      title: 'Reiniciar partido',
      message: 'El reloj vuelve a 00:00 y se borran los cambios de período. Los goles y eventos se conservan.',
      confirmLabel: 'Reiniciar',
      danger: true,
    })
    if (ok) post({ action: 'reset' })
  }

  return (
    <div className="card mb-3 flex flex-wrap items-center gap-2 p-2.5">
      {primary && (
        <button className={primary.tone === 'amber' ? 'btn bg-amber-500 text-amber-950 hover:bg-amber-400' : 'btn-primary'} onClick={() => post(primary.body)} disabled={busy}>
          <primary.icon className="h-4 w-4" /> {primary.label}
        </button>
      )}
      {closing && (
        <button className="btn-secondary" onClick={() => post(closing.body)} disabled={busy}>
          <Flag className="h-4 w-4" /> {closing.label}
        </button>
      )}
      {match.status === 'finished' && <span className="px-2 text-sm font-medium text-slate-300">Partido finalizado</span>}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <label className="sr-only" htmlFor="period-select">Cambiar período</label>
        <select
          id="period-select"
          className="input !w-auto !py-1.5 text-xs"
          value=""
          onChange={(e) => e.target.value && post({ action: 'period', period: e.target.value })}
          disabled={busy}
        >
          <option value="">Ir a período…</option>
          {PERIOD_OPTIONS.map((p) => (
            <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
          ))}
        </select>
        <button className="btn-ghost btn-sm" onClick={() => setAdjusting(true)}>
          <SlidersHorizontal className="h-4 w-4" /> Ajustar reloj
        </button>
        <button className="btn-ghost btn-sm text-red-400" onClick={reset}>
          <RotateCcw className="h-4 w-4" /> Reiniciar
        </button>
      </div>

      {adjusting && <AdjustModal elapsed={elapsed} onClose={() => setAdjusting(false)} onSave={(seconds) => post({ action: 'set', seconds })} />}
    </div>
  )
}

function AdjustModal({ elapsed, onClose, onSave }) {
  const [value, setValue] = useState(formatClock(elapsed))
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim())

  return (
    <Modal
      title="Ajustar reloj"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary"
            disabled={!match}
            onClick={() => {
              onSave(Number(match[1]) * 60 + Number(match[2]))
              onClose()
            }}
          >
            Aplicar
          </button>
        </>
      }
    >
      <Field label="Tiempo (mm:ss)" hint="Sirve para corregir el reloj si arrancó tarde o se pausó de más. El reloj sigue corriendo desde ahí.">
        <input className="input font-mono text-lg" value={value} onChange={(e) => setValue(e.target.value)} placeholder="45:00" inputMode="numeric" />
      </Field>
    </Modal>
  )
}
