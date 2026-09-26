// Seguimiento en vivo con la API: sugerencias, deduplicado, permisos, cuota y errores de plan.
import http from 'node:http'
import test from 'node:test'
import assert from 'node:assert/strict'
import { alreadyLogged, draftFromApiEvent, namesMatch, periodForMinute, timing } from '../lib/apiEvents.js'

// ---------- Unitarios (no necesitan base) ----------

test('mapeo de eventos de API-Football', () => {
  const ctx = { homeExtId: 100, awayExtId: 200 }
  const ev = (type, detail, teamId, elapsed, extra = null, player = { id: 1, name: 'A' }, assist = null) => ({
    type, detail, team: { id: teamId }, time: { elapsed, extra }, player, assist,
  })
  assert.equal(draftFromApiEvent(ev('Goal', 'Normal Goal', 100, 23), ctx).type, 'goal')
  assert.equal(draftFromApiEvent(ev('Goal', 'Penalty', 100, 23), ctx).type, 'penalty_goal')
  assert.equal(draftFromApiEvent(ev('Goal', 'Own Goal', 200, 23), ctx).type, 'own_goal')
  assert.equal(draftFromApiEvent(ev('Goal', 'Missed Penalty', 200, 23), ctx).type, 'penalty_miss')
  assert.equal(draftFromApiEvent(ev('Card', 'Yellow Card', 200, 30), ctx).type, 'yellow')
  assert.equal(draftFromApiEvent(ev('Card', 'Red Card', 200, 30), ctx).type, 'red')
  const second = draftFromApiEvent(ev('Card', 'Second Yellow card', 200, 30), ctx)
  assert.equal(second.type, 'red')
  assert.equal(second.detail, 'Segunda amarilla')
  assert.equal(draftFromApiEvent(ev('subst', 'Substitution 1', 100, 60, null, { id: 5, name: 'X' }, { id: 6, name: 'Y' }), ctx).type, 'substitution')
  assert.equal(draftFromApiEvent(ev('Var', 'Goal cancelled', 100, 70), ctx).type, 'var')
  assert.equal(draftFromApiEvent(ev('Foul', 'x', 100, 70), ctx), null, 'lo que no interesa se ignora')
  assert.equal(draftFromApiEvent(ev('Goal', 'Normal Goal', 100, 23), ctx).side, 'home')
  assert.equal(draftFromApiEvent(ev('Goal', 'Normal Goal', 200, 23), ctx).side, 'away')
})

test('minutos, períodos y nombres', () => {
  assert.equal(periodForMinute(45), '1T')
  assert.equal(periodForMinute(46), '2T')
  assert.equal(periodForMinute(90), '2T')
  assert.equal(periodForMinute(105), 'ET1')
  assert.deepEqual(timing({ elapsed: 45, extra: 2 }), { clock_seconds: 46 * 60, period: '1T' })
  assert.equal(namesMatch('L. Messi', 'Lionel Messi'), true)
  assert.equal(namesMatch('Pérez', 'Juan Perez'), true)
  assert.equal(namesMatch('Gomez', 'Gómez Juan'), false, 'el apellido debe ser el último')
  assert.equal(namesMatch('Ruiz', 'Ruiz'), true)
})

test('alreadyLogged evita sugerir lo que ya se cargó a mano', () => {
  const draft = { type: 'goal', side: 'home', elapsed: 23, extra: 0, player_name: 'Nueve' }
  const logged = [{ type: 'goal', side: 'home', minute_label: "24'", player_name: 'Nueve' }]
  assert.equal(alreadyLogged(draft, logged), true)
  assert.equal(alreadyLogged(draft, [{ ...logged[0], minute_label: "40'" }]), false, 'minuto muy distinto')
  assert.equal(alreadyLogged(draft, [{ ...logged[0], side: 'away' }]), false, 'otro equipo')
  assert.equal(alreadyLogged(draft, [{ ...logged[0], player_name: 'Otro Jugador' }]), false, 'otro jugador')
  assert.equal(alreadyLogged(draft, [{ ...logged[0], type: 'yellow' }]), false, 'otro tipo')
})

// ---------- Integración con Postgres y una API simulada ----------

