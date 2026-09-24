import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../db.js'
import { broadcast } from '../realtime.js'
import { HttpError, idParam, parse, wrap } from '../lib/http.js'
import { matchAccess } from '../lib/access.js'
import {
  EVENT_TYPES, PERIOD_EVENT_TEXT, PERIOD_START, applyClockAction, elapsedSeconds, minuteLabel, parseFormation,
} from '../lib/domain.js'
import { applyLineup, createMatch, insertMatchPlayers, loadBundle, recompute } from '../lib/matchService.js'

const router = Router()

const edit = matchAccess({ edit: true })
const view = matchAccess()
const ownerOnly = matchAccess({ ownerOnly: true })

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color inválido (#rrggbb)')
const side = z.enum(['home', 'away'])
const formation = z
  .string()
  .refine((f) => parseFormation(f) !== null, 'formación inválida (ej. 4-4-2, 4-3-3, 3-5-2)')

const sideSpec = z.object({
  team_id: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  color: color.optional(),
  formation: formation.optional(),
})

const createSchema = z.object({
  home: sideSpec,
  away: sideSpec,
  competition: z.string().trim().max(150).optional(),
  venue: z.string().trim().max(150).optional(),
  kickoff_at: z.string().datetime({ offset: true }).nullable().optional(),
})

const metaSchema = z.object({
  home_name: z.string().trim().min(1).max(100),
  away_name: z.string().trim().min(1).max(100),
  home_color: color,
  away_color: color,
  competition: z.string().trim().max(150),
  venue: z.string().trim().max(150),
  kickoff_at: z.string().datetime({ offset: true }).nullable(),
  prematch_notes: z.string().max(50000),
  summary: z.string().max(50000),
})

// Envía a todos los conectados el estado actualizado y responde lo mismo al que hizo el cambio.
async function publish(res, matchId, status = 200) {
  const bundle = await loadBundle(matchId)
  broadcast(matchId, { type: 'bundle', bundle })
  return res.status(status).json(bundle)
}

// ---------- Listado y alta ----------

router.get(
  '/',
  wrap(async (req, res) => {
    const status = ['scheduled', 'live', 'finished'].includes(req.query.status) ? req.query.status : null
    const q = typeof req.query.q === 'string' && req.query.q.trim() ? `%${req.query.q.trim()}%` : null
    const { rows } = await query(
      `SELECT m.id, m.home_name, m.away_name, m.home_color, m.away_color, m.competition, m.venue, m.kickoff_at,
              m.status, m.period, m.home_score, m.away_score, m.clock_seconds, m.clock_started_at,
              m.owner_id, u.name AS owner_name,
              CASE WHEN m.owner_id = $1 THEN 'owner' ELSE mm.role END AS role
         FROM matches m
         JOIN users u ON u.id = m.owner_id
         LEFT JOIN match_members mm ON mm.match_id = m.id AND mm.user_id = $1
        WHERE (m.owner_id = $1 OR mm.user_id IS NOT NULL)
          AND ($2::text IS NULL OR m.status = $2)
          AND ($3::text IS NULL OR m.home_name ILIKE $3 OR m.away_name ILIKE $3 OR m.competition ILIKE $3)
        ORDER BY CASE m.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END,
                 CASE WHEN m.status = 'scheduled' THEN m.kickoff_at END ASC NULLS LAST,
                 CASE WHEN m.status <> 'scheduled' THEN COALESCE(m.kickoff_at, m.created_at) END DESC
        LIMIT 300`,
      [req.user.id, status, q],
    )
    res.json({ matches: rows, server_time: Date.now() })
  }),
)

router.post(
  '/',
  wrap(async (req, res) => {
    const data = parse(createSchema, req.body)
    const match = await tx((client) => createMatch(client, req.user.id, data))
    res.status(201).json(await loadBundle(match.id).then((b) => ({ ...b, role: 'owner' })))
  }),
)

router.get(
  '/:id',
  view,
  wrap(async (req, res) => {
    res.json({ ...(await loadBundle(req.matchId)), role: req.role })
  }),
)

router.patch(
  '/:id',
  edit,
  wrap(async (req, res) => {
    const data = parse(metaSchema.partial(), req.body)
    const cols = Object.keys(data)
    if (cols.length > 0) {
      const sets = cols.map((c, i) => `${c} = $${i + 2}`)
      await query(`UPDATE matches SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
        req.matchId, ...cols.map((c) => data[c]),
      ])
    }
    await publish(res, req.matchId)
  }),
)

router.delete(
  '/:id',
  ownerOnly,
  wrap(async (req, res) => {
    await query('DELETE FROM matches WHERE id = $1', [req.matchId])
    broadcast(req.matchId, { type: 'deleted' })
    res.status(204).end()
  }),
)

// ---------- Reloj ----------

const clockSchema = z.object({
  action: z.enum(['start', 'pause', 'set', 'period', 'reset']),
  seconds: z.number().int().min(0).max(60 * 300).optional(),
  period: z.enum(['1T', 'ENT', '2T', 'ET1', 'ET2', 'FIN']).optional(),
})

router.post(
  '/:id/clock',
  edit,
  wrap(async (req, res) => {
    const data = parse(clockSchema, req.body)
    await tx(async (client) => {
      const { rows } = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [req.matchId])
      const match = rows[0]
      const now = Date.now()
      const patch = applyClockAction(match, data.action, data, now)
      const cols = Object.keys(patch)
      if (cols.length > 0) {
        const sets = cols.map((c, i) => `${c} = $${i + 2}`)
        await client.query(`UPDATE matches SET ${sets.join(', ')}, updated_at = now() WHERE id = $1`, [
          req.matchId, ...cols.map((c) => patch[c]),
        ])
      }
      // Cada cambio de período queda registrado en la línea de tiempo.
      const newPeriod = patch.period
      const periodChanged = newPeriod && newPeriod !== match.period
      if (periodChanged && newPeriod !== 'PRE') {
        const secs = patch.clock_seconds ?? match.clock_seconds
        const label = newPeriod in PERIOD_START ? `${Math.floor(PERIOD_START[newPeriod] / 60)}'` : newPeriod
        await client.query(
          `INSERT INTO match_events (match_id, type, minute_label, period, clock_seconds, description, created_by)
           VALUES ($1,'period',$2,$3,$4,$5,$6)`,
          [req.matchId, label, newPeriod, secs, PERIOD_EVENT_TEXT[newPeriod] ?? newPeriod, req.user.id],
        )
      }
      if (data.action === 'reset') await client.query("DELETE FROM match_events WHERE match_id = $1 AND type = 'period'", [req.matchId])
    })
    await publish(res, req.matchId)
  }),
)

