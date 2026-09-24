import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../db.js'
import { HttpError, idParam, parse, wrap } from '../lib/http.js'

const router = Router()

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color inválido (#rrggbb)')
const optText = (max) => z.string().trim().max(max).nullable().optional()

const teamSchema = z.object({
  name: z.string().trim().min(1, 'requerido').max(100),
  short_name: optText(10),
  color: color.optional(),
  logo_url: optText(500),
  coach: optText(100),
  city: optText(100),
  stadium: optText(100),
  notes: z.string().max(5000).optional(),
})

const playerSchema = z.object({
  name: z.string().trim().min(1, 'requerido').max(100),
  number: z.number().int().min(0).max(99).nullable().optional(),
  position: z.enum(['G', 'D', 'M', 'F']).optional(),
  photo_url: optText(500),
  notes: z.string().max(5000).optional(),
})

async function ownedTeam(teamId, userId) {
  const { rows } = await query('SELECT * FROM teams WHERE id = $1 AND owner_id = $2', [teamId, userId])
  if (!rows[0]) throw new HttpError(404, 'Equipo no encontrado.')
  return rows[0]
}

// Arma "col = $n" dinámico sólo con las claves presentes en el body.
function buildUpdate(data, allowed, startIndex = 1) {
  const sets = []
  const params = []
  for (const key of allowed) {
    if (data[key] !== undefined) {
      params.push(data[key])
      sets.push(`${key} = $${startIndex + params.length - 1}`)
    }
  }
  return { sets, params }
}

const TEAM_FIELDS = ['name', 'short_name', 'color', 'logo_url', 'coach', 'city', 'stadium', 'notes']
const PLAYER_FIELDS = ['name', 'number', 'position', 'photo_url', 'notes']

router.get(
  '/',
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT t.*, (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS player_count
         FROM teams t WHERE t.owner_id = $1 ORDER BY lower(t.name)`,
      [req.user.id],
    )
    res.json({ teams: rows })
  }),
)

router.post(
  '/',
  wrap(async (req, res) => {
    const data = parse(teamSchema, req.body)
    const { rows } = await query(
      `INSERT INTO teams (owner_id, name, short_name, color, logo_url, coach, city, stadium, notes)
       VALUES ($1,$2,$3,COALESCE($4,'#2563eb'),$5,$6,$7,$8,COALESCE($9,''))
       RETURNING *`,
      [req.user.id, data.name, data.short_name ?? null, data.color ?? null, data.logo_url ?? null,
        data.coach ?? null, data.city ?? null, data.stadium ?? null, data.notes ?? null],
    )
    res.status(201).json({ team: rows[0] })
  }),
)

router.get(
  '/:id',
  wrap(async (req, res) => {
    const team = await ownedTeam(idParam(req.params.id), req.user.id)
    const { rows: players } = await query(
      `SELECT * FROM players WHERE team_id = $1
        ORDER BY array_position(ARRAY['G','D','M','F'], position), number NULLS LAST, name`,
      [team.id],
    )
    res.json({ team, players })
  }),
)

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const team = await ownedTeam(idParam(req.params.id), req.user.id)
    const data = parse(teamSchema.partial(), req.body)
    const { sets, params } = buildUpdate(data, TEAM_FIELDS)
    if (sets.length === 0) return res.json({ team })
    params.push(team.id)
    const { rows } = await query(`UPDATE teams SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
    res.json({ team: rows[0] })
  }),
)

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const team = await ownedTeam(idParam(req.params.id), req.user.id)
    await query('DELETE FROM teams WHERE id = $1', [team.id])
    res.status(204).end()
  }),
)

// ----- Jugadores -----

router.post(
  '/:id/players',
  wrap(async (req, res) => {
    const team = await ownedTeam(idParam(req.params.id), req.user.id)
    // Acepta un jugador o una lista (carga masiva).
    const list = Array.isArray(req.body?.players) ? req.body.players : [req.body]
    if (list.length === 0 || list.length > 100) throw new HttpError(400, 'Enviá entre 1 y 100 jugadores.')
    const items = list.map((p) => parse(playerSchema, p))
    const created = await tx(async (client) => {
      const out = []
      for (const p of items) {
        const { rows } = await client.query(
          `INSERT INTO players (team_id, owner_id, name, number, position, photo_url, notes)
           VALUES ($1,$2,$3,$4,COALESCE($5,'M'),$6,COALESCE($7,'')) RETURNING *`,
          [team.id, req.user.id, p.name, p.number ?? null, p.position ?? null, p.photo_url ?? null, p.notes ?? null],
        )
        out.push(rows[0])
      }
      return out
    })
    res.status(201).json({ players: created })
  }),
)

router.patch(
  '/:id/players/:playerId',
  wrap(async (req, res) => {
    const team = await ownedTeam(idParam(req.params.id), req.user.id)
    const playerId = idParam(req.params.playerId, 'jugador')
    const data = parse(playerSchema.partial(), req.body)
    const { sets, params } = buildUpdate(data, PLAYER_FIELDS)
    if (sets.length === 0) throw new HttpError(400, 'Nada para actualizar.')
    params.push(playerId, team.id)
    const { rows } = await query(
      `UPDATE players SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND team_id = $${params.length} RETURNING *`,
      params,
    )
    if (!rows[0]) throw new HttpError(404, 'Jugador no encontrado.')
    res.json({ player: rows[0] })
  }),
)

router.delete(
  '/:id/players/:playerId',
  wrap(async (req, res) => {
    const team = await ownedTeam(idParam(req.params.id), req.user.id)
    await query('DELETE FROM players WHERE id = $1 AND team_id = $2', [idParam(req.params.playerId, 'jugador'), team.id])
    res.status(204).end()
  }),
)

export default router
