// Traducción de los eventos de API-Football a eventos de Relator Pro (lógica pura, sin base de datos).

export const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO', 'PST']
export const WAITING_STATUSES = ['NS', 'TBD', 'HT']

/** El período que corresponde a un minuto de juego (el tiempo agregado pertenece al período que cierra). */
export function periodForMinute(minute) {
  if (minute <= 45) return '1T'
  if (minute <= 90) return '2T'
  if (minute <= 105) return 'ET1'
  return 'ET2'
}

const strip = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Coincidencia tolerante de nombres: "L. Messi" ~ "Lionel Messi", "Pérez" ~ "Juan Perez". */
export function namesMatch(a, b) {
  const x = strip(a)
  const y = strip(b)
  if (!x || !y) return false
  if (x === y) return true
  const lastX = x.split(' ').at(-1)
  const lastY = y.split(' ').at(-1)
  return lastX.length >= 4 && lastX === lastY
}

/**
 * Convierte un evento de la API en un borrador de sugerencia, o null si no nos interesa.
 * ctx: { homeExtId, awayExtId }
 */
export function draftFromApiEvent(ev, ctx) {
  const teamId = ev.team?.id
  const side = teamId === ctx.homeExtId ? 'home' : teamId === ctx.awayExtId ? 'away' : null
  const elapsed = Number(ev.time?.elapsed ?? 0)
  const extra = Number(ev.time?.extra ?? 0)
  const detail = ev.detail ?? ''

  let type = null
  let note = ''
  if (ev.type === 'Goal') {
    if (/missed/i.test(detail)) type = 'penalty_miss'
    else if (/own/i.test(detail)) type = 'own_goal'
    else if (/penalty/i.test(detail)) type = 'penalty_goal'
    else type = 'goal'
  } else if (ev.type === 'Card') {
    type = /red/i.test(detail) || /second yellow/i.test(detail) ? 'red' : 'yellow'
    if (/second yellow/i.test(detail)) note = 'Segunda amarilla'
  } else if (ev.type === 'subst') {
    type = 'substitution'
  } else if (ev.type === 'Var') {
    type = 'var'
    note = detail
  }
  if (!type) return null

  const key = [elapsed, extra, ev.type, detail, ev.player?.id ?? ev.player?.name ?? '', ev.assist?.id ?? ev.assist?.name ?? ''].join(':')
  return {
    api_key: key,
    type,
    side,
    elapsed,
    extra,
    player_name: ev.player?.name ?? null,
    related_player_name: ev.assist?.name ?? null,
    api_player_id: ev.player?.id ?? null,
    api_related_id: ev.assist?.id ?? null,
    detail: note || detail,
  }
}

/** Busca un jugador de nuestra plantilla (match_players + external_id) por id de la API o por nombre. */
export function findPlayer(players, side, apiId, apiName) {
  const pool = side ? players.filter((p) => p.side === side) : players
  return (
    (apiId && pool.find((p) => p.ext_id === apiId)) ||
    (apiName && pool.find((p) => namesMatch(p.name, apiName))) ||
    null
  )
}

/**
 * ¿Ya cargaron a mano este evento? Mismo tipo y equipo, a menos de 2 minutos, y mismo jugador si ambos lo tienen.
 * (Evita sugerir lo que el equipo de campo o el relator ya registraron.)
 */
export function alreadyLogged(draft, events) {
  const minute = draft.elapsed + draft.extra
  return events.some((e) => {
    if (e.type !== draft.type) return false
    if (draft.side && e.side && e.side !== draft.side) return false
    const em = Number.parseInt(e.minute_label, 10)
    const near = Number.isFinite(em) ? Math.abs(em - draft.elapsed) <= 2 || Math.abs(em - minute) <= 2 : true
    if (!near) return false
    if (draft.type === 'substitution') return true
    if (draft.player_name && e.player_name) return namesMatch(draft.player_name, e.player_name)
    return true
  })
}

/** Con el evento aceptado: minuto legible y tiempo de reloj equivalentes. */
export function timing(draft) {
  const total = draft.elapsed + draft.extra
  return { clock_seconds: Math.max(0, (total - 1) * 60), period: periodForMinute(draft.elapsed) }
}
