import { query } from '../db.js'
import { HttpError, idParam } from './http.js'

/** Rol del usuario en un partido: 'owner' | 'editor' | 'viewer' | null. */
export async function getMatchRole(matchId, userId) {
  const { rows } = await query(
    `SELECT CASE WHEN m.owner_id = $2 THEN 'owner' ELSE mm.role END AS role
       FROM matches m
       LEFT JOIN match_members mm ON mm.match_id = m.id AND mm.user_id = $2
      WHERE m.id = $1 AND (m.owner_id = $2 OR mm.user_id IS NOT NULL)`,
    [matchId, userId],
  )
  return rows[0]?.role ?? null
}

/** Middleware: exige acceso al partido de :id y deja req.matchId / req.role. */
export function matchAccess({ edit = false, ownerOnly = false } = {}) {
  return async (req, res, next) => {
    try {
      const matchId = idParam(req.params.id, 'partido')
      const role = await getMatchRole(matchId, req.user.id)
      if (!role) throw new HttpError(404, 'Partido no encontrado.')
      if (ownerOnly && role !== 'owner') throw new HttpError(403, 'Solo el creador del partido puede hacer esto.')
      if (edit && role === 'viewer') throw new HttpError(403, 'Tenés permiso de solo lectura en este partido.')
      req.matchId = matchId
      req.role = role
      next()
    } catch (err) {
      next(err)
    }
  }
}
