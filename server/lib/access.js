import { query } from '../db.js'
import { DENIED_MESSAGE, can } from './permissions.js'
import { HttpError, idParam } from './http.js'

/** Rol del usuario en un partido: 'owner' | 'editor' | 'field' | 'commentator' | 'viewer' | null. */
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

/**
 * Middleware: exige acceso al partido de :id y, opcionalmente, permiso para una acción
 * (ver lib/permissions.js). Deja req.matchId y req.role.
 */
export function matchAccess(action = 'view') {
  return async (req, res, next) => {
    try {
      const matchId = idParam(req.params.id, 'partido')
      const role = await getMatchRole(matchId, req.user.id)
      if (!role) throw new HttpError(404, 'Partido no encontrado.')
      if (!can(role, action)) throw new HttpError(403, DENIED_MESSAGE[action] ?? 'Sin permiso.')
      req.matchId = matchId
      req.role = role
      next()
    } catch (err) {
      next(err)
    }
  }
}
