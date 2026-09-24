import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Express 4 no captura promesas rechazadas: este wrapper las manda al error handler. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

/** Valida con zod y lanza 400 con un mensaje legible. */
export function parse(schema, data) {
  const result = schema.safeParse(data)
  if (!result.success) throw zodToHttp(result.error)
  return result.data
}

function zodToHttp(err) {
  const first = err.issues[0]
  const field = first?.path?.join('.') || 'datos'
  return new HttpError(400, `${field}: ${first?.message ?? 'inválido'}`)
}

export function idParam(value, label = 'id') {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} inválido`)
  return n
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message })
  if (err instanceof ZodError) return res.status(400).json({ error: zodToHttp(err).message })
  if (err?.name === 'ClockError') return res.status(400).json({ error: err.message })
  if (err?.code === '23505') return res.status(409).json({ error: 'Ya existe un registro con esos datos.' })
  console.error('[error]', err)
  res.status(500).json({ error: 'Error interno del servidor.' })
}
