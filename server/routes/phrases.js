import { Router } from 'express'
import { z } from 'zod'
import { query } from '../db.js'
import { HttpError, idParam, parse, wrap } from '../lib/http.js'
import { PHRASE_CATEGORIES } from '../lib/defaultPhrases.js'

const router = Router()

const schema = z.object({
  category: z.enum(PHRASE_CATEGORIES).optional(),
  text: z.string().trim().min(1, 'requerido').max(1000),
  favorite: z.boolean().optional(),
})

router.get(
  '/',
  wrap(async (req, res) => {
    const { rows } = await query(
      'SELECT * FROM phrases WHERE owner_id = $1 ORDER BY favorite DESC, uses DESC, id DESC',
      [req.user.id],
    )
    res.json({ phrases: rows, categories: PHRASE_CATEGORIES })
  }),
)

router.post(
  '/',
  wrap(async (req, res) => {
    const data = parse(schema, req.body)
    const { rows } = await query(
      `INSERT INTO phrases (owner_id, category, text, favorite) VALUES ($1, COALESCE($2,'otras'), $3, COALESCE($4,false)) RETURNING *`,
      [req.user.id, data.category ?? null, data.text, data.favorite ?? null],
    )
    res.status(201).json({ phrase: rows[0] })
  }),
)

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const data = parse(schema.partial(), req.body)
    const { rows } = await query(
      `UPDATE phrases SET category = COALESCE($3, category), text = COALESCE($4, text), favorite = COALESCE($5, favorite)
        WHERE id = $1 AND owner_id = $2 RETURNING *`,
      [idParam(req.params.id), req.user.id, data.category ?? null, data.text ?? null, data.favorite ?? null],
    )
    if (!rows[0]) throw new HttpError(404, 'Frase no encontrada.')
    res.json({ phrase: rows[0] })
  }),
)

// Cuenta un uso (para ordenar por las más usadas).
router.post(
  '/:id/use',
  wrap(async (req, res) => {
    const { rows } = await query(
      'UPDATE phrases SET uses = uses + 1 WHERE id = $1 AND owner_id = $2 RETURNING *',
      [idParam(req.params.id), req.user.id],
    )
    if (!rows[0]) throw new HttpError(404, 'Frase no encontrada.')
    res.json({ phrase: rows[0] })
  }),
)

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await query('DELETE FROM phrases WHERE id = $1 AND owner_id = $2', [idParam(req.params.id), req.user.id])
    res.status(204).end()
  }),
)

export default router
