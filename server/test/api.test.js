// Test de integración: requiere Postgres (npm run dev:db). Se saltea si no hay conexión.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { WebSocket } from 'ws'
import { migrate, pool } from '../db.js'
import { createApp } from '../app.js'
import { attachRealtime } from '../realtime.js'

let server
let wss
let base
let dbUp = false
const stamp = Date.now()

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

before(async () => {
  try {
    await pool.query('SELECT 1')
    dbUp = true
  } catch {
    return
  }
  await migrate()
  server = http.createServer(createApp())
  wss = attachRealtime(server)
  await new Promise((r) => server.listen(0, r))
  base = `http://localhost:${server.address().port}`
})

after(async () => {
  wss?.clients.forEach((c) => c.terminate())
  wss?.close()
  server?.close()
  server?.closeAllConnections()
  await pool.end()
})

test('flujo completo: cuentas, equipos, partido en vivo, colaboración y tiempo real', async (t) => {
  if (!dbUp) return t.skip('sin Postgres local (npm run dev:db)')
  // --- Cuentas ---
  const reg = await call('POST', '/api/auth/register', {
    body: { email: `ana${stamp}@test.com`, name: 'Ana Relatora', password: 'clave-segura-1' },
  })
  assert.equal(reg.status, 201)
  const ana = reg.body.token

  const dup = await call('POST', '/api/auth/register', {
    body: { email: `ana${stamp}@test.com`, name: 'Otra', password: 'clave-segura-1' },
  })
  assert.equal(dup.status, 409)

  const bad = await call('POST', '/api/auth/login', { body: { email: `ana${stamp}@test.com`, password: 'incorrecta' } })
  assert.equal(bad.status, 401)

  assert.equal((await call('GET', '/api/teams')).status, 401, 'sin token no entra')

  const luis = (
    await call('POST', '/api/auth/register', {
      body: { email: `luis${stamp}@test.com`, name: 'Luis Comentarista', password: 'clave-segura-2' },
    })
  ).body.token

  // --- Frases iniciales ---
  const phrases = await call('GET', '/api/phrases', { token: ana })
  assert.ok(phrases.body.phrases.length >= 20, 'el banco de frases viene precargado')

  // --- Equipos y jugadores ---
  const mkTeam = async (name, color) => {
    const { body } = await call('POST', '/api/teams', { token: ana, body: { name, color } })
    const players = [
      { name: 'Arquero', number: 1, position: 'G' },
      ...[2, 3, 4, 5, 12].map((n) => ({ name: `Def ${n}`, number: n, position: 'D' })),
      ...[6, 7, 8, 10, 14].map((n) => ({ name: `Med ${n}`, number: n, position: 'M' })),
      ...[9, 11, 20].map((n) => ({ name: `Del ${n}`, number: n, position: 'F' })),
    ]
    const created = await call('POST', `/api/teams/${body.team.id}/players`, { token: ana, body: { players } })
    assert.equal(created.status, 201)
    return body.team
  }
  const home = await mkTeam('Club Atlético Prueba', '#1d4ed8')
  const away = await mkTeam('Deportivo Ejemplo', '#dc2626')

  // Otro usuario no ve mis equipos
  assert.equal((await call('GET', `/api/teams/${home.id}`, { token: luis })).status, 404)

  // --- Partido ---
  const created = await call('POST', '/api/matches', {
    token: ana,
    body: {
      home: { team_id: home.id, formation: '4-3-3' },
      away: { team_id: away.id, formation: '4-4-2' },
      competition: 'Liga Prueba',
    },
  })
  assert.equal(created.status, 201)
  const matchId = created.body.match.id
  const starters = (side) => created.body.players.filter((p) => p.side === side && p.is_starter)
  assert.equal(starters('home').length, 11)
  assert.equal(starters('away').length, 11)
  assert.ok(starters('home').every((p) => p.on_pitch && p.x !== null && p.y !== null))

  // Formación inválida
  assert.equal(
    (await call('POST', `/api/matches/${matchId}/lineup`, { token: ana, body: { side: 'home', formation: '9-9-9' } })).status,
    400,
  )

  // --- Tiempo real: el colaborador se suscribe antes de recibir permisos? No: primero se le da acceso ---
  assert.equal((await call('GET', `/api/matches/${matchId}`, { token: luis })).status, 404, 'sin acceso no ve el partido')
  const noUser = await call('POST', `/api/matches/${matchId}/members`, { token: ana, body: { email: 'nadie@nada.com' } })
  assert.equal(noUser.status, 404)
  const shared = await call('POST', `/api/matches/${matchId}/members`, {
    token: ana,
    body: { email: `luis${stamp}@test.com`, role: 'editor' },
  })
  assert.equal(shared.status, 201)
  assert.equal(shared.body.members.length, 1)

  const messages = []
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${luis}`)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))
  ws.send(JSON.stringify({ type: 'subscribe', matchId }))
  await waitFor(() => messages.some((m) => m.type === 'presence'))

  // --- Reloj ---
  const start = await call('POST', `/api/matches/${matchId}/clock`, { token: ana, body: { action: 'start' } })
  assert.equal(start.body.match.status, 'live')
  assert.equal(start.body.match.period, '1T')
  assert.ok(start.body.match.clock_started_at)
  assert.ok(start.body.events.some((e) => e.type === 'period' && e.description === 'Comienza el partido'))
  await waitFor(() => messages.some((m) => m.type === 'bundle' && m.bundle.match.status === 'live'))

  // --- Eventos: goles, tarjetas y cambios ---
  const homeFw = starters('home').find((p) => p.position === 'F')
  const awayGk = starters('away').find((p) => p.position === 'G')
  await call('POST', `/api/matches/${matchId}/clock`, { token: ana, body: { action: 'set', seconds: 23 * 60 + 40 } })

  let r = await call('POST', `/api/matches/${matchId}/events`, {
    token: luis, // el colaborador editor también puede cargar
    body: { type: 'goal', match_player_id: homeFw.id },
  })
  assert.equal(r.status, 201)
  assert.equal(r.body.match.home_score, 1)
  const goal = r.body.events.find((e) => e.type === 'goal')
  assert.match(goal.minute_label, /^24'$/)
  assert.equal(goal.player_name, homeFw.name)
  assert.equal(r.body.players.find((p) => p.id === homeFw.id).goals, 1)

  r = await call('POST', `/api/matches/${matchId}/events`, { token: ana, body: { type: 'own_goal', match_player_id: awayGk.id } })
  assert.equal(r.body.match.home_score, 2, 'el autogol del visitante suma al local')

  r = await call('POST', `/api/matches/${matchId}/events`, { token: ana, body: { type: 'goal' } })
  assert.equal(r.status, 400, 'un gol necesita equipo o jugador')

  r = await call('POST', `/api/matches/${matchId}/events`, { token: ana, body: { type: 'red', match_player_id: awayGk.id } })
  const redPlayer = r.body.players.find((p) => p.id === awayGk.id)
  assert.equal(redPlayer.red, true)
  assert.equal(redPlayer.on_pitch, false, 'el expulsado sale de la cancha')

  // Cambio en el local
  const bench = created.body.players.find((p) => p.side === 'home' && !p.is_starter)
  const out = starters('home').find((p) => p.position === 'M')
  r = await call('POST', `/api/matches/${matchId}/substitution`, { token: ana, body: { out_id: out.id, in_id: bench.id } })
  assert.equal(r.status, 201)
  const inNow = r.body.players.find((p) => p.id === bench.id)
  const outNow = r.body.players.find((p) => p.id === out.id)
  assert.equal(inNow.on_pitch, true)
  assert.equal(inNow.x, out.x, 'el que entra hereda la posición')
  assert.equal(outNow.on_pitch, false)
  assert.ok(r.body.events.some((e) => e.type === 'substitution' && e.description === `Entra ${bench.name}, sale ${out.name}`))
  // No se puede meter a alguien que ya está en cancha
  assert.equal(
    (await call('POST', `/api/matches/${matchId}/substitution`, { token: ana, body: { out_id: inNow.id, in_id: bench.id } })).status,
    400,
  )

  // Borrar el primer gol recalcula el marcador
  r = await call('DELETE', `/api/matches/${matchId}/events/${goal.id}`, { token: ana })
  assert.equal(r.body.match.home_score, 1)
  assert.equal(r.body.players.find((p) => p.id === homeFw.id).goals, 0)

  // --- Movimiento de jugador (drag) se difunde liviano ---
  messages.length = 0
  const mv = await call('PATCH', `/api/matches/${matchId}/players/${homeFw.id}`, { token: ana, body: { x: 61.5, y: 33.3 } })
  assert.equal(mv.body.player.x, 61.5)
  await waitFor(() => messages.some((m) => m.type === 'player' && m.player.id === homeFw.id && m.player.x === 61.5))
  assert.equal((await call('PATCH', `/api/matches/${matchId}/players/${homeFw.id}`, { token: ana, body: { x: 500 } })).status, 400)

  // --- Cierre ---
  r = await call('POST', `/api/matches/${matchId}/clock`, { token: ana, body: { action: 'period', period: 'FIN' } })
  assert.equal(r.body.match.status, 'finished')
  assert.equal(r.body.match.clock_started_at, null)
  assert.equal((await call('POST', `/api/matches/${matchId}/clock`, { token: ana, body: { action: 'start' } })).status, 400)

  // --- Permisos: solo lectura y dueño ---
  await call('POST', `/api/matches/${matchId}/members`, { token: ana, body: { email: `luis${stamp}@test.com`, role: 'viewer' } })
  const denied = await call('POST', `/api/matches/${matchId}/events`, { token: luis, body: { type: 'note', description: 'x' } })
  assert.equal(denied.status, 403)
  assert.equal((await call('DELETE', `/api/matches/${matchId}`, { token: luis })).status, 403)

  // --- Listado ---
  const list = await call('GET', '/api/matches?status=finished', { token: luis })
  assert.equal(list.body.matches.length, 1)
  assert.equal(list.body.matches[0].role, 'viewer')

  // --- Notas ---
  const note = await call('POST', '/api/notes', { token: ana, body: { title: 'Ojo', body: 'Cumple 100 partidos', match_id: matchId } })
  assert.equal(note.status, 201)
  assert.equal((await call('POST', '/api/notes', { token: luis, body: { title: 'x', match_id: 999999 } })).status, 400)

  // --- Ajustes: API key cifrada y sin fuga ---
  const me = await call('PATCH', '/api/auth/me', { token: ana, body: { api_key: 'abc123-secret-key' } })
  assert.equal(me.body.user.has_api_key, true)
  assert.ok(!JSON.stringify(me.body).includes('abc123'))
  const { rows } = await pool.query('SELECT api_key_enc FROM users WHERE email = $1', [`ana${stamp}@test.com`])
  assert.ok(!rows[0].api_key_enc.includes('abc123'), 'la key se guarda cifrada')

  // Sin key global y con key inválida el proxy deportivo no rompe: devuelve error claro
  const sports = await call('GET', '/api/sports/status', { token: luis })
  assert.equal(sports.body.configured, false)
  assert.equal((await call('GET', '/api/sports/fixtures', { token: luis })).status, 503)

  // --- Borrado en cascada ---
  assert.equal((await call('DELETE', `/api/matches/${matchId}`, { token: ana })).status, 204)
  const left = await pool.query('SELECT COUNT(*) AS n FROM match_players WHERE match_id = $1', [matchId])
  assert.equal(left.rows[0].n, 0)

  ws.close()
  t.diagnostic('flujo completo OK')
})

async function waitFor(cond, ms = 3000) {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout esperando condición')
    await new Promise((r) => setTimeout(r, 25))
  }
}
