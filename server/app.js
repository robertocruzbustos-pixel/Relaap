import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import { query } from './db.js'
import { requireAuth } from './lib/auth.js'
import { errorHandler, wrap } from './lib/http.js'
import authRoutes from './routes/auth.js'
import teamRoutes from './routes/teams.js'
import matchRoutes from './routes/matches.js'
import phraseRoutes from './routes/phrases.js'
import noteRoutes from './routes/notes.js'
import sportsRoutes from './routes/sports.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(here, '../client/dist')

export function createApp() {
  const app = express()
  app.set('trust proxy', 1) // Railway termina TLS en un proxy
  app.disable('x-powered-by')
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(express.json({ limit: '1mb' }))

  app.get(
    '/api/health',
    wrap(async (req, res) => {
      await query('SELECT 1')
      res.json({ ok: true })
    }),
  )

  app.use('/api/auth', authRoutes)
  app.use('/api/teams', requireAuth, teamRoutes)
  app.use('/api/matches', requireAuth, matchRoutes)
  app.use('/api/phrases', requireAuth, phraseRoutes)
  app.use('/api/notes', requireAuth, noteRoutes)
  app.use('/api/sports', requireAuth, sportsRoutes)
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))

  // En producción el mismo servicio sirve el frontend compilado.
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { maxAge: '1h', index: false }))
    app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')))
  }

  app.use(errorHandler)
  return app
}
