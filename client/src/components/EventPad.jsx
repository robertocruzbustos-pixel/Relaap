import { useState } from 'react'
import { X } from 'lucide-react'
import { EVENT_META, NEEDS_SIDE, PAD_TYPES } from '../lib/constants.js'
import { useFeedback } from './ui.jsx'

/**
 * Botonera para cargar eventos con un click.
 * Si hay un jugador seleccionado en la cancha, el evento se le asigna automáticamente.
 */
export default function EventPad({ match, players, selected, onClearSelected, onRegister, onSubstitute, disabled }) {
  const feedback = useFeedback()
  const [side, setSide] = useState(null)
  const [playerId, setPlayerId] = useState('')
  const [description, setDescription] = useState('')

  const activeSide = selected?.side ?? side
  const onPitch = players
    .filter((p) => p.on_pitch && p.side === activeSide)
    .sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
  const chosenId = selected?.id ?? (playerId ? Number(playerId) : null)

  const fire = async (type) => {
    if (type === 'substitution') return onSubstitute({ side: activeSide ?? 'home', outId: chosenId ?? '' })
    if (NEEDS_SIDE.includes(type) && !activeSide) return feedback.error('Elegí el equipo (o tocá al jugador en la cancha).')
    const ok = await onRegister({ type, side: activeSide, match_player_id: chosenId, description: description.trim() || undefined })
    if (ok) {
      setDescription('')
      setPlayerId('')
      onClearSelected()
      if (NEEDS_SIDE.includes(type)) setSide(null)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="label">Equipo</span>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Equipo del evento">
          {[
            ['home', match.home_name, match.home_color],
            ['away', match.away_name, match.away_color],
          ].map(([s, name, color]) => (
            <button
              key={s}
              type="button"
              disabled={Boolean(selected)}
              aria-pressed={activeSide === s}
              onClick={() => {
                setSide(side === s ? null : s)
                setPlayerId('')
              }}
              className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${
                activeSide === s ? 'border-emerald-400 bg-emerald-500/10 text-white' : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="label">Jugador</span>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border border-yellow-300/50 bg-yellow-300/10 px-3 py-1.5 text-sm">
            <span className="truncate">
              <strong>#{selected.number ?? '–'}</strong> {selected.name}
            </span>
            <button onClick={onClearSelected} aria-label="Deseleccionar jugador" className="text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <select className="input" value={playerId} onChange={(e) => setPlayerId(e.target.value)} disabled={!activeSide} aria-label="Jugador">
            <option value="">{activeSide ? 'Sin especificar' : 'Elegí un equipo o tocá un jugador'}</option>
            {onPitch.map((p) => (
              <option key={p.id} value={p.id}>{p.number ?? '–'} · {p.name}</option>
            ))}
          </select>
        )}
      </div>

      <input
        className="input"
        placeholder="Detalle opcional (ej. de cabeza, desde afuera)…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={500}
        aria-label="Detalle del evento"
      />

      <div className="grid grid-cols-3 gap-1.5">
        {PAD_TYPES.map((type) => {
          const meta = EVENT_META[type]
          const Icon = meta.icon
          const big = type === 'goal'
          return (
            <button
              key={type}
              onClick={() => fire(type)}
              disabled={disabled}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                big
                  ? 'col-span-3 flex-row gap-2 border-emerald-500/60 bg-emerald-500/15 py-3 text-base text-emerald-200 hover:bg-emerald-500/25'
                  : 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500 hover:bg-slate-800'
              }`}
            >
              <Icon className={`${big ? 'h-5 w-5' : 'h-4 w-4'} ${meta.color}`} fill={meta.fill ? 'currentColor' : 'none'} aria-hidden />
              {meta.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
