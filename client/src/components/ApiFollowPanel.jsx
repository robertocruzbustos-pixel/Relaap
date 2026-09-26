import { useEffect, useState } from 'react'
import { AlertTriangle, Check, RefreshCw, X, Zap } from 'lucide-react'
import { api } from '../lib/api.js'
import { EVENT_META } from '../lib/constants.js'
import { useAction } from './ui.jsx'

const INTERVALS = [
  [60, '1 min'],
  [90, '90 s'],
  [120, '2 min'],
  [180, '3 min'],
  [300, '5 min'],
]

const STATUS_TEXT = {
  NS: 'Sin comenzar', '1H': '1er tiempo', HT: 'Entretiempo', '2H': '2do tiempo', ET: 'Alargue', P: 'Penales', FT: 'Finalizado',
  AET: 'Finalizado (alargue)', PEN: 'Finalizado (penales)', LIVE: 'En juego', BT: 'Pausa', SUSP: 'Suspendido', INT: 'Interrumpido',
  PST: 'Postergado', CANC: 'Cancelado', ABD: 'Abandonado',
}

const teamName = (match, side) => (side === 'home' ? match.home_name : side === 'away' ? match.away_name : '')
const minuteText = (s) => `${s.elapsed}${s.extra ? `+${s.extra}` : ''}'`

export function describeSuggestion(s, match) {
  const who = s.player_name || teamName(match, s.side) || 'sin especificar'
  switch (s.type) {
    case 'goal':
      return `Gol de ${who}`
    case 'penalty_goal':
      return `Gol de penal de ${who}`
    case 'own_goal':
      return `Gol en contra de ${who}`
    case 'penalty_miss':
      return `Penal errado por ${who}`
    case 'yellow':
      return `Tarjeta amarilla para ${who}`
    case 'red':
      return `Tarjeta roja para ${who}${s.detail ? ` (${s.detail.toLowerCase()})` : ''}`
    case 'substitution':
      return `Cambio: ${s.player_name ?? '?'} ↔ ${s.related_player_name ?? '?'}`
    case 'var':
      return `VAR: ${s.detail || 'revisión'}`
    default:
      return EVENT_META[s.type]?.label ?? s.type
  }
}