const HOME = 100
const AWAY = 200
const state = { status: '1H', elapsed: 23, goals: { home: 1, away: 0 }, events: [], remaining: 90, errors: [] }
const requests = []

const pl = (id, name, number, pos, grid = null) => ({ player: { id, name, number, pos, grid } })
const lineupFor = (teamId, name, primary) => ({
  team: { id: teamId, name, colors: { player: { primary } } },
  coach: { id: 1, name: `DT ${name}` },
  formation: '4-3-3',
  startXI: [
    pl(teamId * 100 + 1, 'Arquero', 1, 'G', '1:1'),
    ...[2, 3, 4, 5].map((n, i) => pl(teamId * 100 + n, `Def ${n}`, n, 'D', `2:${i + 1}`)),
    ...[6, 7, 8].map((n, i) => pl(teamId * 100 + n, `Medio ${n}`, n, 'M', `3:${i + 1}`)),
    pl(teamId * 100 + 9, 'Extremo Izq', 11, 'F', '4:1'),
    pl(teamId * 100 + 10, 'Nueve', 9, 'F', '4:2'),
    pl(teamId * 100 + 11, 'Extremo Der', 7, 'F', '4:3'),
  ],
  substitutes: [pl(teamId * 100 + 13, 'Suplente Med', 14, 'M'), pl(teamId * 100 + 14, 'Suplente Del', 15, 'F')],
})
const fixtureBase = () => ({
  fixture: { id: 7001, date: '2026-10-04T21:00:00+00:00', venue: { name: 'Estadio', city: 'Rosario' }, status: { short: state.status, long: state.status, elapsed: state.elapsed } },
  league: { id: 128, name: 'Liga Profesional', season: 2026, round: 'Fecha 5', logo: '' },
  teams: { home: { id: HOME, name: 'Local FC', logo: '' }, away: { id: AWAY, name: 'Visitante SC', logo: '' } },
  goals: state.goals,
})

const stub = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  requests.push(url.pathname)
  const send = (response, errors = []) => {
    res.setHeader('content-type', 'application/json')
    res.setHeader('x-ratelimit-requests-remaining', String(state.remaining))
    res.setHeader('x-ratelimit-requests-limit', '100')
    res.end(JSON.stringify({ errors, response }))
  }
  if (url.pathname === '/status') return send({ subscription: { plan: 'Free', active: true, end: '2027-01-01' }, requests: { current: 12, limit_day: 100 } })
  if (state.errors.length || Object.keys(state.errors).length) return send([], state.errors)
  if (url.pathname === '/fixtures' && url.searchParams.has('id')) return send([{ ...fixtureBase(), events: state.events }])
  if (url.pathname === '/fixtures/lineups') return send([lineupFor(HOME, 'Local FC', '1d4ed8'), lineupFor(AWAY, 'Visitante SC', 'dc2626')])
  if (url.pathname === '/players/squads') {
    const id = Number(url.searchParams.get('team'))
    return send([{ team: { id }, players: [{ id: id * 100 + 1, name: 'Arquero', number: 1, position: 'Goalkeeper' }] }])
  }
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

const stamp = Date.now()
const register = async (label) =>
  (await call('POST', '/api/auth/register', { body: { email: `${label}${stamp}@test.com`, name: `P ${label}`, password: 'clave-segura-1' } })).body.token
const ev = (type, detail, teamId, elapsed, player, assist = null, extra = null) => ({
  type, detail, team: { id: teamId }, time: { elapsed, extra }, player, assist,
})

