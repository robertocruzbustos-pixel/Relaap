// Lógica de dominio pura (sin acceso a base de datos): formaciones, reloj y marcador.

export const PERIOD_START = { '1T': 0, '2T': 2700, ET1: 5400, ET2: 6300 }
export const PERIOD_LIMIT = { '1T': 45, '2T': 90, ET1: 105, ET2: 120 }

export const EVENT_TYPES = [
  'goal', 'own_goal', 'penalty_goal', 'penalty_miss', 'yellow', 'red',
  'substitution', 'chance', 'save', 'corner', 'foul', 'offside', 'injury', 'var', 'note',
]
// Eventos generados por el sistema al cambiar de período (no se cargan a mano).
export const SYSTEM_EVENT_TYPES = ['period']

export const PERIOD_EVENT_TEXT = {
  '1T': 'Comienza el partido',
  ENT: 'Entretiempo',
  '2T': 'Comienza el segundo tiempo',
  ET1: 'Comienza el alargue',
  ET2: 'Segundo tiempo del alargue',
  FIN: 'Final del partido',
}

// ---------- Formaciones ----------

/** "4-3-3" -> [4,3,3]; devuelve null si no es una formación válida de 10 jugadores de campo. */
export function parseFormation(formation) {
  const parts = String(formation ?? '').split('-').map(Number)
  if (parts.length < 2 || parts.length > 5) return null
  if (parts.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) return null
  if (parts.reduce((a, b) => a + b, 0) !== 10) return null
  return parts
}

/** Filas del equipo, del arco al ataque: [{pos:'G',count:1},{pos:'D',count:4},...] */
export function formationRows(formation) {
  const parts = parseFormation(formation) ?? [4, 4, 2]
  const rows = [{ pos: 'G', count: 1 }]
  parts.forEach((count, i) => {
    const pos = i === 0 ? 'D' : i === parts.length - 1 ? 'F' : 'M'
    rows.push({ pos, count })
  })
  return rows
}

const clampPct = (n) => Math.round(Math.min(97, Math.max(3, n)) * 10) / 10

/**
 * Coordenadas (%) sobre una cancha horizontal de 0-100 en ambos ejes.
 * El local ataca hacia la derecha; el visitante se refleja.
 * rowIdx: 0 = arquero. rowCount: cantidad de filas. col: 1..cols dentro de la fila (de izquierda a derecha del equipo).
 */
export function slotXY(side, rowIdx, rowCount, col, cols) {
  const x = rowCount <= 1 ? 8 : 8 + (rowIdx * 38) / (rowCount - 1)
  const y = (col / (cols + 1)) * 100
  return side === 'home' ? { x: clampPct(x), y: clampPct(y) } : { x: clampPct(100 - x), y: clampPct(100 - y) }
}

const POS_ORDER = ['G', 'D', 'M', 'F']
const posDistance = (a, b) => Math.abs(POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b))

/**
 * Elige 11 titulares y los ubica según la formación.
 * players: [{ id, position, number, is_starter? }]
 * Devuelve Map(id -> {x, y}) sólo para los titulares.
 * Si preferredIds (Set) tiene exactamente 11 ids, se usan esos titulares.
 */
export function autoLineup(players, formation, side, preferredIds = null) {
  const rows = formationRows(formation)
  const total = rows.reduce((n, r) => n + r.count, 0)
  const pool = [...players].sort((a, b) => (a.number ?? 999) - (b.number ?? 999))
  const use = preferredIds && preferredIds.size === total ? new Set(preferredIds) : null
  const available = use ? pool.filter((p) => use.has(p.id)) : pool.slice()

  const result = new Map()
  rows.forEach((row, rowIdx) => {
    const picked = []
    for (let n = 0; n < row.count; n++) {
      // Primero un jugador de la posición exacta; si no hay, el de posición más cercana.
      let best = -1
      let bestDist = Infinity
      available.forEach((p, i) => {
        const d = posDistance(p.position, row.pos)
        if (d < bestDist) {
          best = i
          bestDist = d
        }
      })
      if (best === -1) break
      picked.push(available.splice(best, 1)[0])
    }
    picked.forEach((p, j) => {
      result.set(p.id, slotXY(side, rowIdx, rows.length, j + 1, picked.length))
    })
  })
  return result
}

/**
 * Convierte las grillas "fila:columna" de API-Football en coordenadas.
 * starters: [{ grid: "2:3" | null }]. Devuelve array paralelo con {x,y} o null.
 */
