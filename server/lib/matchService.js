import { query } from '../db.js'
import { HttpError } from './http.js'
import { autoLineup, deriveFromEvents } from './domain.js'

const POS_ORDER_SQL = "array_position(ARRAY['G','D','M','F'], position)"

/** Estado completo de un partido (sin rol: el rol es por usuario, no se difunde). */
export async function loadBundle(matchId) {
  const [matchRes, playersRes, eventsRes, membersRes] = await Promise.all([
    query('SELECT m.*, u.name AS owner_name FROM matches m JOIN users u ON u.id = m.owner_id WHERE m.id = $1', [matchId]),
    query(
      `SELECT * FROM match_players WHERE match_id = $1
        ORDER BY side, is_starter DESC, ${POS_ORDER_SQL}, number NULLS LAST, id`,
      [matchId],
    ),
    query(
      `SELECT e.*, u.name AS author_name FROM match_events e
         LEFT JOIN users u ON u.id = e.created_by WHERE e.match_id = $1 ORDER BY e.id`,
      [matchId],
    ),
    query(
      `SELECT u.id, u.name, u.email, mm.role FROM match_members mm
         JOIN users u ON u.id = mm.user_id WHERE mm.match_id = $1 ORDER BY u.name`,
      [matchId],
    ),
  ])
  if (!matchRes.rows[0]) throw new HttpError(404, 'Partido no encontrado.')
  return {
    match: matchRes.rows[0],
    players: playersRes.rows,
    events: eventsRes.rows,
    members: membersRes.rows,
    server_time: Date.now(),
  }
}

/** Inserta jugadores en la plantilla del partido. list: [{player_id,name,number,position,is_starter,x,y,notes}] */
export async function insertMatchPlayers(client, matchId, side, list) {
  for (const p of list) {
    await client.query(
      `INSERT INTO match_players (match_id, side, player_id, name, number, position, is_starter, on_pitch, x, y, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10)`,
      [matchId, side, p.player_id ?? null, p.name, p.number ?? null, p.position ?? 'M',
        Boolean(p.is_starter), p.x ?? null, p.y ?? null, p.notes ?? ''],
    )
  }
}

/**
 * Define titulares y los ubica según la formación.
 * starterIds: ids de match_players a usar como titulares (deben ser 11); null = mantener/auto.
 */
export async function applyLineup(client, matchId, side, formation, starterIds = null) {
  const { rows } = await client.query(
    'SELECT id, position, number, is_starter FROM match_players WHERE match_id = $1 AND side = $2',
    [matchId, side],
  )
  let preferred = starterIds ? new Set(starterIds) : null
  if (!preferred) {
    const current = rows.filter((p) => p.is_starter).map((p) => p.id)
    if (current.length === 11) preferred = new Set(current)
  }
  const placement = autoLineup(rows, formation, side, preferred)
  for (const p of rows) {
    const spot = placement.get(p.id)
    await client.query(
      'UPDATE match_players SET is_starter = $2, on_pitch = $2, x = $3, y = $4 WHERE id = $1',
      [p.id, Boolean(spot), spot?.x ?? null, spot?.y ?? null],
    )
  }
  await client.query(`UPDATE matches SET ${side}_formation = $2, updated_at = now() WHERE id = $1`, [matchId, formation])
}

/** Recalcula marcador y estadísticas de jugadores a partir de los eventos. */
export async function recompute(client, matchId) {
  const { rows: events } = await client.query('SELECT * FROM match_events WHERE match_id = $1', [matchId])
  const { score, players } = deriveFromEvents(events)
  await client.query('UPDATE matches SET home_score = $2, away_score = $3, updated_at = now() WHERE id = $1', [
    matchId, score.home, score.away,
  ])
  await client.query('UPDATE match_players SET yellows = 0, red = false, goals = 0 WHERE match_id = $1', [matchId])
  for (const [id, s] of players) {
    await client.query('UPDATE match_players SET yellows = $3, red = $4, goals = $5 WHERE id = $1 AND match_id = $2', [
      id, matchId, s.yellows, s.red, s.goals,
    ])
  }
}

const DEFAULT_COLORS = { home: '#2563eb', away: '#dc2626' }

/**
 * Crea un partido con sus plantillas.
 * spec.home / spec.away: { team_id?, name?, color?, formation?, ext_id?, lineup? }
 *   lineup: [{player_id,name,number,position,is_starter,x,y}] (si viene, se usa tal cual; si no, se arma desde el equipo)
 */
export async function createMatch(client, ownerId, spec) {
  const sides = {}
  for (const side of ['home', 'away']) {
    const s = spec[side] ?? {}
    let team = null
    let players = []
    if (s.team_id) {
      const res = await client.query('SELECT * FROM teams WHERE id = $1 AND owner_id = $2', [s.team_id, ownerId])
      team = res.rows[0]
      if (!team) throw new HttpError(400, 'Equipo inválido.')
      players = (await client.query('SELECT * FROM players WHERE team_id = $1', [team.id])).rows
    }
    const name = s.name || team?.name
    if (!name) throw new HttpError(400, `Falta el nombre del equipo ${side === 'home' ? 'local' : 'visitante'}.`)
    sides[side] = {
      team, players, name,
      color: s.color || team?.color || DEFAULT_COLORS[side],
      formation: s.formation || '4-4-2',
      ext_id: s.ext_id ?? null,
      lineup: s.lineup ?? null,
    }
  }

  const { home, away } = sides
  const { rows } = await client.query(
    `INSERT INTO matches (owner_id, home_team_id, away_team_id, home_name, away_name, home_color, away_color,
                          home_formation, away_formation, competition, venue, kickoff_at,
                          external_id, league_ext_id, season, home_ext_id, away_ext_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [ownerId, home.team?.id ?? null, away.team?.id ?? null, home.name, away.name, home.color, away.color,
      home.formation, away.formation, spec.competition ?? '', spec.venue ?? '', spec.kickoff_at ?? null,
      spec.external_id ?? null, spec.league_ext_id ?? null, spec.season ?? null, home.ext_id, away.ext_id],
  )
  const match = rows[0]

  for (const side of ['home', 'away']) {
    const s = sides[side]
    if (s.lineup) {
      await insertMatchPlayers(client, match.id, side, s.lineup)
    } else {
      await insertMatchPlayers(
        client, match.id, side,
        s.players.map((p) => ({
          player_id: p.id, name: p.name, number: p.number, position: p.position, notes: p.notes, is_starter: false,
        })),
      )
      await applyLineup(client, match.id, side, s.formation)
    }
  }
  await applyDefaultCrew(client, match.id, ownerId)
  return match
}

/** Suma al partido a los integrantes del equipo de transmisión predeterminado del usuario (si tiene uno). */
export async function applyDefaultCrew(client, matchId, ownerId) {
  const { rows } = await client.query('SELECT id FROM crews WHERE owner_id = $1 AND is_default', [ownerId])
  if (rows[0]) await addCrewToMatch(client, matchId, rows[0].id, ownerId)
}

/** Copia los integrantes de un equipo a un partido (con su rol). Devuelve cuántos sumó. */
export async function addCrewToMatch(client, matchId, crewId, ownerId) {
  const { rowCount } = await client.query(
    `INSERT INTO match_members (match_id, user_id, role)
     SELECT $1, cm.user_id, cm.role
       FROM crew_members cm JOIN crews c ON c.id = cm.crew_id
      WHERE c.id = $2 AND c.owner_id = $3 AND cm.user_id <> $3
     ON CONFLICT (match_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [matchId, crewId, ownerId],
  )
  return rowCount
}
