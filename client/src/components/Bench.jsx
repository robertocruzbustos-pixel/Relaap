import { TeamDot } from './ui.jsx'

/** Suplentes de ambos equipos. Un click en uno abre el cambio con ese jugador ya elegido. */
export default function Bench({ match, players, canEdit, onPick }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {[
        ['home', match.home_name, match.home_color],
        ['away', match.away_name, match.away_color],
      ].map(([side, name, color]) => {
        const bench = players.filter((p) => p.side === side && !p.on_pitch)
        return (
          <section key={side} className="card p-3" aria-label={`Banco de ${name}`}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <TeamDot color={color} /> Banco · {name}
            </h3>
            {bench.length === 0 ? (
              <p className="text-xs text-slate-500">Sin suplentes disponibles.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {bench.map((p) => (
                  <button
                    key={p.id}
                    disabled={!canEdit || p.red}
                    onClick={() => onPick({ side, inId: p.id })}
                    title={p.red ? 'Expulsado' : canEdit ? 'Hacer ingresar' : p.name}
                    className={`flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs hover:border-emerald-500/60 disabled:cursor-default disabled:hover:border-slate-700 ${p.red ? 'line-through opacity-50' : ''}`}
                  >
                    <span className="font-display text-sm font-semibold text-slate-300">{p.number ?? '–'}</span>
                    <span className="max-w-24 truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
