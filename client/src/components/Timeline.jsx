import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { EVENT_META } from '../lib/constants.js'
import { Field, Modal, useAction, useFeedback } from './ui.jsx'

/** Texto legible de un evento. */
export function describeEvent(e, match) {
  const team = e.side ? (e.side === 'home' ? match.home_name : match.away_name) : ''
  const who = e.player_name || team || 'sin especificar'
  const extra = e.description ? ` — ${e.description}` : ''
  switch (e.type) {
    case 'goal':
      return `¡Gol de ${who}!${extra}`
    case 'penalty_goal':
      return `Gol de penal de ${who}${extra}`
    case 'own_goal':
      return `Gol en contra de ${who}${extra}`
    case 'penalty_miss':
      return `Penal errado por ${who}${extra}`
    case 'yellow':
      return `Tarjeta amarilla para ${who}${extra}`
    case 'red':
      return `Tarjeta roja para ${who}${extra}`
    case 'substitution':
    case 'period':
      return e.description
    case 'note':
      return e.description || 'Nota'
    default:
      return `${EVENT_META[e.type]?.label ?? e.type}${e.player_name ? `: ${e.player_name}` : team ? ` (${team})` : ''}${extra}`
  }
}

export default function Timeline({ events, match, canEditEvent, showAuthors = false, apply, matchId, emptyText = 'Todavía no hay eventos.' }) {
  const feedback = useFeedback()
  const [editing, setEditing] = useState(null)

  const remove = async (e) => {
    const ok = await feedback.confirm({
      title: 'Eliminar evento',
      message: `${e.minute_label} · ${describeEvent(e, match)}. El marcador se recalcula.`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (!ok) return
    try {
      apply(await api.del(`/matches/${matchId}/events/${e.id}`))
    } catch (err) {
      feedback.error(err)
    }
  }

  const ordered = [...events].reverse()
  if (ordered.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>

  return (
    <>
      <ol className="space-y-1.5">
        {ordered.map((e) => {
          const meta = EVENT_META[e.type] ?? EVENT_META.note
          const Icon = meta.icon
          const color = e.side ? (e.side === 'home' ? match.home_color : match.away_color) : null
          return (
            <li key={e.id} className="group flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/50 py-2 pl-2 pr-1.5 text-sm" style={color ? { borderLeft: `3px solid ${color}` } : undefined}>
              <span className="mt-0.5 w-11 shrink-0 text-right font-display text-base font-semibold tabular-nums text-slate-300">{e.minute_label}</span>
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.color}`} fill={meta.fill ? 'currentColor' : 'none'} aria-hidden />
              <span className={`flex-1 ${e.type === 'period' ? 'italic text-slate-400' : 'text-slate-100'}`}>
                {describeEvent(e, match)}
                {showAuthors && e.type !== 'period' && e.author_name && (
                  <span className="ml-1.5 whitespace-nowrap text-[11px] text-slate-500">· {e.author_name}</span>
                )}
              </span>
              {canEditEvent?.(e) && e.type !== 'period' && (
                <span className="flex shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button className="btn-ghost btn-sm !px-1.5" onClick={() => setEditing(e)} aria-label="Editar evento">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button className="btn-ghost btn-sm !px-1.5 text-red-400" onClick={() => remove(e)} aria-label="Eliminar evento">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      {editing && <EditEventModal event={editing} matchId={matchId} apply={apply} onClose={() => setEditing(null)} />}
    </>
  )
}

function EditEventModal({ event, matchId, apply, onClose }) {
  const [run, busy] = useAction()
  const [form, setForm] = useState({
    minute_label: event.minute_label,
    player_name: event.player_name ?? '',
    description: event.description ?? '',
  })

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      apply(
        await api.patch(`/matches/${matchId}/events/${event.id}`, {
          minute_label: form.minute_label,
          player_name: form.player_name || null,
          description: form.description,
        }),
      )
      onClose()
    })
  }

  return (
    <Modal
      title={`Editar ${EVENT_META[event.type]?.label ?? 'evento'}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" form="edit-event" disabled={busy}>Guardar</button>
        </>
      }
    >
      <form id="edit-event" onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Minuto">
            <input className="input" value={form.minute_label} onChange={(e) => setForm({ ...form, minute_label: e.target.value })} maxLength={12} required />
          </Field>
          <Field label="Jugador">
            <input className="input" value={form.player_name} onChange={(e) => setForm({ ...form, player_name: e.target.value })} maxLength={100} />
          </Field>
        </div>
        <Field label="Descripción">
          <textarea className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
        </Field>
      </form>
    </Modal>
  )
}
