// Postgres local para desarrollo (sin Docker ni instalación): npm run dev:db
// Los datos se guardan fuera del repo (y fuera de OneDrive) en ~/.relator-pro/pgdata.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const dir = process.env.PGDATA_DIR || path.join(os.homedir(), '.relator-pro', 'pgdata')
const port = Number(process.env.PGPORT) || 5432
const DB_NAME = 'relator'

const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  // UTF8 explícito: en Windows el default sería WIN1252 y fallaría con caracteres fuera de Latin-1.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
})

if (!fs.existsSync(path.join(dir, 'PG_VERSION'))) {
  console.log(`[dev-db] inicializando cluster en ${dir} ...`)
  await pg.initialise()
}

await pg.start()
try {
  await pg.createDatabase(DB_NAME)
  console.log(`[dev-db] base "${DB_NAME}" creada.`)
} catch {
  // ya existía
}
console.log(`[dev-db] listo → postgres://postgres:postgres@localhost:${port}/${DB_NAME}  (Ctrl+C para detener)`)

const stop = async () => {
  await pg.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
