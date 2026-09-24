import jwt from 'jsonwebtoken'
import { config } from '../config.js'
import { HttpError } from './http.js'

export function signToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, { expiresIn: '30d' })
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    return { id: Number(payload.sub) }
  } catch {
    return null
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const user = token ? verifyToken(token) : null
  if (!user) return next(new HttpError(401, 'Sesión inválida o vencida.'))
  req.user = user
  next()
}
