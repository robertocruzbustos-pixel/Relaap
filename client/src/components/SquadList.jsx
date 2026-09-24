import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { POSITIONS } from '../lib/constants.js'
import { TeamDot } from './ui.jsx'

/** Buscador de fichas de ambos planteles ("el 9 del visitante", "el capitán"…). */
export default function SquadList({ match, players, selectedId, onSelect }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) => `${p.number ?? ''} ${p.name} ${p.notes}`.toLowerCase().includes(q))
  }, [players, search])

  return (
    <div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <input className="input pl-9" placeholder="Número, nombre o dato…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar jugador" />
      </div>
      <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
        {[
          ['home', match.home_name, match.home_color],
          ['away', match.away_name, match.away_color],
        ].map(([side, name, color]) => {
          const list = filtered.filter((p) => p.side === side)
          if (list.length === 0) return null
          return (
            <section key={side}>
              <h3 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <TeamDot color={color} /> {name}
              </h3>
              <ul className="space-y-1">
                {list.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => onSelect(p.id)}
                      aria-pressed={selectedId === p.id}
                      className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-sm ${
                        selectedId === p.id ? 'border-yellow-300/60 bg-yellow-300/10' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'
                      }`}
                    >
                      <span className="w-6 shrink-0 text-right font-display text-base font-semibold text-slate-300">{p.number ?? '–'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {p.name} <span className="text-xs font-normal text-slate-500">· {POSITIONS[p.position]}</span>
                        </span>
                        {p.notes && <span className="line-clamp-2 text-xs text-slate-400">{p.notes}</span>}
                      </span>
                      {!p.on_pitch && <span className="badge shrink-0 bg-slate-800 text-slate-400">banco</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {filtered.length === 0 && <p className="py-6 text-center text-sm text-slate-500">No se encontró ningún jugador.</p>}
      </div>
    </div>
  )
}
