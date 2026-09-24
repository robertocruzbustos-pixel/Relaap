import { Link } from 'react-router-dom'
import { ChevronLeft, Wifi, WifiOff } from 'lucide-react'
import { PERIOD_LABEL } from '../lib/constants.js'
import { formatClock, formatDateTime } from '../lib/format.js'
import { useElapsed } from '../lib/useElapsed.js'
import { StatusBadge, TeamDot } from './ui.jsx'

export default function ScoreBoard({ match, serverNow, presence, connected }) {
  const elapsed = useElapsed(match, serverNow)
  const running = Boolean(match.clock_started_at)

  return (
    <header className="no-print mb-4">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <Link to="/partidos" className="flex items-center gap-1 text-slate-400 hover:text-white">
          <ChevronLeft className="h-4 w-4" /> Partidos
        </Link>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          {presence.length > 1 && (
            <span className="flex items-center gap-1.5" aria-label={`Conectados: ${presence.join(', ')}`}>
              <span className="flex -space-x-1.5">
                {presence.slice(0, 5).map((name) => (
                  <span
                    key={name}
                    title={name}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-900 bg-sky-500/25 text-[10px] font-semibold uppercase text-sky-200"
                  >
                    {name.trim()[0]}
                  </span>
                ))}
              </span>
              <span className="text-sky-300">{presence.length} conectados</span>
            </span>
          )}
          <span className={`flex items-center gap-1 ${connected ? 'text-emerald-400' : 'text-amber-400'}`} title={connected ? 'Sincronizado en tiempo real' : 'Reconectando…'}>
            {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {connected ? 'En sincronía' : 'Reconectando…'}
          </span>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3 sm:gap-6 sm:px-6">
          <TeamSide name={match.home_name} color={match.home_color} formation={match.home_formation} align="right" />
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="font-display text-5xl font-bold tabular-nums leading-none sm:text-6xl" aria-label={`Local ${match.home_score}`}>
              {match.home_score}
            </span>
            <div className="flex min-w-24 flex-col items-center">
              <span
                className={`font-display text-3xl font-semibold tabular-nums leading-none sm:text-4xl ${running ? 'text-amber-300' : 'text-slate-300'}`}
                aria-label="Reloj del partido"
              >
                {formatClock(elapsed)}
              </span>
              <span className="mt-1 text-[11px] uppercase tracking-wider text-slate-400">{PERIOD_LABEL[match.period]}</span>
            </div>
            <span className="font-display text-5xl font-bold tabular-nums leading-none sm:text-6xl" aria-label={`Visitante ${match.away_score}`}>
              {match.away_score}
            </span>
          </div>
          <TeamSide name={match.away_name} color={match.away_color} formation={match.away_formation} align="left" />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-slate-800 bg-slate-950/50 px-3 py-1.5 text-xs text-slate-400">
          <StatusBadge status={match.status} />
          {match.competition && <span>{match.competition}</span>}
          {match.venue && <span>· {match.venue}</span>}
          {match.kickoff_at && <span>· {formatDateTime(match.kickoff_at)}</span>}
        </div>
      </div>
    </header>
  )
}

function TeamSide({ name, color, formation, align }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === 'right' ? 'flex-row-reverse text-right' : 'text-left'}`}>
      <TeamDot color={color} className="!h-4 !w-4" />
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-semibold tracking-wide sm:text-2xl">{name}</p>
        <p className="text-xs text-slate-500">{formation}</p>
      </div>
    </div>
  )
}
