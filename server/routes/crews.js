import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../db.js'
import { HttpError, idParam, parse, wrap } from '../lib/http.js'
import { ROLES } from '../lib/permissions.js'

// Equipos de transmisión guardados: grupos de personas con un rol, para sumar de una vez a un partido.
// Los cambios afectan a los partidos nuevos (o cuando lo agregás a mano); no reescriben partidos ya compartidos.
const router = Router()

async function ownedCrew(crewId, userId) {
  const { rows } = await query('SELECT * FROM crews WHERE id = $1 AND owner_id = $2', [crewId, userId])
  if (!rows[0]) throw new HttpError(404, 'Equipo de transmisión no encontrado.')
  return rows[0]
}

async function loadCrews(userId) {
  const [crews, members] = await Promise.all([
    query('SELECT * FROM crews WHERE owner_id = $1 ORDER BY is_default DESC, lower(name)', [userId]),
    query(
      `SELECT cm.crew_id, u.id AS user_id, u.name, u.email, cm.role
         FROM crew_members cm JOIN users u ON u.id = cm.user_id JOIN crews c ON c.id = cm.crew_id
        WHERE c.owner_id = $1 ORDER BY u.name`,
      [userId],
    ),
  ])
  return crews.rows.map((c) => ({ ...c, members: members.rows.filter((m) => m.crew_id === c.id) }))
}

const crewSchema = z.object({
  name: z.string().trim().min(1, 'poné un nombre').max(80),
  is_default: z.boolean().optional(),
})

// Marca un equipo como predeterminado (y desmarca el resto) dentro de una transacción.
const setDefault = async (client, userId, crewId) => {
  await client.query('UPDATE crews SET is_default = false WHERE owner_id = $1 AND id <> $2', [userId, crewId])
  await client.query('UPDATE crews SET is_default = true WHERE id = $1', [crewId])
}

router.get(
  '/',
  wrap(async (req, res) => {
    res.json({ crews: await loadCrews(req.user.id) })
  }),
)

router.post(
  '/',
  wrap(async (req, res) => {
    const data = parse(crewSchema, req.body)
    await tx(async (client) => {
      const { rows } = await client.query('INSERT INTO crews (owner_id, name) VALUES ($1, $2) RETURNING id', [
        req.user.id, data.name,
      ])
      if (data.is_default) await setDefault(client, req.user.id, rows[0].id)
    })
    res.status(201).json({ crews: await loadCrews(req.user.id) })
  }),
)

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const crew = await ownedCrew(idParam(req.params.id), req.user.id)
    const data = parse(crewSchema.partial(), req.body)
    await tx(async (client) => {
      if (data.name) await client.query('UPDATE crews SET name = $2 WHERE id = $1', [crew.id, data.name])
      if (data.is_default === true) await setDefault(client, req.user.id, crew.id)
      if (data.is_default === false) await client.query('UPDATE crews SET is_default = false WHERE id = $1', [crew.id])
    })
    res.json({ crews: await loadCrews(req.user.id) })
  }),
)

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const crew = await ownedCrew(idParam(req.params.id), req.user.id)
    await query('DELETE FROM crews WHERE id = $1', [crew.id])
    res.json({ crews: await loadCrews(req.user.id) })
  }),
)

const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email('email inválido'),
  role: z.enum(ROLES).default('editor'),
})

router.post(
  '/:id/members',
  wrap(async (req, res) => {
    const crew = await ownedCrew(idParam(req.params.id), req.user.id)
    const data = parse(memberSchema, req.body)
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [data.email])
    if (!rows[0]) throw new HttpError(404, 'No hay ningún usuario con ese email. Pedile que se registre primero.')
    if (rows[0].id === req.user.id) throw new HttpError(400, 'Vos ya sos el creador: no hace falta agregarte.')
    await query(
      `INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (crew_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [crew.id, rows[0].id, data.role],
    )
    res.status(201).json({ crews: await loadCrews(req.user.id) })
  }),
)

router.delete(
  '/:id/members/:userId',
  wrap(async (req, res) => {
    const crew = await ownedCrew(idParam(req.params.id), req.user.id)
    await query('DELETE FROM crew_members WHERE crew_id = $1 AND user_id = $2', [crew.id, idParam(req.params.userId, 'usuario')])
    res.json({ crews: await loadCrews(req.user.id) })
  }),
)

export default router