// ---------- Eventos ----------

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  side: side.nullable().optional(),
  match_player_id: z.number().int().positive().nullable().optional(),
  player_name: z.string().trim().max(100).nullable().optional(),
  related_player_name: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(500).optional(),
  clock_seconds: z.number().int().min(0).optional(),
})

const SCORING_TYPES = ['goal', 'own_goal', 'penalty_goal']

router.post(
  '/:id/events',
  edit,
  wrap(async (req, res) => {
    const data = parse(eventSchema, req.body)
    await tx(async (client) => {
      const { rows } = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [req.matchId])
      const match = rows[0]

      let eventSide = data.side ?? null
      let playerName = data.player_name ?? null
      if (data.match_player_id) {
        const mp = (
          await client.query('SELECT * FROM match_players WHERE id = $1 AND match_id = $2', [data.match_player_id, req.matchId])
        ).rows[0]
        if (!mp) throw new HttpError(400, 'Jugador inválido para este partido.')
        eventSide = mp.side
        playerName = playerName ?? mp.name
      }
      if (SCORING_TYPES.includes(data.type) && !eventSide) {
        throw new HttpError(400, 'Elegí el equipo o el jugador que convirtió.')
      }

      const seconds = data.clock_seconds ?? elapsedSeconds(match)
      await client.query(
        `INSERT INTO match_events (match_id, type, side, match_player_id, minute_label, period, clock_seconds,
                                  player_name, related_player_name, description, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [req.matchId, data.type, eventSide, data.match_player_id ?? null, minuteLabel(match.period, seconds),
          match.period, seconds, playerName, data.related_player_name ?? null, data.description ?? '', req.user.id],
      )
      await recompute(client, req.matchId)
      if (data.type === 'red' && data.match_player_id) {
        await client.query('UPDATE match_players SET on_pitch = false WHERE id = $1', [data.match_player_id])
      }
    })
    await publish(res, req.matchId, 201)
  }),
)

const eventPatchSchema = z.object({
  type: z.enum(EVENT_TYPES).optional(),
  side: side.nullable().optional(),
  minute_label: z.string().trim().max(12).optional(),
  player_name: z.string().trim().max(100).nullable().optional(),
  related_player_name: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(500).optional(),
})

router.patch(
  '/:id/events/:eventId',
  edit,
  wrap(async (req, res) => {
    const data = parse(eventPatchSchema, req.body)
    const cols = Object.keys(data)
    if (cols.length === 0) throw new HttpError(400, 'Nada para actualizar.')
    await tx(async (client) => {
      const sets = cols.map((c, i) => `${c} = $${i + 3}`)
      const { rowCount } = await client.query(
        `UPDATE match_events SET ${sets.join(', ')} WHERE id = $1 AND match_id = $2 AND type <> 'period'`,
        [idParam(req.params.eventId, 'evento'), req.matchId, ...cols.map((c) => data[c])],
      )
      if (!rowCount) throw new HttpError(404, 'Evento no encontrado.')
      await recompute(client, req.matchId)
    })
    await publish(res, req.matchId)
  }),
)

router.delete(
  '/:id/events/:eventId',
  edit,
  wrap(async (req, res) => {
    await tx(async (client) => {
      await client.query('DELETE FROM match_events WHERE id = $1 AND match_id = $2', [
        idParam(req.params.eventId, 'evento'), req.matchId,
      ])
      await recompute(client, req.matchId)
    })
    await publish(res, req.matchId)
  }),
)

// ---------- Plantillas y alineaciones ----------

const bulkPlayersSchema = z.object({
  side,
  players: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        number: z.number().int().min(0).max(99).nullable().optional(),
        position: z.enum(['G', 'D', 'M', 'F']).optional(),
      }),
    )
    .min(1)
    .max(60),
})

router.post(
  '/:id/players',
  edit,
  wrap(async (req, res) => {
    const data = parse(bulkPlayersSchema, req.body)
    await tx((client) =>
      insertMatchPlayers(client, req.matchId, data.side, data.players.map((p) => ({ ...p, is_starter: false }))),
    )
    await publish(res, req.matchId, 201)
  }),
)

const playerPatchSchema = z.object({
  x: z.number().min(0).max(100).nullable().optional(),
  y: z.number().min(0).max(100).nullable().optional(),
  on_pitch: z.boolean().optional(),
  is_starter: z.boolean().optional(),
  name: z.string().trim().min(1).max(100).optional(),
  number: z.number().int().min(0).max(99).nullable().optional(),
  position: z.enum(['G', 'D', 'M', 'F']).optional(),
  notes: z.string().max(5000).optional(),
})

router.patch(
  '/:id/players/:playerId',
  edit,
  wrap(async (req, res) => {
    const data = parse(playerPatchSchema, req.body)
    const playerId = idParam(req.params.playerId, 'jugador')
    const cols = Object.keys(data)
    if (cols.length === 0) throw new HttpError(400, 'Nada para actualizar.')

    const sets = cols.map((c, i) => `${c} = $${i + 3}`)
    const { rows } = await query(
      `UPDATE match_players SET ${sets.join(', ')} WHERE id = $1 AND match_id = $2 RETURNING *`,
      [playerId, req.matchId, ...cols.map((c) => data[c])],
    )
    const player = rows[0]
    if (!player) throw new HttpError(404, 'Jugador no encontrado.')

    // Si se editan las notas y el jugador viene de tu plantel, se guardan también en su ficha.
    if (data.notes !== undefined && player.player_id && req.role === 'owner') {
      await query('UPDATE players SET notes = $1 WHERE id = $2', [data.notes, player.player_id])
    }
    // Movimientos sueltos: solo se difunde el jugador (mensaje liviano).
    broadcast(req.matchId, { type: 'player', player })
    res.json({ player })
  }),
)

router.delete(
  '/:id/players/:playerId',
  edit,
  wrap(async (req, res) => {
    await query('DELETE FROM match_players WHERE id = $1 AND match_id = $2', [idParam(req.params.playerId, 'jugador'), req.matchId])
    await publish(res, req.matchId)
  }),
)

const lineupSchema = z.object({
  side,
  formation,
  starter_ids: z.array(z.number().int().positive()).length(11, 'elegí exactamente 11 titulares').optional(),
})

router.post(
  '/:id/lineup',
  edit,
  wrap(async (req, res) => {
    const data = parse(lineupSchema, req.body)
    await tx((client) => applyLineup(client, req.matchId, data.side, data.formation, data.starter_ids ?? null))
    await publish(res, req.matchId)
  }),
)

const subSchema = z.object({ out_id: z.number().int().positive(), in_id: z.number().int().positive() })

router.post(
  '/:id/substitution',
  edit,
  wrap(async (req, res) => {
    const data = parse(subSchema, req.body)
    await tx(async (client) => {
      const { rows: matchRows } = await client.query('SELECT * FROM matches WHERE id = $1 FOR UPDATE', [req.matchId])
      const match = matchRows[0]
      const { rows } = await client.query(
        'SELECT * FROM match_players WHERE match_id = $1 AND id = ANY($2::int[])',
        [req.matchId, [data.out_id, data.in_id]],
      )
      const out = rows.find((p) => p.id === data.out_id)
      const incoming = rows.find((p) => p.id === data.in_id)
      if (!out || !incoming) throw new HttpError(400, 'Jugadores inválidos.')
      if (out.side !== incoming.side) throw new HttpError(400, 'Los dos jugadores deben ser del mismo equipo.')
      if (!out.on_pitch) throw new HttpError(400, 'El jugador que sale no está en cancha.')
      if (incoming.on_pitch || incoming.red) throw new HttpError(400, 'El jugador que entra no está disponible.')

      await client.query('UPDATE match_players SET on_pitch = true, x = $2, y = $3 WHERE id = $1', [incoming.id, out.x, out.y])
      await client.query('UPDATE match_players SET on_pitch = false, x = NULL, y = NULL WHERE id = $1', [out.id])

      const seconds = elapsedSeconds(match)
      await client.query(
        `INSERT INTO match_events (match_id, type, side, match_player_id, minute_label, period, clock_seconds,
                                  player_name, related_player_name, description, created_by)
         VALUES ($1,'substitution',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [req.matchId, out.side, incoming.id, minuteLabel(match.period, seconds), match.period, seconds,
          incoming.name, out.name, `Entra ${incoming.name}, sale ${out.name}`, req.user.id],
      )
    })
    await publish(res, req.matchId, 201)
  }),
)

