// Prueba la integración con API-Football contra un servidor simulado (payloads con el formato oficial v3).
import http from 'node:http'
import test from 'node:test'
import assert from 'node:assert/strict'

const requests = []
const player = (id, name, number, pos, grid = null) => ({ player: { id, name, number, pos, grid } })
const squadPlayer = (id, name, number, position) => ({ id, name, age: 25, number, position, photo: `https://x/${id}.png` })

const HOME_ID = 100
const AWAY_ID = 200
const fixture = {
  fixture: { id: 5001, date: '2026-10-04T21:00:00+00:00', venue: { name: 'Estadio Central', city: 'Rosario' }, status: { short: 'NS', long: 'Not Started' } },
  league: { id: 128, name: 'Liga Profesional', season: 2026, round: 'Regular Season - 12', logo: 'https://x/l.png' },
  teams: { home: { id: HOME_ID, name: 'Local FC', logo: 'https://x/h.png' }, away: { id: AWAY_ID, name: 'Visitante SC', logo: 'https://x/a.png' } },
  goals: { home: null, away: null },
}

function lineupFor(teamId, name, primary) {
  return {
    team: { id: teamId, name, colors: { player: { primary } } },
    coach: { id: 1, name: `DT de ${name}` },
    formation: '4-3-3',
    startXI: [
      player(teamId * 100 + 1, 'Arquero', 1, 'G', '1:1'),
      player(teamId * 100 + 2, 'Lateral Izq', 3, 'D', '2:1'),
      player(teamId * 100 + 3, 'Central 1', 4, 'D', '2:2'),
      player(teamId * 100 + 4, 'Central 2', 5, 'D', '2:3'),
      player(teamId * 100 + 5, 'Lateral Der', 2, 'D', '2:4'),
      player(teamId * 100 + 6, 'Medio 1', 6, 'M', '3:1'),
      player(teamId * 100 + 7, 'Medio 2', 8, 'M', '3:2'),
      player(teamId * 100 + 8, 'Medio 3', 10, 'M', '3:3'),
      player(teamId * 100 + 9, 'Extremo Izq', 11, 'F', '4:1'),
      player(teamId * 100 + 10, 'Nueve', 9, 'F', '4:2'),
      player(teamId * 100 + 11, 'Extremo Der', 7, 'F', '4:3'),
    ],
    substitutes: [player(teamId * 100 + 12, 'Suplente Arq', 12, 'G'), player(teamId * 100 + 13, 'Suplente Med', 14, 'M')],
  }
}

const stub = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  requests.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), key: req.headers['x-apisports-key'] })
  const send = (response, errors = []) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ errors, response }))
  }
  if (req.headers['x-apisports-key'] === 'bad-key') return send([], { token: 'Error/Missing application key.' })
  if (url.pathname === '/fixtures') return send([fixture])
  if (url.pathname === '/fixtures/lineups') return send([lineupFor(HOME_ID, 'Local FC', '1d4ed8'), lineupFor(AWAY_ID, 'Visitante SC', '1d4ed8')])
  if (url.pathname === '/players/squads') {
    const id = Number(url.searchParams.get('team'))
    return send([{ team: { id }, players: [squadPlayer(id * 100 + 1, 'Arquero', 1, 'Goalkeeper'), squadPlayer(id * 100 + 9, 'Nueve', 9, 'Attacker'), squadPlayer(id * 100 + 50, 'Sin lineup', 30, 'Midfielder')] }])
  }
  if (url.pathname === '/teams') return send([{ team: { id: HOME_ID, name: 'Local FC', code: 'LOC', country: 'Argentina', logo: 'https://x/h.png', national: false }, venue: { name: 'Estadio Central', city: 'Rosario' } }])
  send([])
})
await new Promise((r) => stub.listen(0, r))
process.env.API_FOOTBALL_BASE = `http://localhost:${stub.address().port}`
process.env.API_FOOTBALL_KEY = 'server-key'

const { pool, migrate } = await import('../db.js')
const { createApp } = await import('../app.js')
const app = http.createServer(createApp())

let dbUp = true
try {
  await pool.query('SELECT 1')
  await migrate()
} catch {
  dbUp = false
}
await new Promise((r) => app.listen(0, r))
const base = `http://localhost:${app.address().port}`

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

