// Permisos por rol dentro de un partido. Es la única fuente de verdad del servidor.
//
//   owner       creador: todo, incluido borrar el partido y gestionar colaboradores
//   editor      todo menos borrar el partido y gestionar colaboradores
//   field       "campo": carga eventos y cambios; solo edita/borra los suyos
//   commentator ve todo, anota (eventos tipo nota) y participa del chat
//   viewer      solo lectura (puede leer y escribir en el chat)

export const ROLES = ['editor', 'field', 'commentator', 'viewer']

export const ROLE_LABEL = {
  owner: 'Propietario',
  editor: 'Editor',
  field: 'Campo',
  commentator: 'Comentarista',
  viewer: 'Solo lectura',
}

// Acciones "grandes" y qué roles pueden hacerlas.
const ACTIONS = {
  view: ['owner', 'editor', 'field', 'commentator', 'viewer'],
  chat: ['owner', 'editor', 'field', 'commentator', 'viewer'],
  manage: ['owner', 'editor'], // reloj, alineaciones, fichas, datos del partido, resumen
  substitute: ['owner', 'editor', 'field'],
  event: ['owner', 'editor', 'field', 'commentator'], // crear eventos (commentator: solo notas)
  members: ['owner'],
}

export const can = (role, action) => Boolean(role && ACTIONS[action]?.includes(role))

/** ¿Puede este rol crear un evento de ese tipo? */
export const canCreateEvent = (role, type) => {
  if (!can(role, 'event')) return false
  return role === 'commentator' ? type === 'note' : true
}

/** Editar/borrar un evento: editores todos; campo y comentarista, solo los propios. */
export const canModifyEvent = (role, event, userId) => {
  if (role === 'owner' || role === 'editor') return true
  if (role === 'field' || role === 'commentator') return event.created_by === userId
  return false
}

export const DENIED_MESSAGE = {
  manage: 'Tu rol en este partido no permite modificar esto.',
  substitute: 'Tu rol en este partido no permite registrar cambios.',
  event: 'Tu rol en este partido no permite cargar eventos.',
  members: 'Solo el creador del partido puede hacer esto.',
  chat: 'No tenés acceso al chat de este partido.',
  view: 'Partido no encontrado.',
}
