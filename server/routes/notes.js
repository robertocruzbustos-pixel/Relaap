import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { HttpError, idParam, parse, wrap } from '../lib/http.js'
import { getMatchRole } from '../lib/access.js'

const router = Router()

const schema = z.object({
  title: z.string().trim().max(200).optional(),
  body: z.string().max(20000).optional(),
  pinned: z.boolean().optional(),
  match_id: z.number().int().positive().nullable().optional(),
})

// Las notas son privadas de cada usuario; pueden asociarse a un partido al que tenga acceso.
async function checkMatch(matchId, userId) {
  if (matchId && !(await getMatchRole(matchId, userId))) throw new HttpError(400, 'Partido inválido.')
}

router.get(
  '/',
  wrap(async (req, res) => {
    const matchId = req.query.match_id ? idParam(req.query.match_id, 'partido') : null
    const { rows } = await query(
      `SELECT n.*, m.home_name, m.away_name FROM notes n LEFT JOIN matches m ON m.id = n.match_id
        WHERE n.owner_id = $1 AND ($2::int IS NULL OR n.match_id = $2 OR n.pinned)
        ORDER BY n.pinned DESC, n.updated_at DESC`,
      [req.user.id, matchId],
    )
    res.json({ notes: rows })
  }),
)

router.post(
  '/',
  wrap(async (req, res) => {
    const data = parse(schema, req.body)
    await checkMatch(data.match_id, req.user.id)
    const { rows } = await query(
      `INSERT INTO notes (owner_id, match_id, title, body, pinned)
       VALUES ($1,$2,COALESCE($3,''),COALESCE($4,''),COALESCE($5,false)) RETURNING *`,
      [req.user.id, data.match_id ?? null, data.title ?? null, data.body ?? null, data.pinned ?? null],
    )
    res.status(201).json({ note: rows[0] })
  }),
)

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const data = parse(schema.partial(), req.body)
    await checkMatch(data.match_id, req.user.id)
    const matchProvided = data.match_id !== undefined
    const { rows } = await query(
      `UPDATE notes SET title = COALESCE($3, title), body = COALESCE($4, body), pinned = COALESCE($5, pinned),
              match_id = CASE WHEN $6 THEN $7 ELSE match_id END, updated_at = now()
        WHERE id = $1 AND owner_id = $2 RETURNING *`,
      [idParam(req.params.id), req.user.id, data.title ?? null, data.body ?? null, data.pinned ?? null,
        matchProvided, data.match_id ?? null],
    )
    if (!rows[0]) throw new HttpError(404, 'Nota no encontrada.')
    res.json({ note: rows[0] })
  }),
)

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM notes WHERE id = $1 AND owner_id = $2', [idParam(req.params.id), req.user.id])
    res.status(204).end()
  }),
)

export default router