test('API-Football: consultas, importación de partido con alineaciones y errores', async (t) => {
  if (!dbUp) return t.skip('sin Postgres local (npm run dev:db)')
  const stamp = Date.now()
  const token = (
    await call('POST', '/api/auth/register', { body: { email: `sports${stamp}@test.com`, name: 'Sports', password: 'clave-segura-1' } })
  ).body.token

  // Estado y búsquedas
  assert.deepEqual((await call('GET', '/api/sports/status', { token })).body, { configured: true, source: 'server' })
  const teams = await call('GET', '/api/sports/teams?search=local', { token })
  assert.equal(teams.body.teams[0].name, 'Local FC')
  assert.equal((await call('GET', '/api/sports/teams?search=lo', { token })).status, 400, 'la API exige 3+ letras')
  const fx = await call('GET', '/api/sports/fixtures?date=2026-10-04', { token })
  assert.equal(fx.body.fixtures[0].league.name, 'Liga Profesional')
  assert.equal(fx.body.fixtures[0].home.external_id, HOME_ID)

  // Importar el partido: crea equipos, planteles y partido con la alineación oficial
  const imp = await call('POST', '/api/sports/import/fixture', { token, body: { fixture_id: 5001 } })
  assert.equal(imp.status, 201)
  assert.equal(imp.body.lineup_loaded, true)
  const bundle = (await call('GET', `/api/matches/${imp.body.match_id}`, { token })).body

  assert.equal(bundle.match.home_name, 'Local FC')
  assert.equal(bundle.match.competition, 'Liga Profesional · Regular Season - 12')
  assert.equal(bundle.match.venue, 'Estadio Central, Rosario')
  assert.equal(bundle.match.home_formation, '4-3-3')
  assert.equal(bundle.match.external_id, 5001)
  assert.equal(bundle.match.home_ext_id, HOME_ID)
  assert.notEqual(bundle.match.home_color, bundle.match.away_color, 'colores iguales se desambiguan')

  const homeStarters = bundle.players.filter((p) => p.side === 'home' && p.is_starter)
  const homeBench = bundle.players.filter((p) => p.side === 'home' && !p.is_starter)
  assert.equal(homeStarters.length, 11)
  assert.equal(homeBench.length, 2, 'solo los suplentes convocados, no todo el plantel')
  const gk = homeStarters.find((p) => p.position === 'G')
  const nine = homeStarters.find((p) => p.name === 'Nueve')
  assert.ok(gk.x < 15 && nine.x > 40, 'las grillas se convierten en posiciones sobre la cancha')
  const awayGk = bundle.players.find((p) => p.side === 'away' && p.position === 'G' && p.is_starter)
  assert.ok(awayGk.x > 85, 'el visitante ataca hacia el otro lado')
  assert.ok(gk.player_id, 'el jugador queda vinculado a la ficha del equipo')

  // Equipos importados con su plantel completo (incluye a quien no fue convocado)
  const myTeams = (await call('GET', '/api/teams', { token })).body.teams
  assert.equal(myTeams.length, 2)
  const local = myTeams.find((x) => x.name === 'Local FC')
  assert.equal(local.coach, 'DT de Local FC')
  const detail = (await call('GET', `/api/teams/${local.id}`, { token })).body
  assert.equal(detail.players.length, 3)

  // Reimportar no duplica
  const again = await call('POST', '/api/sports/import/fixture', { token, body: { fixture_id: 5001 } })
  assert.equal(again.body.existing, true)
  assert.equal(again.body.match_id, imp.body.match_id)

  // Sincronizar plantel no pisa las notas
  await call('PATCH', `/api/teams/${local.id}/players/${detail.players[0].id}`, { token, body: { notes: 'Ojo: viene de lesión' } })
  const sync = await call('POST', `/api/sports/teams/${local.id}/sync`, { token })
  assert.equal(sync.body.synced, 3)
  const after = (await call('GET', `/api/teams/${local.id}`, { token })).body.players
  assert.equal(after.length, 3, 'no se duplican jugadores')
  assert.ok(after.some((p) => p.notes === 'Ojo: viene de lesión'))

  // Importar un equipo suelto
  const only = await call('POST', '/api/sports/import/team', { token, body: { external_id: HOME_ID } })
  assert.equal(only.status, 201)

  // Key de usuario inválida: error claro (401), sin caer en 500
  await call('PATCH', '/api/auth/me', { token, body: { api_key: 'bad-key' } })
  assert.equal((await call('GET', '/api/sports/status', { token })).body.source, 'user')
  const denied = await call('GET', '/api/sports/fixtures?date=2026-10-05', { token })
  assert.equal(denied.status, 401)
  assert.match(denied.body.error, /API key/)
  assert.equal(requests.at(-1).key, 'bad-key', 'se usa la key del usuario antes que la del servidor')
})

test.after(async () => {
  app.closeAllConnections()
  app.close()
  stub.closeAllConnections()
  stub.close()
  await pool.end()
})