/** "hace 12 s" que se refresca solo. */
function useAgo(iso) {
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000)
    return () => clearInterval(id)
  }, [])
  if (!iso) return null
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`
}

/**
 * Seguimiento en vivo con la API deportiva. Las novedades llegan como sugerencias que una persona confirma:
 * nada entra a la cronología sin aprobación.
 */
export default function ApiFollowPanel({ bundle, perms, apply, matchId }) {
  const { match, suggestions = [] } = bundle
  const [run, busy] = useAction()
  const [interval, setIntervalSecs] = useState(match.api_interval ?? 120)
  const [sides, setSides] = useState({}) // corrección de equipo por sugerencia (autogoles)
  const ago = useAgo(match.api_last_sync)

  const following = match.api_follow
  const hasApiScore = match.api_home_goals !== null && match.api_home_goals !== undefined
  const scoreDiffers = hasApiScore && (match.api_home_goals !== match.home_score || match.api_away_goals !== match.away_score)
  const canControl = perms.manage
  const canResolve = (s) => (s.type === 'substitution' ? perms.substitute : perms.canCreateEvent(s.type))

  // Sin nada que mostrar ni permiso para actuar: el panel no aporta.
  if (!canControl && !following && suggestions.length === 0) return null

  const post = (path, body) => run(async () => apply(await api.post(`/matches/${matchId}${path}`, body)))

  const resolve = (s, action) =>
    run(async () => {
      const body = action === 'accept' && sides[s.id] ? { side: sides[s.id] } : {}
      apply(await api.post(`/matches/${matchId}/suggestions/${s.id}/${action}`, body))
    })

  return (
    <section className="card mb-3 p-3" aria-label="Seguimiento con la API deportiva">
      <div className="flex flex-wrap items-center gap-2">
        <Zap className={`h-4 w-4 ${following ? 'text-emerald-400' : 'text-slate-500'}`} aria-hidden />
        <h3 className="text-sm font-semibold">Seguimiento con la API</h3>
        {following ? (
          <span className="badge bg-emerald-500/15 text-emerald-300">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" /> Activo · cada {Math.round(match.api_interval / 60 * 10) / 10} min
          </span>
        ) : (
          <span className="badge bg-slate-800 text-slate-400">Apagado</span>
        )}

        {canControl && (
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {!following && (
              <select
                className="input !w-auto !py-1 text-xs"
                value={interval}
                onChange={(e) => setIntervalSecs(Number(e.target.value))}
                aria-label="Frecuencia de consulta"
                title="Cada cuánto se consulta la API"
              >
                {INTERVALS.map(([secs, label]) => (
                  <option key={secs} value={secs}>cada {label} (~{Math.round(3600 / secs)}/h)</option>
                ))}
              </select>
            )}
            <button
              className={following ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
              disabled={busy}
              onClick={() => post('/follow', { enabled: !following, interval })}
            >
              {following ? 'Detener' : 'Seguir con la API'}
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={busy}
              onClick={() => post('/follow/sync')}
              title="Hace una consulta ahora (gasta 1 de tu cuota diaria)"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Consultar ahora
            </button>
          </span>
        )}
      </div>

      {match.api_last_sync && (
        <p className="mt-1.5 text-xs text-slate-400">
          API: <strong className="text-slate-200">{STATUS_TEXT[match.api_status] ?? match.api_status}</strong>
          {match.api_elapsed ? ` ${match.api_elapsed}'` : ''}
          {hasApiScore && (
            <>
              {' · '}
              <span className={scoreDiffers ? 'text-amber-300' : 'text-emerald-300'}>
                {match.api_home_goals}–{match.api_away_goals}
                {scoreDiffers ? ` (acá ${match.home_score}–${match.away_score}: revisá las sugerencias)` : ' (coincide)'}
              </span>
            </>
          )}
          {' · '}consultado {ago}
          {match.api_remaining !== null && match.api_remaining !== undefined && <> · te quedan {match.api_remaining} consultas hoy</>}
        </p>
      )}

      {match.api_error && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {match.api_error}
        </p>
      )}

      {suggestions.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {suggestions.map((s) => {
            const meta = EVENT_META[s.type] ?? EVENT_META.note
            const Icon = meta.icon
            const allowed = canResolve(s)
            const side = sides[s.id] ?? s.side
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-sm">
                <span className="w-11 shrink-0 text-right font-display font-semibold tabular-nums text-slate-300">{minuteText(s)}</span>
                <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} fill={meta.fill ? 'currentColor' : 'none'} aria-hidden />
                <span className="min-w-0 flex-1">
                  {describeSuggestion(s, match)}
                  {s.side && <span className="ml-1.5 text-xs text-slate-500">· {teamName(match, side)}</span>}
                </span>
                {s.type === 'own_goal' && allowed && (
                  <span className="flex gap-1 text-[11px]" role="group" aria-label="Equipo del jugador que convirtió en contra">
                    {['home', 'away'].map((sd) => (
                      <button
                        key={sd}
                        onClick={() => setSides((cur) => ({ ...cur, [s.id]: sd }))}
                        aria-pressed={side === sd}
                        className={`rounded px-1.5 py-0.5 ${side === sd ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-800 text-slate-300'}`}
                        title="Equipo del jugador que hizo el gol en contra"
                      >
                        {sd === 'home' ? 'Local' : 'Visita'}
                      </button>
                    ))}
                  </span>
                )}
                {allowed ? (
                  <span className="flex gap-1">
                    <button className="btn-primary btn-sm" disabled={busy} onClick={() => resolve(s, 'accept')}>
                      <Check className="h-3.5 w-3.5" /> Aceptar
                    </button>
                    <button className="btn-ghost btn-sm" disabled={busy} onClick={() => resolve(s, 'dismiss')} aria-label="Descartar sugerencia">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Lo confirma el equipo</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!following && !match.api_last_sync && canControl && (
        <p className="mt-1.5 text-xs text-slate-500">
          Activalo cuando arranque el partido: la API sugiere goles, tarjetas y cambios y vos los confirmás con un click.
          Cada consulta usa 1 de tus ~100 diarias del plan gratuito.
        </p>
      )}
    </section>
  )
}
