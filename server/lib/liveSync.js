// Seguimiento en vivo con API-Football.
//
// Consulta el partido cada X segundos (una sola vez para todo el equipo, sin importar cuántos estén conectados)
// y convierte los goles, tarjetas, cambios y revisiones del VAR en SUGERENCIAS que una persona confirma o descarta.
// Nada entra a la cronología sin aprobación. El reloj y el marcador siguen siendo del equipo.
//
// Cuidado de la cuota: cada consulta descuenta de las ~100 diarias del plan gratuito, así que hay un intervalo
// configurable, el seguimiento se corta solo al terminar el partido, tras 4 h, o cuando quedan pocas consultas.

import { query, tx } from '../db.js'
import { broadcast } from '../realtime.js'
import { HttpError } from './http.js'
import { apiGetMeta } from './apiFootball.js'
import { FINISHED_STATUSES, WAITING_STATUSES, alreadyLogged, draftFromApiEvent, findPlayer, timing } from './apiEvents.js'
import { createEvent, loadBundle, substitute } from './matchService.js'

export const MIN_INTERVAL = 60
export const MAX_INTERVAL = 600
const RESERVE = 5 // consultas que se dejan sin gastar
const MAX_FOLLOW_MS = 4 * 60 * 60 * 1000

const timers = new Map() // matchId -> Timeout

async function publishBundle(matchId) {
  broadcast(matchId, { type: 'bundle', bundle: await loadBundle(matchId) })
}

async function stopWith(matchId, error = null) {
  clearTimeout(timers.get(matchId))
  timers.delete(matchId)
  await query('UPDATE matches SET api_follow = false, api_error = $2, updated_at = now() WHERE id = $1', [matchId, error])
}

/**
 * Una consulta a la API para el partido: actualiza estado/marcador de referencia y crea sugerencias nuevas.
 * Con force=true funciona aunque el seguimiento automático esté apagado ("Consultar ahora").
 * Devuelve { stop, nextSeconds, created }.
 */
export async function syncMatch(matchId, { force = false } = {}) {
  const { rows } = await query('SELECT * FROM matches WHERE id = $1', [matchId])
  const m = rows[0]
  if (!m) return { stop: true }
  if (!m.external_id) throw new HttpError(400, 'Este partido no viene de la API deportiva.')
  if (!force && !m.api_follow) return { stop: true }

  const userId = m.api_follow_user ?? m.owner_id

  if (m.api_follow && m.api_follow_since && Date.now() - new Date(m.api_follow_since).getTime() > MAX_FOLLOW_MS) {
    await stopWith(matchId, 'Seguimiento detenido tras 4 horas.')
    await publishBundle(matchId)
    return { stop: true }
  }

  let fixture
  let remaining
  let events
  try {
    const res = await apiGetMeta(userId, '/fixtures', { id: m.external_id }, 0)
    fixture = res.data[0]
    remaining = res.remaining
    if (!fixture) throw new HttpError(404, 'La API no devolvió este partido.')
    events = fixture.events
    // Si la respuesta del partido no trae los eventos, se piden aparte (una consulta más).
    if (events === undefined && !WAITING_STATUSES.includes(fixture.fixture.status.short)) {
      const ev = await apiGetMeta(userId, '/fixtures/events', { fixture: m.external_id }, 0)
      events = ev.data
      remaining = ev.remaining ?? remaining
    }
  } catch (err) {
    await query('UPDATE matches SET api_error = $2, api_last_sync = now() WHERE id = $1', [matchId, err.message])
    // Sin permiso, sin cuota o key inválida: seguir consultando no sirve.
    const fatal = ['token', 'plan', 'daily_limit', 'no_key'].includes(err.code) || err.status === 404
    if (fatal && m.api_follow) await stopWith(matchId, err.message)
    await publishBundle(matchId)
    if (force) throw err
    return { stop: fatal, nextSeconds: 120 }
  }

  const status = fixture.fixture.status.short
  events = events ?? []

  const created = await tx(async (client) => {
    const { rows: players } = await client.query(
      `SELECT mp.*, p.external_id AS ext_id FROM match_players mp LEFT JOIN players p ON p.id = mp.player_id
        WHERE mp.match_id = $1`,
      [matchId],
    )
    const { rows: logged } = await client.query('SELECT * FROM match_events WHERE match_id = $1', [matchId])
    let count = 0
    for (const raw of events) {
      const draft = draftFromApiEvent(raw, { homeExtId: m.home_ext_id, awayExtId: m.away_ext_id })
      if (!draft) continue
      // Un autogol o un jugador conocido define el equipo con más certeza que el campo "team" de la API.
      const known = findPlayer(players, draft.side, draft.api_player_id, draft.player_name)
      if (draft.type === 'own_goal' && known) draft.side = known.side
      const matched = alreadyLogged(draft, logged)
      const { rowCount } = await client.query(
        `INSERT INTO api_suggestions (match_id, api_key, type, side, elapsed, extra, player_name, related_player_name,
                                      api_player_id, api_related_id, detail, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (match_id, api_key) DO NOTHING`,
        [matchId, draft.api_key, draft.type, draft.side, draft.elapsed, draft.extra, draft.player_name,
          draft.related_player_name, draft.api_player_id, draft.api_related_id, draft.detail, matched ? 'matched' : 'pending'],
      )
      if (rowCount && !matched) count += 1
    }
    await client.query(
      `UPDATE matches SET api_last_sync = now(), api_status = $2, api_elapsed = $3, api_home_goals = $4, api_away_goals = $5,
                          api_remaining = $6, api_error = NULL WHERE id = $1`,
      [matchId, status, fixture.fixture.status.elapsed ?? null, fixture.goals?.home ?? null, fixture.goals?.away ?? null, remaining ?? null],
    )
    return count
  })

  // Cortes automáticos del seguimiento.
  let stop = false
  if (m.api_follow) {
    if (FINISHED_STATUSES.includes(status)) {
      await stopWith(matchId, null)
      stop = true
    } else if (remaining !== null && remaining !== undefined && remaining <= RESERVE) {
      await stopWith(matchId, `Quedan ${remaining} consultas del día: se detuvo el seguimiento para no agotar tu cuota.`)
      stop = true
    }
  }
  await publishBundle(matchId)

  // Antes del partido y en el entretiempo no hace falta consultar tan seguido.
  const nextSeconds = WAITING_STATUSES.includes(status) ? Math.max(m.api_interval, 300) : m.api_interval
  return { stop, nextSeconds, created }
}

