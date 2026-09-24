import crypto from 'node:crypto'

const isProd = process.env.NODE_ENV === 'production'

let jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  if (isProd) {
    console.error('FATAL: falta la variable JWT_SECRET en producción.')
    process.exit(1)
  }
  jwtSecret = crypto.randomBytes(32).toString('hex')
  console.warn('[config] JWT_SECRET no definido: usando uno temporal (las sesiones se pierden al reiniciar).')
}

export const config = {
  isProd,
  // API_PORT (dev) tiene prioridad para no chocar con el PORT que inyectan algunos entornos; Railway define PORT.
  port: Number(process.env.API_PORT) || Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/relator',
  // Railway: la URL interna no usa SSL; la pública sí. PGSSL=true fuerza SSL.
  pgSsl: process.env.PGSSL === 'true',
  jwtSecret,
  // Clave para cifrar las API keys que guarda cada usuario. Por defecto deriva del JWT_SECRET.
  appSecret: process.env.APP_SECRET || jwtSecret,
  // Key global opcional de API-Football (cada usuario puede cargar la suya en Ajustes).
  apiFootballKey: process.env.API_FOOTBALL_KEY || '',
  // Si se define, el registro exige este código de invitación.
  registrationCode: process.env.REGISTRATION_CODE || '',
}
