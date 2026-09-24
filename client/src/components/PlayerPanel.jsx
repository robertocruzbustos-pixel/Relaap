import { useEffect, useState } from 'react'
import { ArrowLeftRight, LogIn, LogOut, X } from 'lucide-react'
import { POSITIONS } from '../lib/constants.js'
import { textOn } from '../lib/format.js'
import { useFeedback } from './ui.jsx'

/** Ficha del jugador seleccionado: datos para el relato, tarjetas y acciones rápidas. */
export default function PlayerPanel({ player, match, canEdit, updatePlayer, onClose, onSubstitute }) {
  const feedback = useFeedback()
  const [notes, setNotes] = useState(player.notes)
  const color = player.side === 'home' ? match.home_color : match.away_color

  useEffect(() => {
    setNotes(player.notes)
  }, [player.id, player.notes])

  const patch = (body) => updatePlayer(player.id, body).catch((err) => feedback.error(err))

  const saveNotes = () => {
    if (notes !== player.notes) patch({ notes })
  }

  return (
    <div className="card mb-3 p-3">
      <div className="mb-2 flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/80 font-display text-xl font-bold"
          style={{ backgroundColor: color, color: textOn(color) }}
        >
          {player.number ?? '·'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{player.name}</p>
          <p className="text-xs text-slate-400">
            {POSITIONS[player.position]} · {player.side === 'home' ? match.home_name : match.away_name}
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {player.goals > 0 && <span className="badge bg-emerald-500/15 text-emerald-300">⚽ {player.goals}</span>}
            {player.yellows > 0 && <span className="badge bg-yellow-400/15 text-yellow-300">Amarilla{player.yellows > 1 ? ` ×${player.yellows}` : ''}</span>}
            {player.red && <span className="badge bg-red-500/15 text-red-300">Expulsado</span>}
            {!player.on_pitch && <span className="badge bg-slate-700/60 text-slate-300">Fuera de cancha</span>}
          </p>
        </div>
        <button className="btn-ghost btn-sm !px-1.5" onClick={onClose} aria-label="Cerrar ficha">
          <X className="h-4 w-4" />
        </button>
      </div>

      <textarea
        className="input min-h-20 text-sm"
        placeholder="Datos para el relato: edad, récord, curiosidades…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
        readOnly={!canEdit}
        aria-label={`Notas de ${player.name}`}
      />

      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {player.on_pitch && (
            <button className="btn-secondary btn-sm" onClick={() => onSubstitute({ side: player.side, outId: player.id })}>
              <ArrowLeftRight className="h-3.5 w-3.5" /> Sustituir
            </button>
          )}
          {player.on_pitch ? (
            <button className="btn-ghost btn-sm" onClick={() => patch({ on_pitch: false, x: null, y: null })}>
              <LogOut className="h-3.5 w-3.5" /> Sacar de cancha
            </button>
          ) : (
            <button className="btn-ghost btn-sm" onClick={() => patch({ on_pitch: true, x: player.side === 'home' ? 35 : 65, y: 50 })}>
              <LogIn className="h-3.5 w-3.5" /> Poner en cancha
            </button>
          )}
        </div>
      )}
    </div>
  )
}
