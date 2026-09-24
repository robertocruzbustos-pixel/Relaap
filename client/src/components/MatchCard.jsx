import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, Users } from 'lucide-react'
import { ROLE_LABEL } from '../lib/constants.js'
import { formatDateTime } from '../lib/format.js'
import { StatusBadge, TeamDot } from './ui.jsx'

export default function MatchCard({ match }) {
  const played = match.status !== 'scheduled'
  return (
    <Link
      to={`/partidos/${match.id}`}
      className="card group block p-4 transition-colors hover:border-emerald-500/50 hover:bg-slate-900"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-slate-400">
          {match.competition || 'Partido amistoso'}
        </span>
        <StatusBadge status={match.status} />
      </div>

      <div className="space-y-2">
        {['home', 'away'].map((side) => (
          <div key={side} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <TeamDot color={match[`${side}_color`]} />
              <span className="truncate font-semibold text-white">{match[`${side}_name`]}</span>
            </span>
            {played && <span className="font-display text-2xl font-bold tabular-nums text-white">{match[`${side}_score`]}</span>}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" /> {formatDateTime(match.kickoff_at)}
        </span>
        {match.venue && (
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-3.5 w-3.5" /> {match.venue}
          </span>
        )}
        {match.role !== 'owner' && (
          <span className="flex items-center gap-1 text-sky-300">
            <Users className="h-3.5 w-3.5" /> de {match.owner_name} · {ROLE_LABEL[match.role]}
          </span>
        )}
      </div>
    </Link>
  )
}
