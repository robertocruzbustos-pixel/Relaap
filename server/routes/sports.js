import { Router } from 'express'
import { z } from 'zod'
import { query, tx } from '../db.js'
import { HttpError, idParam, parse, wrap } from '../lib/http.js'
import { gridsToXY, parseFormation } from '../lib/domain.js'
import { createMatch } from '../lib/matchService.js'
import {
  TTL, apiGet, fetchAccountStatus, mapPosition, normFixture, normLeague, normLineup, normStanding, normTeam, resolveApiKey,
} from '../lib/apiFootball.js'

const router = Router()

const num = (min = 1) => z.coerce.number().int().min(min)

// ---------- Consultas (proxy con caché) ----------

router.get(
  '/status',
  wrap(async (req, res) => {
    const { source } = await resolveApiKey(req.user.id)
    res.json({ configured: Boolean(source), source })
  }),
)

// Plan y consultas usadas hoy (este endpoint de API-Football no descuenta cuota).
router.get(
  '/account',
  wrap(async (req, res) => {
    res.json(await fetchAccountStatus(req.user.id))
  }),
)

router.get(
  '/leagues',
  wrap(async (req, res) => {
    const { search } = parse(z.object({ search: z.string().trim().min(3, 'mínimo 3 letras') }), req.query)
    const data = await apiGet(req.user.id, '/leagues', { search }, TTL.long)
    res.json({ leagues: data.map(normLeague) })
  }),
)

router.get(
  '/teams',
  wrap(async (req, res) => {
    const { search } = parse(z.object({ search: z.string().trim().min(3, 'mínimo 3 letras') }), req.query)
    const data = await apiGet(req.user.id, '/teams', { search }, TTL.long)
    res.json({ teams: data.map(normTeam) })
  }),
)

router.get(
  '/fixtures',
  wrap(async (req, res) => {
    const q = parse(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        league: num().optional(),
        season: num(1900).optional(),
        team: num().optional(),
        next: num().max(30).optional(),
        last: num().max(30).optional(),
      }),
      req.query,
    )
    if (!q.date && !q.team && !q.league) q.date = new Date().toISOString().slice(0, 10)
    if (q.league && !q.season && !q.date && !q.next && !q.last) q.next = 20
    const data = await apiGet(req.user.id, '/fixtures', q, TTL.short)
    res.json({ fixtures: data.map(normFixture) })
  }),
)

router.get(
  '/lineups',
  wrap(async (req, res) => {
    const { fixture } = parse(z.object({ fixture: num() }), req.query)
    const data = await apiGet(req.user.id, '/fixtures/lineups', { fixture }, TTL.short)
    res.json({ lineups: data.map(normLineup) })
  }),
)

router.get(
  '/h2h',
  wrap(async (req, res) => {
    const { home, away } = parse(z.object({ home: num(), away: num() }), req.query)
    const data = await apiGet(req.user.id, '/fixtures/headtohead', { h2h: `${home}-${away}`, last: 10 }, TTL.long)
    res.json({ fixtures: data.map(normFixture) })
  }),
)

router.get(
  '/standings',
  wrap(async (req, res) => {
    const { league, season } = parse(z.object({ league: num(), season: num(1900) }), req.query)
    const data = await apiGet(req.user.id, '/standings', { league, season }, TTL.medium)
    res.json({ standings: data.map(normStanding) })
  }),
)

// ---------- Importación a tu base ----------

async function fetchSquad(userId, teamExtId) {
  const data = await apiGet(userId, '/players/squads', { team: teamExtId }, TTL.long)
  return (data[0]?.players ?? []).map((p) => ({
    external_id: p.id, name: p.name, number: p.number ?? null, position: mapPosition(p.position), photo_url: p.photo ?? null,
  }))
}

async function upsertSquad(client, userId, teamId, squad) {
  for (const p of squad) {
    await client.query(
      `INSERT INTO players (team_id, owner_id, name, number, position, photo_url, external_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (team_id, external_id) DO UPDATE
         SET name = EXCLUDED.name, number = EXCLUDED.number, position = EXCLUDED.position, photo_url = EXCLUDED.photo_url`,
      [teamId, userId, p.name, p.number, p.position, p.photo_url, p.external_id],
    )
  }
}

