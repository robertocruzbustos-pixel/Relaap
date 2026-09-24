// Trabajo en equipo: roles, autoría de eventos, equipos de transmisión guardados y chat.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { WebSocket } from 'ws'
import { migrate, pool } from '../db.js'
import { createApp } from '../app.js'
import { attachRealtime } from '../realtime.js'
import { can, canCreateEvent, canModifyEvent } from '../lib/permissions.js'

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

const register = async (label) =>
  (await call('POST', '/api/auth/register', { body: { email: `${label}${stamp}@test.com`, name: `Persona ${label}`, password: 'clave-segura-1' } })).body.token

const waitFor = async (cond, ms = 3000) => {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout esperando condición')
    await new Promise((r) => setTimeout(r, 25))
  }
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

test('matriz de permisos por rol', () => {
  assert.equal(can('editor', 'manage'), true)
  assert.equal(can('field', 'manage'), false)
  assert.equal(can('field', 'substitute'), true)
  assert.equal(can('commentator', 'substitute'), false)
  assert.equal(can('viewer', 'event'), false)
  assert.equal(can('viewer', 'chat'), true, 'todos los integrantes pueden chatear')
  assert.equal(can('editor', 'members'), false)
  assert.equal(canCreateEvent('field', 'goal'), true)
  assert.equal(canCreateEvent('commentator', 'goal'), false)
  assert.equal(canCreateEvent('commentator', 'note'), true)
  assert.equal(canModifyEvent('editor', { created_by: 1 }, 2), true)
  assert.equal(canModifyEvent('field', { created_by: 2 }, 2), true)
  assert.equal(canModifyEvent('field', { created_by: 1 }, 2), false)
  assert.equal(canModifyEvent('viewer', { created_by: 2 }, 2), false)
})