export function gridsToXY(starters, side) {
  const parsed = starters.map((s) => {
    const m = /^(\d+):(\d+)$/.exec(s.grid ?? '')
    return m ? { row: Number(m[1]), col: Number(m[2]) } : null
  })
  if (parsed.some((p) => p === null)) return starters.map(() => null)
  const maxRow = Math.max(...parsed.map((p) => p.row))
  const colsPerRow = {}
  parsed.forEach((p) => {
    colsPerRow[p.row] = Math.max(colsPerRow[p.row] ?? 0, p.col)
  })
  return parsed.map((p) => slotXY(side, p.row - 1, maxRow, p.col, colsPerRow[p.row]))
}

// ---------- Reloj ----------

export function elapsedSeconds(match, nowMs = Date.now()) {
  if (!match.clock_started_at) return match.clock_seconds
  const started = new Date(match.clock_started_at).getTime()
  return match.clock_seconds + Math.max(0, Math.floor((nowMs - started) / 1000))
}

export function minuteLabel(period, seconds) {
  if (period === 'PRE') return 'Previa'
  if (period === 'ENT') return 'ENT'
  if (period === 'FIN') return 'FIN'
  const minute = Math.floor(seconds / 60) + 1
  const limit = PERIOD_LIMIT[period]
  if (limit && minute > limit) return `${limit}+${minute - limit}'`
  return `${minute}'`
}

/**
 * Aplica una acción de reloj y devuelve los campos del partido a actualizar.
 * actions: start | pause | set {seconds} | period {period} | reset
 */
export function applyClockAction(match, action, payload = {}, nowMs = Date.now()) {
  const now = new Date(nowMs)
  const elapsed = elapsedSeconds(match, nowMs)
  const running = Boolean(match.clock_started_at)

  switch (action) {
    case 'start': {
      if (match.status === 'finished') throw new ClockError('El partido ya terminó.')
      if (running) return {}
      // Desde la previa arranca el 1T; desde el entretiempo, el 2T.
      const period = match.period === 'PRE' ? '1T' : match.period === 'ENT' ? '2T' : match.period
      const seconds = match.period === 'ENT' ? Math.max(elapsed, PERIOD_START['2T']) : match.clock_seconds
      return { clock_started_at: now, clock_seconds: seconds, period, status: 'live' }
    }
    case 'pause':
      return running ? { clock_seconds: elapsed, clock_started_at: null } : {}
    case 'set': {
      const seconds = Math.max(0, Math.floor(Number(payload.seconds) || 0))
      return { clock_seconds: seconds, clock_started_at: running ? now : null }
    }
    case 'period': {
      const p = payload.period
      if (p === 'ENT') return { period: 'ENT', clock_seconds: elapsed, clock_started_at: null, status: 'live' }
      if (p === 'FIN') return { period: 'FIN', clock_seconds: elapsed, clock_started_at: null, status: 'finished' }
      if (p in PERIOD_START) {
        return { period: p, clock_seconds: PERIOD_START[p], clock_started_at: now, status: 'live' }
      }
      throw new ClockError('Período inválido.')
    }
    case 'reset':
      return { period: 'PRE', clock_seconds: 0, clock_started_at: null, status: 'scheduled' }
    default:
      throw new ClockError('Acción de reloj inválida.')
  }
}

export class ClockError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ClockError'
  }
}

// ---------- Marcador y derivados ----------

/** Recalcula marcador y estadísticas por jugador a partir de la lista de eventos. */
export function deriveFromEvents(events) {
  const score = { home: 0, away: 0 }
  const players = new Map() // match_player_id -> { yellows, red, goals }
  const bump = (id, key, by = 1) => {
    if (!id) return
    const cur = players.get(id) ?? { yellows: 0, red: false, goals: 0 }
    if (key === 'red') cur.red = true
    else cur[key] += by
    players.set(id, cur)
  }
  for (const e of events) {
    if (e.type === 'goal' || e.type === 'penalty_goal') {
      if (e.side) score[e.side] += 1
      bump(e.match_player_id, 'goals')
    } else if (e.type === 'own_goal') {
      if (e.side) score[e.side === 'home' ? 'away' : 'home'] += 1
    } else if (e.type === 'yellow') {
      bump(e.match_player_id, 'yellows')
    } else if (e.type === 'red') {
      bump(e.match_player_id, 'red')
    }
  }
  return { score, players }
}