test('seguimiento en vivo: sugerencias, permisos, deduplicado, cuota y errores', async (t) => {
  if (!dbUp) return t.skip('sin Postgres local (npm run dev:db)')
  const [ana, campo, comen] = await Promise.all(['ana', 'campo', 'comen'].map(register))

  // Estado de la cuenta (no gasta cuota)
  const account = await call('GET', '/api/sports/account', { token: ana })
  assert.deepEqual(account.body, { plan: 'Free', active: true, ends: '2027-01-01', used: 12, limit: 100 })

  // Importa el partido con la alineación oficial (los jugadores quedan vinculados por id de la API)
  const imp = await call('POST', '/api/sports/import/fixture', { token: ana, body: { fixture_id: 7001 } })
  assert.equal(imp.status, 201)
  const matchId = imp.body.match_id
  const path = (p) => `/api/matches/${matchId}${p}`
  await call('POST', path('/members'), { token: ana, body: { email: `campo${stamp}@test.com`, role: 'field' } })
  await call('POST', path('/members'), { token: ana, body: { email: `comen${stamp}@test.com`, role: 'commentator' } })

  // Solo se puede seguir un partido que vino de la API
  const manual = await call('POST', '/api/matches', { token: ana, body: { home: { name: 'A' }, away: { name: 'B' } } })
  assert.equal(
    (await call('POST', `/api/matches/${manual.body.match.id}/follow`, { token: ana, body: { enabled: true, interval: 120 } })).status,
    400,
  )

  // Permisos para activar: solo owner/editor
  assert.equal((await call('POST', path('/follow'), { token: campo, body: { enabled: true } })).status, 403)
  assert.equal((await call('POST', path('/follow'), { token: ana, body: { enabled: true, interval: 10 } })).status, 400, 'intervalo mínimo 60 s')

  // --- 1) Primera consulta: gol local + amarilla visitante + cambio local (con el orden invertido a propósito) ---
  state.events = [
    ev('Goal', 'Normal Goal', HOME, 23, { id: HOME * 100 + 10, name: 'Nueve' }),
    ev('Card', 'Yellow Card', AWAY, 30, { id: AWAY * 100 + 3, name: 'Def 3' }),
    // La API no aclara quién sale: acá "player" es el que ENTRA y "assist" el que sale.
    ev('subst', 'Substitution 1', HOME, 60, { id: HOME * 100 + 13, name: 'Suplente Med' }, { id: HOME * 100 + 7, name: 'Medio 7' }),
  ]
  const before = requests.length
  const on = await call('POST', path('/follow'), { token: ana, body: { enabled: true, interval: 120 } })
  assert.equal(on.status, 200)
  assert.equal(requests.length - before, 1, 'una sola consulta por sincronización (los eventos vienen con el partido)')
  assert.equal(on.body.match.api_follow, true)
  assert.equal(on.body.match.api_status, '1H')
  assert.equal(on.body.match.api_home_goals, 1)
  assert.equal(on.body.match.api_remaining, 90)
  assert.equal(on.body.suggestions.length, 3)
  const types = on.body.suggestions.map((s) => s.type).sort()
  assert.deepEqual(types, ['goal', 'substitution', 'yellow'])
  assert.equal(on.body.match.home_score, 0, 'las sugerencias no tocan el marcador hasta que alguien las acepta')
  assert.equal(on.body.events.filter((e) => e.type !== 'period').length, 0)

  // --- 2) Repetir la consulta no duplica ---
  const again = await call('POST', path('/follow/sync'), { token: ana })
  assert.equal(again.body.suggestions.length, 3)

  // --- 3) Lo que ya se cargó a mano queda "matched" y no se sugiere ---
  await call('POST', path('/events'), { token: campo, body: { type: 'goal', side: 'away', clock_seconds: 39 * 60, description: 'cargado por el campo' } })
  state.events.push(ev('Goal', 'Normal Goal', AWAY, 40, { id: AWAY * 100 + 10, name: 'Nueve' }))
  const withManual = await call('POST', path('/follow/sync'), { token: ana })
  assert.equal(withManual.body.suggestions.length, 3, 'el gol visitante ya estaba cargado: no genera sugerencia')
  const { rows: matchedRows } = await pool.query("SELECT COUNT(*) AS n FROM api_suggestions WHERE match_id = $1 AND status = 'matched'", [matchId])
  assert.equal(matchedRows[0].n, 1)

  // --- 4) Permisos para resolver ---
  const [goalSg, yellowSg, subSg] = ['goal', 'yellow', 'substitution'].map((ty) => withManual.body.suggestions.find((s) => s.type === ty))
  assert.equal((await call('POST', path(`/suggestions/${goalSg.id}/accept`), { token: comen })).status, 403, 'comentarista no acepta goles')
  assert.equal((await call('POST', path(`/suggestions/${goalSg.id}/dismiss`), { token: comen })).status, 403)

  // El campo acepta el gol: minuto de la API, jugador vinculado y marcador actualizado
  const accepted = await call('POST', path(`/suggestions/${goalSg.id}/accept`), { token: campo })
  assert.equal(accepted.status, 200)
  const goalEvent = accepted.body.events.find((e) => e.type === 'goal' && e.side === 'home')
  assert.equal(goalEvent.minute_label, "23'", 'usa el minuto de la API, no el del reloj')
  assert.equal(goalEvent.player_name, 'Nueve')
  assert.ok(goalEvent.match_player_id, 'el jugador queda vinculado a tu plantilla')
  assert.equal(goalEvent.author_name, 'P campo')
  assert.equal(accepted.body.match.home_score, 1)
  assert.equal(accepted.body.suggestions.length, 2)
  assert.equal((await call('POST', path(`/suggestions/${goalSg.id}/accept`), { token: campo })).status, 404, 'ya resuelta')

  // Cambio con orden invertido: el que estaba en cancha es el que sale
  const sub = await call('POST', path(`/suggestions/${subSg.id}/accept`), { token: ana })
  assert.equal(sub.status, 200)
  const subEvent = sub.body.events.find((e) => e.type === 'substitution')
  assert.equal(subEvent.description, 'Entra Suplente Med, sale Medio 7')
  assert.equal(sub.body.players.find((p) => p.name === 'Suplente Med' && p.side === 'home').on_pitch, true)
  assert.equal(sub.body.players.find((p) => p.name === 'Medio 7' && p.side === 'home').on_pitch, false)

  // Descartar
  const dismissed = await call('POST', path(`/suggestions/${yellowSg.id}/dismiss`), { token: ana })
  assert.equal(dismissed.body.suggestions.length, 0)
  const noYellow = dismissed.body.events.filter((e) => e.type === 'yellow')
  assert.equal(noYellow.length, 0, 'descartar no crea evento')

  // Lo descartado no vuelve a aparecer en la siguiente consulta
  const afterDismiss = await call('POST', path('/follow/sync'), { token: ana })
  assert.equal(afterDismiss.body.suggestions.length, 0)

  // --- 5) Cuota: con pocas consultas restantes se detiene solo ---
  state.remaining = 4
  const low = await call('POST', path('/follow/sync'), { token: ana })
  assert.equal(low.body.match.api_remaining, 4)
  assert.equal(low.body.match.api_follow, false, 'se detiene para no agotar la cuota')
  assert.match(low.body.match.api_error, /Quedan 4 consultas/)
  state.remaining = 80

  // --- 6) Fin del partido: el seguimiento se corta solo ---
  await call('POST', path('/follow'), { token: ana, body: { enabled: true, interval: 300 } })
  state.status = 'FT'
  state.elapsed = 90
  const ft = await call('POST', path('/follow/sync'), { token: ana })
  assert.equal(ft.body.match.api_status, 'FT')
  assert.equal(ft.body.match.api_follow, false, 'al terminar el partido deja de consultar')

  // --- 7) Errores de la API: plan sin acceso ---
  state.status = '1H'
  state.errors = { plan: 'Free plans do not have access to this season, try from 2021 to 2023.' }
  const planErr = await call('POST', path('/follow'), { token: ana, body: { enabled: true, interval: 120 } })
  assert.equal(planErr.status, 403)
  assert.match(planErr.body.error, /Tu plan de API-Football no permite esta consulta/)
  const { rows: st } = await pool.query('SELECT api_follow, api_error FROM matches WHERE id = $1', [matchId])
  assert.equal(st[0].api_follow, false)
  assert.match(st[0].api_error, /plan/i)
  state.errors = { requests: 'You have reached the request limit for the day' }
  assert.equal((await call('POST', path('/follow/sync'), { token: ana })).status, 429)
  state.errors = []

  // Apagar manualmente es idempotente
  assert.equal((await call('POST', path('/follow'), { token: ana, body: { enabled: false } })).status, 200)
})

test.after(async () => {
  app.closeAllConnections()
  app.close()
  stub.closeAllConnections()
  stub.close()
  await pool.end()
})