test('roles, autoría, chat y equipos de transmisión en un partido real', async (t) => {
  if (!dbUp) return t.skip('sin Postgres local (npm run dev:db)')

  const [ana, campo, comen, mira, editor] = await Promise.all(['ana', 'campo', 'comen', 'mira', 'editor'].map(register))
  const me = async (token) => (await call('GET', '/api/auth/me', { token })).body.user

  // --- Un partido con dos equipos manuales y plantel mínimo ---
  const mk = async (name) => {
    const team = (await call('POST', '/api/teams', { token: ana, body: { name } })).body.team
    const players = [{ name: 'Arq', number: 1, position: 'G' }, ...[2, 3, 4, 5].map((n) => ({ name: `D${n}`, number: n, position: 'D' })),
      ...[6, 7, 8, 10].map((n) => ({ name: `M${n}`, number: n, position: 'M' })), ...[9, 11].map((n) => ({ name: `F${n}`, number: n, position: 'F' })),
      { name: 'Suplente', number: 12, position: 'M' }]
    await call('POST', `/api/teams/${team.id}/players`, { token: ana, body: { players } })
    return team
  }
  const home = await mk(`Local ${stamp}`)
  const away = await mk(`Visita ${stamp}`)

  // --- Equipo de transmisión guardado ---
  const crew = await call('POST', '/api/crews', { token: ana, body: { name: 'Cabina titular' } })
  assert.equal(crew.status, 201)
  const crewId = crew.body.crews[0].id
  assert.equal(crew.body.crews[0].is_default, false)

  const emailOf = async (token) => (await me(token)).email
  for (const [token, role] of [[campo, 'field'], [comen, 'commentator'], [mira, 'viewer']]) {
    const r = await call('POST', `/api/crews/${crewId}/members`, { token: ana, body: { email: await emailOf(token), role } })
    assert.equal(r.status, 201)
  }
  assert.equal(
    (await call('POST', `/api/crews/${crewId}/members`, { token: ana, body: { email: await emailOf(ana) } })).status,
    400,
    'el creador no se agrega a su propio equipo',
  )
  assert.equal((await call('POST', `/api/crews/${crewId}/members`, { token: ana, body: { email: 'nadie@nada.com' } })).status, 404)
  assert.equal((await call('POST', `/api/crews/${crewId}/members`, { token: ana, body: { email: await emailOf(campo), role: 'jefe' } })).status, 400)
  // Los equipos son privados de cada usuario
  assert.equal((await call('GET', '/api/crews', { token: campo })).body.crews.length, 0)
  assert.equal((await call('PATCH', `/api/crews/${crewId}`, { token: campo, body: { name: 'x' } })).status, 404)

  // Predeterminado: un partido nuevo ya nace con todo el equipo
  const setDef = await call('PATCH', `/api/crews/${crewId}`, { token: ana, body: { is_default: true } })
  assert.equal(setDef.body.crews[0].is_default, true)
  const second = await call('POST', '/api/crews', { token: ana, body: { name: 'Otro', is_default: true } })
  assert.equal(second.body.crews.filter((c) => c.is_default).length, 1, 'solo uno puede ser predeterminado')
  await call('PATCH', `/api/crews/${crewId}`, { token: ana, body: { is_default: true } })

  const created = await call('POST', '/api/matches', { token: ana, body: { home: { team_id: home.id }, away: { team_id: away.id } } })
  const matchId = created.body.match.id
  assert.equal(created.body.members.length, 3)
  assert.deepEqual(created.body.members.map((m) => m.role).sort(), ['commentator', 'field', 'viewer'])

  // Sumar un equipo a mano a un partido existente (idempotente) y con otro rol asignado aparte
  const again = await call('POST', `/api/matches/${matchId}/members/crew`, { token: ana, body: { crew_id: crewId } })
  assert.equal(again.body.members.length, 3)
  assert.equal((await call('POST', `/api/matches/${matchId}/members/crew`, { token: campo, body: { crew_id: crewId } })).status, 403)
  assert.equal((await call('POST', `/api/matches/${matchId}/members/crew`, { token: ana, body: { crew_id: 999999 } })).status, 404)
  await call('POST', `/api/matches/${matchId}/members`, { token: ana, body: { email: await emailOf(editor), role: 'editor' } })

  // --- Tiempo real: el comentarista escucha todo ---
  const messages = []
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${comen}`)
  await new Promise((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())))
  ws.send(JSON.stringify({ type: 'subscribe', matchId }))
  await waitFor(() => messages.some((m) => m.type === 'presence'))

  // --- Reloj: solo owner/editor ---
  assert.equal((await call('POST', `/api/matches/${matchId}/clock`, { token: campo, body: { action: 'start' } })).status, 403)
  assert.equal((await call('POST', `/api/matches/${matchId}/clock`, { token: comen, body: { action: 'start' } })).status, 403)
  assert.equal((await call('POST', `/api/matches/${matchId}/clock`, { token: editor, body: { action: 'start' } })).status, 200)

  // --- Campo: carga eventos y cambios, pero no toca alineaciones ni el reloj ---
  const players = created.body.players
  const fw = players.find((p) => p.side === 'home' && p.position === 'F' && p.is_starter)
  const goal = await call('POST', `/api/matches/${matchId}/events`, { token: campo, body: { type: 'goal', match_player_id: fw.id } })
  assert.equal(goal.status, 201)
  const ev = goal.body.events.find((e) => e.type === 'goal')
  assert.equal(ev.author_name, 'Persona campo', 'cada evento indica quién lo cargó')
  assert.equal(ev.created_by, (await me(campo)).id)
  assert.equal(goal.body.match.home_score, 1)
  await waitFor(() => messages.some((m) => m.type === 'bundle' && m.bundle.events.some((e) => e.author_name === 'Persona campo')))

  const bench = players.find((p) => p.side === 'home' && !p.is_starter)
  const out = players.find((p) => p.side === 'home' && p.position === 'M' && p.is_starter)
  assert.equal((await call('POST', `/api/matches/${matchId}/substitution`, { token: campo, body: { out_id: out.id, in_id: bench.id } })).status, 201)
  assert.equal((await call('PATCH', `/api/matches/${matchId}/players/${fw.id}`, { token: campo, body: { x: 50, y: 50 } })).status, 403, 'campo no mueve fichas')
  assert.equal((await call('POST', `/api/matches/${matchId}/lineup`, { token: campo, body: { side: 'home', formation: '4-4-2' } })).status, 403)
  assert.equal((await call('PATCH', `/api/matches/${matchId}`, { token: campo, body: { venue: 'x' } })).status, 403)

  // --- Comentarista: solo notas ---
  const note = await call('POST', `/api/matches/${matchId}/events`, { token: comen, body: { type: 'note', description: 'Dato: récord de asistencia' } })
  assert.equal(note.status, 201)
  const noteEv = note.body.events.find((e) => e.type === 'note')
  assert.equal(noteEv.author_name, 'Persona comen')
  assert.equal((await call('POST', `/api/matches/${matchId}/events`, { token: comen, body: { type: 'goal', side: 'away' } })).status, 403)
  assert.equal((await call('POST', `/api/matches/${matchId}/substitution`, { token: comen, body: { out_id: out.id, in_id: bench.id } })).status, 403)

  // --- Solo lectura ---
  assert.equal((await call('POST', `/api/matches/${matchId}/events`, { token: mira, body: { type: 'note', description: 'x' } })).status, 403)
  assert.equal((await call('GET', `/api/matches/${matchId}`, { token: mira })).body.role, 'viewer')

  // --- Editar/borrar: cada uno lo suyo; el editor todo ---
  assert.equal((await call('DELETE', `/api/matches/${matchId}/events/${ev.id}`, { token: comen })).status, 403, 'no se borra lo de otro')
  assert.equal((await call('PATCH', `/api/matches/${matchId}/events/${ev.id}`, { token: comen, body: { description: 'x' } })).status, 403)
  assert.equal((await call('PATCH', `/api/matches/${matchId}/events/${noteEv.id}`, { token: comen, body: { description: 'Dato corregido' } })).status, 200)
  assert.equal(
    (await call('PATCH', `/api/matches/${matchId}/events/${noteEv.id}`, { token: comen, body: { type: 'goal', side: 'away' } })).status,
    403,
    'no se puede convertir una nota en gol',
  )
  assert.equal((await call('PATCH', `/api/matches/${matchId}/events/${ev.id}`, { token: campo, body: { description: 'de cabeza' } })).status, 200)
  assert.equal((await call('PATCH', `/api/matches/${matchId}/events/${ev.id}`, { token: campo, body: { side: 'away' } })).status, 403, 'campo no reasigna goles')
  assert.equal((await call('DELETE', `/api/matches/${matchId}/events/${noteEv.id}`, { token: comen })).status, 200)
  const del = await call('DELETE', `/api/matches/${matchId}/events/${ev.id}`, { token: editor })
  assert.equal(del.status, 200)
  assert.equal(del.body.match.home_score, 0, 'el editor borra cualquiera y el marcador se recalcula')

  // --- Chat: lo pueden usar todos los integrantes y llega en vivo ---
  messages.length = 0
  const sent = await call('POST', `/api/matches/${matchId}/messages`, { token: campo, body: { body: 'Gol de cabeza, minuto 23' } })
  assert.equal(sent.status, 201)
  assert.equal(sent.body.message.author_name, 'Persona campo')
  await waitFor(() => messages.some((m) => m.type === 'message' && m.message.body === 'Gol de cabeza, minuto 23'))
  assert.equal((await call('POST', `/api/matches/${matchId}/messages`, { token: mira, body: { body: 'Recibido' } })).status, 201)
  assert.equal((await call('POST', `/api/matches/${matchId}/messages`, { token: ana, body: { body: '   ' } })).status, 400)
  assert.equal((await call('POST', `/api/matches/${matchId}/messages`, { token: ana, body: { body: 'x'.repeat(1001) } })).status, 400)
  const history = await call('GET', `/api/matches/${matchId}/messages`, { token: comen })
  assert.deepEqual(history.body.messages.map((m) => m.body), ['Gol de cabeza, minuto 23', 'Recibido'])
  // Quien no participa no ve ni escribe
  const intruso = await register('intruso')
  assert.equal((await call('GET', `/api/matches/${matchId}/messages`, { token: intruso })).status, 404)
  assert.equal((await call('POST', `/api/matches/${matchId}/messages`, { token: intruso, body: { body: 'hola' } })).status, 404)

  // --- Gestión de integrantes: solo el creador ---
  assert.equal((await call('POST', `/api/matches/${matchId}/members`, { token: editor, body: { email: await emailOf(intruso), role: 'viewer' } })).status, 403)
  assert.equal((await call('DELETE', `/api/matches/${matchId}`, { token: editor })).status, 403)

  // Cambiar el rol de alguien lo habilita al instante
  await call('POST', `/api/matches/${matchId}/members`, { token: ana, body: { email: await emailOf(mira), role: 'field' } })
  assert.equal((await call('POST', `/api/matches/${matchId}/events`, { token: mira, body: { type: 'corner', side: 'home' } })).status, 201)

  // --- Equipos: quitar integrantes / borrar el equipo no toca partidos ya compartidos ---
  const afterRemove = await call('DELETE', `/api/crews/${crewId}/members/${(await me(mira)).id}`, { token: ana })
  assert.equal(afterRemove.body.crews.find((c) => c.id === crewId).members.length, 2)
  await call('DELETE', `/api/crews/${crewId}`, { token: ana })
  assert.equal((await call('GET', `/api/matches/${matchId}`, { token: campo })).status, 200, 'el partido conserva a sus integrantes')

  // Borrar el partido limpia mensajes en cascada
  await call('DELETE', `/api/matches/${matchId}`, { token: ana })
  const left = await pool.query('SELECT COUNT(*) AS n FROM match_messages WHERE match_id = $1', [matchId])
  assert.equal(left.rows[0].n, 0)
  ws.close()
})
