import http from 'node:http'
import { config } from './config.js'
import { migrate, pool } from './db.js'
import { createApp } from './app.js'
import { attachRealtime } from './realtime.js'
import { resumeFollows } from './lib/liveSync.js'

async function main() {
  await waitForDb()
  await migrate()

  const server = http.createServer(createApp())
  attachRealtime(server)
  await resumeFollows()
  server.listen(config.port, () => {
    console.log(`[server] escuchando en el puerto ${config.port} (${config.isProd ? 'producción' : 'desarrollo'})`)
  })

  const shutdown = (signal) => {
    console.log(`[server] ${signal} recibido, cerrando...`)
    server.close(() => pool.end().finally(() => process.exit(0)))
    setTimeout(() => process.exit(1), 10_000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// La base puede tardar unos segundos en estar lista (arranque en frío en Railway).
async function waitForDb(retries = 20) {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (err) {
      if (i === retries) throw err
      console.warn(`[db] sin conexión (${err.code ?? err.message}), reintento ${i}/${retries}...`)
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

main().catch((err) => {
  console.error('[server] error fatal al iniciar:', err)
  process.exit(1)
})
