import { config } from '../config.js'
import { query } from '../db.js'
import { decrypt } from './crypto.js'
import { HttpError } from './http.js'

// Configurable sólo para poder probar contra un servidor simulado.
const baseUrl = () => process.env.API_FOOTBALL_BASE || 'https://v3.football.api-sports.io'

// Caché en memoria para cuidar la cuota diaria (el plan gratuito da ~100 requests/día).
const cache = new Map()
const TTL = { short: 60_000, medium: 60 * 60_000, long: 12 * 60 * 60_000 }

const POSITION_MAP = { Goalkeeper: 'G', Defender: 'D', Midfielder: 'M', Attacker: 'F', G: 'G', D: 'D', M: 'M', F: 'F' }
export const mapPosition = (p) => POSITION_MAP[p] ?? 'M'

/** Key del usuario (si cargó una propia) o la global del servidor. */
export async function resolveApiKey(userId) {
  const { rows } = await query('SELECT api_key_enc FROM users WHERE id = $1', [userId])
  if (rows[0]?.api_key_enc) {
    const key = decrypt(rows[0].api_key_enc)
    if (key) return { key, source: 'user' }
  }
  if (config.apiFootballKey) return { key: config.apiFootballKey, source: 'server' }
  return { key: null, source: null }
}

/** Igual que apiGet pero devuelve también las consultas que te quedan hoy: { data, remaining, limit }. */
export async function apiGetMeta(userId, path, params = {}, ttl = TTL.medium) {
  const { key, source } = await resolveApiKey(userId)
  if (!key) {
    throw Object.assign(new HttpError(503, 'Falta configurar la API key de API-Football (Ajustes → Integración deportiva).'), { code: 'no_key' })
  }
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString()
  const url = `${baseUrl()}${path}${qs ? `?${qs}` : ''}`
  const cacheKey = `${source}:${key.slice(-6)}:${url}`
  const hit = cache.get(cacheKey)
  // ttl 0 = dato en vivo: nunca se sirve ni se guarda en caché.
  if (ttl > 0 && hit && hit.expires > Date.now()) return hit.value

  let res
  try {
    res = await fetch(url, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(15_000) })
  } catch {
    throw new HttpError(502, 'No se pudo contactar a API-Football. Probá de nuevo en un momento.')
  }
  if (!res.ok) throw new HttpError(502, `API-Football respondió ${res.status}.`)
  const json = await res.json()

  // API-Football devuelve 200 aun con errores: vienen en "errors" (array u objeto).
  const errors = json.errors
  const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0
  if (hasErrors) {
    const msg = Object.values(errors).join(' ')
    const keys = Array.isArray(errors) ? [] : Object.keys(errors)
    const fail = (status, message, code) => Object.assign(new HttpError(status, message), { code })
    if (keys.includes('token')) throw fail(401, 'La API key de API-Football no es válida.', 'token')
    if (keys.includes('plan')) throw fail(403, `Tu plan de API-Football no permite esta consulta: ${msg}`, 'plan')
    if (keys.includes('rateLimit')) throw fail(429, 'Demasiadas consultas por minuto a la API deportiva. Esperá unos segundos.', 'rate_minute')
    if (keys.includes('requests') || /limit/i.test(msg)) throw fail(429, 'Se alcanzó el límite diario de la API deportiva.', 'daily_limit')
    throw new HttpError(502, `API-Football: ${msg}`)
  }

  const data = json.response ?? []
  const num = (h) => (res.headers.get(h) === null ? null : Number(res.headers.get(h)))
  const value = { data, remaining: num('x-ratelimit-requests-remaining'), limit: num('x-ratelimit-requests-limit') }
  if (ttl > 0) {
    cache.set(cacheKey, { value, expires: Date.now() + ttl })
    if (cache.size > 500) cache.delete(cache.keys().next().value)
  }
  return value
}

export async function apiGet(userId, path, params = {}, ttl = TTL.medium) {
  return (await apiGetMeta(userId, path, params, ttl)).data
}

/** Plan y consultas usadas hoy. El endpoint /status de API-Football no descuenta de la cuota. */
export async function fetchAccountStatus(userId) {
  const { data } = await apiGetMeta(userId, '/status', {}, 30_000)
  const r = Array.isArray(data) ? data[0] : data
  return {
    plan: r?.subscription?.plan ?? null,
    active: r?.subscription?.active ?? null,
    ends: r?.subscription?.end ?? null,
    used: r?.requests?.current ?? null,
    limit: r?.requests?.limit_day ?? null,
  }
}

export { TTL }

// ---------- Normalizadores ----------

export const normTeam = (r) => ({
  external_id: r.team.id,
  name: r.team.name,
  short_name: r.team.code ?? null,
  logo_url: r.team.logo ?? null,
  country: r.team.country ?? null,
  national: Boolean(r.team.national),
  stadium: r.venue?.name ?? null,
  city: r.venue?.city ?? null,
})

export const normLeague = (r) => ({
  external_id: r.league.id,
  name: r.league.name,
  type: r.league.type,
  logo: r.league.logo,
  country: r.country?.name ?? null,
  seasons: (r.seasons ?? []).map((s) => s.year).sort((a, b) => b - a),
  current_season: (r.seasons ?? []).find((s) => s.current)?.year ?? null,
})

export const normFixture = (r) => ({
  external_id: r.fixture.id,
  date: r.fixture.date,
  venue: r.fixture.venue?.name ?? null,
  city: r.fixture.venue?.city ?? null,
  status: r.fixture.status?.short ?? null,
  status_long: r.fixture.status?.long ?? null,
  league: { external_id: r.league.id, name: r.league.name, season: r.league.season, round: r.league.round, logo: r.league.logo },
  home: { external_id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo },
  away: { external_id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo },
  goals: r.goals,
})

export const normLineup = (r) => ({
  team_id: r.team.id,
  team_name: r.team.name,
  color: r.team.colors?.player?.primary ? `#${r.team.colors.player.primary}` : null,
  coach: r.coach?.name ?? null,
  formation: r.formation ?? null,
  starters: (r.startXI ?? []).map(({ player }) => ({
    external_id: player.id, name: player.name, number: player.number, position: mapPosition(player.pos), grid: player.grid ?? null,
  })),
  substitutes: (r.substitutes ?? []).map(({ player }) => ({
    external_id: player.id, name: player.name, number: player.number, position: mapPosition(player.pos), grid: null,
  })),
})

export const normStanding = (r) => ({
  league: { external_id: r.league.id, name: r.league.name, season: r.league.season },
  groups: (r.league.standings ?? []).map((group) =>
    group.map((row) => ({
      rank: row.rank,
      team: { external_id: row.team.id, name: row.team.name, logo: row.team.logo },
      points: row.points,
      played: row.all.played,
      won: row.all.win,
      drawn: row.all.draw,
      lost: row.all.lose,
      goals_for: row.all.goals.for,
      goals_against: row.all.goals.against,
      goal_diff: row.goalsDiff,
      form: row.form ?? null,
      group: row.group ?? null,
    })),
  ),
})
