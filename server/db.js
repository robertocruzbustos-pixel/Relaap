import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from './config.js'

// Los INT8 (COUNT, etc.) llegan como número en vez de string.
pg.types.setTypeParser(20, (v) => Number(v))

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.pgSsl ? { rejectUnauthorized: false } : false,
  max: 10,
})

pool.on('error', (err) => console.error('[db] error en conexión inactiva:', err.message))

export const query = (text, params) => pool.query(text, params)

/** Ejecuta fn dentro de una transacción, con rollback automático ante error. */
export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export async function migrate() {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8')
  await pool.query(sql)
}
