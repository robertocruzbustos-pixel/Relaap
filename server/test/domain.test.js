import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyClockAction, autoLineup, deriveFromEvents, elapsedSeconds, formationRows, gridsToXY, minuteLabel, parseFormation,
} from '../lib/domain.js'

test('parseFormation valida formaciones de 10 jugadores de campo', () => {
  assert.deepEqual(parseFormation('4-3-3'), [4, 3, 3])
  assert.deepEqual(parseFormation('4-2-3-1'), [4, 2, 3, 1])
  assert.equal(parseFormation('4-4-3'), null)
  assert.equal(parseFormation('10'), null)
  assert.equal(parseFormation('a-b'), null)
})

test('formationRows: arquero + defensa / medios / delanteros', () => {
  const rows = formationRows('4-2-3-1')
  assert.deepEqual(rows.map((r) => `${r.pos}${r.count}`), ['G1', 'D4', 'M2', 'M3', 'F1'])
})

test('autoLineup ubica 11 titulares y respeta posiciones', () => {
  const squad = [
    ...[1].map((n) => ({ id: n, position: 'G', number: n })),
    ...[2, 3, 4, 5, 12].map((n) => ({ id: n, position: 'D', number: n })),
    ...[6, 7, 8, 10, 14].map((n) => ({ id: n, position: 'M', number: n })),
    ...[9, 11, 20].map((n) => ({ id: n, position: 'F', number: n })),
  ]
  const spots = autoLineup(squad, '4-4-2', 'home')
  assert.equal(spots.size, 11)
  assert.ok(spots.has(1), 'el arquero es titular')
  const gk = spots.get(1)
  const strikers = [9, 11].map((id) => spots.get(id))
  assert.ok(gk.x < 15, 'el arquero está cerca del arco propio')
  assert.ok(strikers.every((s) => s.x > 40), 'los delanteros están adelantados')
})

test('autoLineup del visitante se refleja', () => {
  const squad = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, position: i === 0 ? 'G' : i < 5 ? 'D' : i < 9 ? 'M' : 'F', number: i + 1 }))
  const home = autoLineup(squad, '4-4-2', 'home').get(1)
  const away = autoLineup(squad, '4-4-2', 'away').get(1)
  assert.equal(Math.round(home.x + away.x), 100)
})

test('autoLineup completa con jugadores de otra posición si faltan', () => {
  const squad = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, position: 'M', number: i + 1 }))
  assert.equal(autoLineup(squad, '4-3-3', 'home').size, 11)
})

test('gridsToXY convierte grillas de API-Football', () => {
  const xy = gridsToXY(
    [{ grid: '1:1' }, { grid: '2:1' }, { grid: '2:2' }, { grid: '3:1' }],
    'home',
  )
  assert.ok(xy[0].x < xy[1].x && xy[1].x < xy[3].x, 'las filas avanzan hacia el ataque')
  assert.ok(xy[1].y < xy[2].y, 'la columna 1 queda a la izquierda del equipo')
  assert.deepEqual(gridsToXY([{ grid: null }], 'home'), [null])
})

test('minuteLabel: tiempo agregado y períodos especiales', () => {
  assert.equal(minuteLabel('1T', 0), "1'")
  assert.equal(minuteLabel('1T', 23 * 60 + 45), "24'")
  assert.equal(minuteLabel('1T', 46 * 60), "45+2'")
  assert.equal(minuteLabel('2T', 2700 + 60), "47'")
  assert.equal(minuteLabel('2T', 91 * 60), "90+2'")
  assert.equal(minuteLabel('ENT', 2700), 'ENT')
  assert.equal(minuteLabel('PRE', 0), 'Previa')
})

test('reloj: iniciar, pausar y pasar de período', () => {
  const t0 = 1_000_000
  let match = { status: 'scheduled', period: 'PRE', clock_seconds: 0, clock_started_at: null }

  match = { ...match, ...applyClockAction(match, 'start', {}, t0) }
  assert.equal(match.period, '1T')
  assert.equal(match.status, 'live')
  assert.equal(elapsedSeconds(match, t0 + 90_000), 90)

  match = { ...match, ...applyClockAction(match, 'pause', {}, t0 + 90_000) }
  assert.equal(match.clock_seconds, 90)
  assert.equal(match.clock_started_at, null)
  assert.equal(elapsedSeconds(match, t0 + 500_000), 90, 'en pausa no avanza')

  match = { ...match, ...applyClockAction(match, 'period', { period: 'ENT' }, t0 + 100_000) }
  assert.equal(match.period, 'ENT')
  match = { ...match, ...applyClockAction(match, 'start', {}, t0 + 200_000) }
  assert.equal(match.period, '2T')
  assert.equal(match.clock_seconds, 2700, 'el 2T arranca en el minuto 45')

  match = { ...match, ...applyClockAction(match, 'period', { period: 'FIN' }, t0 + 260_000) }
  assert.equal(match.status, 'finished')
  assert.throws(() => applyClockAction(match, 'start', {}, t0 + 300_000))
})

test('deriveFromEvents: goles, autogol y tarjetas', () => {
  const { score, players } = deriveFromEvents([
    { type: 'goal', side: 'home', match_player_id: 1 },
    { type: 'penalty_goal', side: 'home', match_player_id: 1 },
    { type: 'own_goal', side: 'home', match_player_id: 2 }, // autogol del local => punto del visitante
    { type: 'goal', side: 'away', match_player_id: 3 },
    { type: 'yellow', side: 'away', match_player_id: 3 },
    { type: 'red', side: 'away', match_player_id: 4 },
    { type: 'corner', side: 'home' },
  ])
  assert.deepEqual(score, { home: 2, away: 2 })
  assert.equal(players.get(1).goals, 2)
  assert.equal(players.get(3).yellows, 1)
  assert.equal(players.get(4).red, true)
})
