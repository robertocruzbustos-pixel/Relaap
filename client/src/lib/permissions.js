// Qué muestra la interfaz según el rol. El servidor valida igual cada acción (server/lib/permissions.js).
export function permissionsFor(role, userId) {
  const isOwner = role === 'owner'
  const editor = isOwner || role === 'editor'
  const field = role === 'field'
  const commentator = role === 'commentator'
  return {
    role,
    isOwner,
    manage: editor, // reloj, fichas, alineaciones, datos del partido, resumen
    substitute: editor || field,
    canAnyEvent: editor || field || commentator,
    canCreateEvent: (type) => editor || field || (commentator && type === 'note'),
    canModifyEvent: (event) => editor || ((field || commentator) && event.created_by === userId),
  }
}