async function tick(matchId) {
  try {
    const r = await syncMatch(matchId)
    if (r.stop) return timers.delete(matchId)
    schedule(matchId, r.nextSeconds ?? 120)
  } catch (err) {
    console.error('[liveSync]', matchId, err.message)
    schedule(matchId, 120)
  }
}

function schedule(matchId, seconds) {
  clearTimeout(timers.get(matchId))
  const t = setTimeout(() => tick(matchId), seconds * 1000)
  t.unref?.()
  timers.set(matchId, t)
}

/** Activa el seguimiento y hace la primera consulta enseguida (para mostrar errores en el momento). */
export async function startFollow(matchId, userId, interval) {
  const secs = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(interval)))
  await query(
    `UPDATE matches SET api_follow = true, api_follow_user = $2, api_follow_since = now(), api_interval = $3, api_error = NULL
      WHERE id = $1`,
    [matchId, userId, secs],
  )
  // force: si la primera consulta falla (plan sin acceso, cuota, key inválida) el error le llega a quien activó el seguimiento.
  const r = await syncMatch(matchId, { force: true }).catch(async (err) => {
    await stopWith(matchId, err.message)
    throw err
  })
  if (r.stop) return
  schedule(matchId, r.nextSeconds ?? secs)
}

export async function stopFollow(matchId) {
  await stopWith(matchId, null)
}

/** Al arrancar el servidor (por ejemplo tras un deploy), retoma los seguimientos que estaban activos. */
export async function resumeFollows() {
  const { rows } = await query('SELECT id FROM matches WHERE api_follow')
  rows.forEach((row, i) => schedule(row.id, 10 + i * 5))
  if (rows.length) console.log(`[liveSync] retomando ${rows.length} seguimiento(s)`)
}

// ---------- Sugerencias ----------

/**
 * Acepta una sugerencia y la convierte en un evento real (con el minuto de la API).
 * override: { side } para corregir el equipo (útil en autogoles).
 */
export async function acceptSuggestion(matchId, suggestionId, userId, override = {}) {
  await tx(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM api_suggestions WHERE id = $1 AND match_id = $2 AND status = 'pending' FOR UPDATE",
      [suggestionId, matchId],
    )
    const sg = rows[0]
    if (!sg) throw new HttpError(404, 'La sugerencia ya fue resuelta o no existe.')
    const { rows: players } = await client.query(
      `SELECT mp.*, p.external_id AS ext_id FROM match_players mp LEFT JOIN players p ON p.id = mp.player_id
        WHERE mp.match_id = $1`,
      [matchId],
    )
    const side = override.side ?? sg.side
    const t = timing(sg)

    if (sg.type === 'substitution') {
      // La API no aclara cuál de los dos sale: el que está en cancha es el que sale.
      const a = findPlayer(players, side, sg.api_player_id, sg.player_name)
      const b = findPlayer(players, side, sg.api_related_id, sg.related_player_name)
      const out = [a, b].find((p) => p?.on_pitch)
      const incoming = [a, b].find((p) => p && !p.on_pitch && !p.red)
      if (out && incoming && out.id !== incoming.id) {
        await substitute(client, matchId, out.id, incoming.id, userId, t)
      } else {
        // No se pudo identificar a los jugadores en tu plantilla: queda como nota para no perder el dato.
        await createEvent(client, matchId, {
          type: 'note', side, ...t, description: `Cambio (API): ${sg.player_name ?? '?'} / ${sg.related_player_name ?? '?'}`,
        }, userId)
      }
    } else {
      const known = findPlayer(players, side, sg.api_player_id, sg.player_name)
      await createEvent(client, matchId, {
        type: sg.type,
        side,
        match_player_id: known?.id ?? null,
        player_name: known ? undefined : sg.player_name,
        description: sg.detail && sg.type === 'var' ? sg.detail : sg.detail === 'Segunda amarilla' ? sg.detail : undefined,
        ...t,
      }, userId)
    }
    await client.query("UPDATE api_suggestions SET status = 'accepted', resolved_by = $2 WHERE id = $1", [suggestionId, userId])
  })
  await publishBundle(matchId)
}

export async function dismissSuggestion(matchId, suggestionId, userId) {
  const { rowCount } = await query(
    "UPDATE api_suggestions SET status = 'dismissed', resolved_by = $3 WHERE id = $1 AND match_id = $2 AND status = 'pending'",
    [suggestionId, matchId, userId],
  )
  if (!rowCount) throw new HttpError(404, 'La sugerencia ya fue resuelta o no existe.')
  await publishBundle(matchId)
}
