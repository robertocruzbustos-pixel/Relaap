import { EVENT_META } from './constants.js'
import { formatDate } from './format.js'

const sideName = (match, side) => (side === 'home' ? match.home_name : match.away_name)

/** Cuenta eventos por tipo y equipo: { corner: {home: 3, away: 1}, ... } */
export function countEvents(events) {
  const counts = {}
  for (const e of events) {
    if (!e.side) continue
    counts[e.type] ??= { home: 0, away: 0 }
    counts[e.type][e.side] += 1
  }
  return counts
}

/** Texto de resumen del partido, listo para editar/compartir. */
export function buildSummary({ match, events }) {
  const lines = []
  lines.push(`${match.home_name} ${match.home_score} - ${match.away_score} ${match.away_name}`)
  const meta = [match.competition, match.venue, match.kickoff_at ? formatDate(match.kickoff_at) : null].filter(Boolean)
  if (meta.length) lines.push(meta.join(' · '))

  const section = (title, rows) => {
    if (rows.length === 0) return
    lines.push('', title, ...rows)
  }

  section(
    'Goles',
    events
      .filter((e) => ['goal', 'penalty_goal', 'own_goal'].includes(e.type))
      .map((e) => {
        const tag = e.type === 'penalty_goal' ? ' (penal)' : e.type === 'own_goal' ? ' (en contra)' : ''
        const scorer = e.player_name || 'Sin especificar'
        return `${e.minute_label} ${scorer}${tag} — ${sideName(match, e.side)}`
      }),
  )

  section(
    'Tarjetas',
    events
      .filter((e) => e.type === 'yellow' || e.type === 'red')
      .map((e) => `${e.minute_label} ${EVENT_META[e.type].label}: ${e.player_name || 'Sin especificar'} — ${sideName(match, e.side)}`),
  )

  section(
    'Cambios',
    events
      .filter((e) => e.type === 'substitution')
      .map((e) => `${e.minute_label} ${sideName(match, e.side)}: entra ${e.player_name}, sale ${e.related_player_name}`),
  )

  const counts = countEvents(events)
  const stat = (type, label) =>
    counts[type] ? `${label} ${counts[type].home}-${counts[type].away}` : null
  const stats = [stat('corner', 'Córners'), stat('chance', 'Ocasiones'), stat('save', 'Atajadas'), stat('foul', 'Faltas'), stat('offside', 'Offsides')]
    .filter(Boolean)
  if (stats.length) lines.push('', `Estadísticas (${match.home_name}-${match.away_name}): ${stats.join(' · ')}`)

  const notes = events.filter((e) => e.type === 'note' || e.type === 'var' || e.type === 'injury')
  section('Otros hechos', notes.map((e) => `${e.minute_label} ${EVENT_META[e.type].label}: ${e.description || e.player_name || ''}`.trim()))

  return lines.join('\n')
}
