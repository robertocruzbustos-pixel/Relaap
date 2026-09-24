import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { config } from '../config.js'
import { query, tx } from '../db.js'
import { encrypt } from '../lib/crypto.js'
import { signToken, requireAuth } from '../lib/auth.js'
import { HttpError, parse, wrap } from '../lib/http.js'
import { DEFAULT_PHRASES } from '../lib/defaultPhrases.js'

const router = Router()

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
})

const email = z.string().trim().toLowerCase().email('email inválido').max(200)

const registerSchema = z.object({
  email,
  name: z.string().trim().min(2, 'mínimo 2 caracteres').max(80),
  password: z.string().min(8, 'mínimo 8 caracteres').max(200),
  code: z.string().optional(),
})

const loginSchema = z.object({ email, password: z.string().min(1).max(200) })

const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, has_api_key: Boolean(u.api_key_enc) })

router.post(
  '/register',
  limiter,
  wrap(async (req, res) => {
    const data = parse(registerSchema, req.body)
    if (config.registrationCode && data.code !== config.registrationCode) {
      throw new HttpError(403, 'Código de invitación incorrecto.')
    }
    const hash = await bcrypt.hash(data.password, 10)
    const user = await tx(async (client) => {
      const { rows } = await client.query(
        'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
        [data.email, data.name, hash],
      )
      const created = rows[0]
      // Banco de frases inicial para que la cuenta arranque con contenido.
      const values = []
      const params = [created.id]
      DEFAULT_PHRASES.forEach(([category, text], i) => {
        values.push(`($1, $${i * 2 + 2}, $${i * 2 + 3})`)
        params.push(category, text)
      })
      await client.query(`INSERT INTO phrases (owner_id, category, text) VALUES ${values.join(',')}`, params)
      return created
    })
    res.status(201).json({ token: signToken(user), user: publicUser(user) })
  }),
)

router.post(
  '/login',
  limiter,
  wrap(async (req, res) => {
    const data = parse(loginSchema, req.body)
    const { rows } = await query('SELECT * FROM users WHERE email = $1', [data.email])
    const user = rows[0]
    const ok = user && (await bcrypt.compare(data.password, user.password_hash))
    if (!ok) throw new HttpError(401, 'Email o contraseña incorrectos.')
    res.json({ token: signToken(user), user: publicUser(user) })
  }),
)

router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!rows[0]) throw new HttpError(401, 'Sesión inválida.')
    res.json({ user: publicUser(rows[0]) })
  }),
)

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  current_password: z.string().optional(),
  new_password: z.string().min(8, 'mínimo 8 caracteres').max(200).optional(),
  // null o '' borra la key guardada.
  api_key: z.string().trim().max(200).nullable().optional(),
})

router.patch(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const data = parse(updateSchema, req.body)
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id])
    const user = rows[0]
    if (!user) throw new HttpError(401, 'Sesión inválida.')

    const sets = []
    const params = []
    const add = (col, val) => {
      params.push(val)
      sets.push(`${col} = $${params.length}`)
    }

    if (data.name !== undefined) add('name', data.name)
    if (data.new_password) {
      const ok = data.current_password && (await bcrypt.compare(data.current_password, user.password_hash))
      if (!ok) throw new HttpError(400, 'La contraseña actual no es correcta.')
      add('password_hash', await bcrypt.hash(data.new_password, 10))
    }
    if (data.api_key !== undefined) add('api_key_enc', data.api_key ? encrypt(data.api_key) : null)

    if (sets.length === 0) return res.json({ user: publicUser(user) })
    params.push(user.id)
    const updated = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params)
    res.json({ user: publicUser(updated.rows[0]) })
  }),
)

export default router