/** Busca o crea el equipo del usuario a partir de datos de la API. Devuelve la fila y si es nueva. */
async function ensureTeam(client, userId, t) {
  const found = await client.query('SELECT * FROM teams WHERE owner_id = $1 AND external_id = $2', [userId, t.external_id])
  if (found.rows[0]) return { team: found.rows[0], created: false }
  const { rows } = await client.query(
    `INSERT INTO teams (owner_id, name, short_name, logo_url, stadium, city, external_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, t.name, t.short_name ?? null, t.logo_url ?? null, t.stadium ?? null, t.city ?? null, t.external_id],
  )
  return { team: rows[0], created: true }
}

router.post(
  '/import/team',
  wrap(async (req, res) => {
    const { external_id } = parse(z.object({ external_id: z.number().int().positive() }), req.body)
    const data = await apiGet(req.user.id, '/teams', { id: external_id }, TTL.long)
    if (!data[0]) throw new HttpError(404, 'Equipo no encontrado en la API.')
    const squad = await fetchSquad(req.user.id, external_id)
    const team = await tx(async (client) => {
      const { team: t } = await ensureTeam(client, req.user.id, normTeam(data[0]))
      await upsertSquad(client, req.user.id, t.id, squad)
      return t
    })
    res.status(201).json({ team })
  }),
)

// Actualiza el plantel de un equipo importado (altas/bajas/números) sin pisar tus notas.
router.post(
  '/teams/:id/sync',
  wrap(async (req, res) => {
    const teamId = idParam(req.params.id)
    const { rows } = await query('SELECT * FROM teams WHERE id = $1 AND owner_id = $2', [teamId, req.user.id])
    const team = rows[0]
    if (!team) throw new HttpError(404, 'Equipo no encontrado.')
    if (!team.external_id) throw new HttpError(400, 'Este equipo no fue importado de la API.')
    const squad = await fetchSquad(req.user.id, team.external_id)
    await tx((client) => upsertSquad(client, req.user.id, team.id, squad))
    res.json({ synced: squad.length })
  }),
)

router.post(
  '/import/fixture',
  wrap(async (req, res) => {
    const { fixture_id } = parse(z.object({ fixture_id: z.number().int().positive() }), req.body)

    const existing = await query('SELECT id FROM matches WHERE owner_id = $1 AND external_id = $2', [req.user.id, fixture_id])
    if (existing.rows[0]) return res.json({ match_id: existing.rows[0].id, existing: true })

    const fxData = await apiGet(req.user.id, '/fixtures', { id: fixture_id }, TTL.short)
    if (!fxData[0]) throw new HttpError(404, 'Partido no encontrado en la API.')
    const fx = normFixture(fxData[0])

    // Todas las llamadas externas van antes de abrir la transacción.
    const lineups = await apiGet(req.user.id, '/fixtures/lineups', { fixture: fixture_id }, TTL.short).catch(() => [])
    const lineupByTeam = new Map(lineups.map((l) => [l.team.id, normLineup(l)]))

    const sides = { home: fx.home, away: fx.away }
    const squads = {}
    for (const [side, t] of Object.entries(sides)) {
      const known = await query(
        'SELECT t.id, (SELECT COUNT(*) FROM players p WHERE p.team_id = t.id) AS n FROM teams t WHERE t.owner_id = $1 AND t.external_id = $2',
        [req.user.id, t.external_id],
      )
      squads[side] = known.rows[0]?.n > 0 ? null : await fetchSquad(req.user.id, t.external_id)
    }

    const match = await tx(async (client) => {
      const spec = {
        competition: [fx.league.name, fx.league.round].filter(Boolean).join(' · '),
        venue: [fx.venue, fx.city].filter(Boolean).join(', '),
        kickoff_at: fx.date,
        external_id: fx.external_id,
        league_ext_id: fx.league.external_id,
        season: fx.league.season,
      }

      for (const side of ['home', 'away']) {
        const t = sides[side]
        const { team } = await ensureTeam(client, req.user.id, {
          external_id: t.external_id, name: t.name, logo_url: t.logo, stadium: side === 'home' ? fx.venue : null,
          city: side === 'home' ? fx.city : null,
        })
        if (squads[side]) await upsertSquad(client, req.user.id, team.id, squads[side])

        const lu = lineupByTeam.get(t.external_id)
        const sideSpec = { team_id: team.id, ext_id: t.external_id, name: team.name }
        if (lu) {
          if (lu.color) sideSpec.color = lu.color
          if (lu.formation && parseFormation(lu.formation)) sideSpec.formation = lu.formation
          if (lu.coach) await client.query('UPDATE teams SET coach = $2 WHERE id = $1', [team.id, lu.coach])

          const { rows: dbPlayers } = await client.query('SELECT id, external_id FROM players WHERE team_id = $1', [team.id])
          const byExt = new Map(dbPlayers.map((p) => [p.external_id, p.id]))
          const coords = gridsToXY(lu.starters, side)
          sideSpec.lineup = [
            ...lu.starters.map((p, i) => ({
              player_id: byExt.get(p.external_id) ?? null, name: p.name, number: p.number, position: p.position,
              is_starter: true, x: coords[i]?.x ?? null, y: coords[i]?.y ?? null,
            })),
            ...lu.substitutes.map((p) => ({
              player_id: byExt.get(p.external_id) ?? null, name: p.name, number: p.number, position: p.position, is_starter: false,
            })),
          ]
          // Si la grilla no vino, se ubican con la formación en lugar de dejar titulares sin posición.
          if (coords.some((c) => c === null)) delete sideSpec.lineup
        }
        spec[side] = sideSpec
      }
      // Evita que ambos equipos queden con el mismo color de camiseta.
      if (spec.home.color && spec.home.color === spec.away.color) delete spec.away.color
      return createMatch(client, req.user.id, spec)
    })

    res.status(201).json({ match_id: match.id, existing: false, lineup_loaded: lineups.length === 2 })
  }),
)

export default router