// ---------- Colaboradores ----------

const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email('email inválido'),
  role: z.enum(['editor', 'viewer']).default('editor'),
})

router.post(
  '/:id/members',
  ownerOnly,
  wrap(async (req, res) => {
    const data = parse(memberSchema, req.body)
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [data.email])
    if (!rows[0]) throw new HttpError(404, 'No hay ningún usuario con ese email. Pedile que se registre primero.')
    if (rows[0].id === req.user.id) throw new HttpError(400, 'Ya sos el creador del partido.')
    await query(
      `INSERT INTO match_members (match_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (match_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [req.matchId, rows[0].id, data.role],
    )
    await publish(res, req.matchId, 201)
  }),
)

router.delete(
  '/:id/members/:userId',
  view,
  wrap(async (req, res) => {
    const userId = idParam(req.params.userId, 'usuario')
    // El dueño saca a cualquiera; cada colaborador puede salirse solo.
    if (req.role !== 'owner' && userId !== req.user.id) throw new HttpError(403, 'No podés quitar a otros colaboradores.')
    await query('DELETE FROM match_members WHERE match_id = $1 AND user_id = $2', [req.matchId, userId])
    if (userId === req.user.id && req.role !== 'owner') {
      broadcast(req.matchId, { type: 'members_changed' })
      return res.status(204).end()
    }
    await publish(res, req.matchId)
  }),
)

export default router
