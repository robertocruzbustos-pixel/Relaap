import {
  Ambulance, ArrowLeftRight, CircleAlert, CircleDot, Clock, Crosshair, Flag, FlagTriangleRight, Goal, Hand,
  RectangleVertical, Siren, StickyNote, Tv,
} from 'lucide-react'

// Metadatos de cada tipo de evento (etiqueta, ícono y color).
export const EVENT_META = {
  goal: { label: 'Gol', icon: Goal, color: 'text-emerald-400' },
  penalty_goal: { label: 'Gol de penal', icon: CircleDot, color: 'text-emerald-400' },
  own_goal: { label: 'Gol en contra', icon: Goal, color: 'text-orange-400' },
  penalty_miss: { label: 'Penal errado', icon: CircleAlert, color: 'text-orange-300' },
  yellow: { label: 'Amarilla', icon: RectangleVertical, color: 'text-yellow-300', fill: true },
  red: { label: 'Roja', icon: RectangleVertical, color: 'text-red-500', fill: true },
  substitution: { label: 'Cambio', icon: ArrowLeftRight, color: 'text-sky-400' },
  chance: { label: 'Ocasión', icon: Crosshair, color: 'text-slate-300' },
  save: { label: 'Atajada', icon: Hand, color: 'text-slate-300' },
  corner: { label: 'Córner', icon: FlagTriangleRight, color: 'text-slate-300' },
  foul: { label: 'Falta', icon: Siren, color: 'text-slate-300' },
  offside: { label: 'Offside', icon: Flag, color: 'text-slate-300' },
  injury: { label: 'Lesión', icon: Ambulance, color: 'text-rose-300' },
  var: { label: 'VAR', icon: Tv, color: 'text-violet-300' },
  note: { label: 'Nota', icon: StickyNote, color: 'text-amber-300' },
  period: { label: 'Período', icon: Clock, color: 'text-slate-400' },
}

// Botonera del panel de eventos, en el orden en que se muestran.
export const PAD_TYPES = [
  'goal', 'penalty_goal', 'own_goal', 'yellow', 'red', 'substitution', 'chance', 'save',
  'corner', 'foul', 'offside', 'injury', 'var', 'penalty_miss', 'note',
]

// Eventos que requieren elegir equipo (si no hay jugador seleccionado).
export const NEEDS_SIDE = ['goal', 'penalty_goal', 'own_goal']

export const POSITIONS = { G: 'Arquero', D: 'Defensor', M: 'Mediocampista', F: 'Delantero' }
export const POSITION_ORDER = ['G', 'D', 'M', 'F']

export const FORMATIONS = [
  '4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '4-1-4-1', '4-5-1', '5-3-2', '5-4-1', '4-4-1-1', '4-3-2-1', '3-4-1-2',
]

export const PERIOD_LABEL = {
  PRE: 'Previa', '1T': '1er tiempo', ENT: 'Entretiempo', '2T': '2do tiempo', ET1: 'Alargue 1', ET2: 'Alargue 2', FIN: 'Finalizado',
}

export const STATUS_LABEL = { scheduled: 'Programado', live: 'En vivo', finished: 'Finalizado' }

export const PHRASE_CATEGORIES = {
  apertura: 'Apertura', gol: 'Gol', ataque: 'Ataque', defensa: 'Defensa', arquero: 'Arquero',
  tarjetas: 'Tarjetas', emocion: 'Emoción', cierre: 'Cierre', otras: 'Otras',
}

// Roles dentro de un partido (el creador es "owner").
export const ROLE_LABEL = {
  owner: 'Propietario',
  editor: 'Editor',
  field: 'Campo',
  commentator: 'Comentarista',
  viewer: 'Solo lectura',
}

export const ROLE_HELP = {
  editor: 'Todo: reloj, alineaciones, eventos y cambios. No puede borrar el partido ni gestionar al equipo.',
  field: 'Para quien está en el estadio: carga eventos y cambios, y edita solo lo que cargó. No toca el reloj ni las fichas.',
  commentator: 'Ve todo en vivo, escribe notas y participa del chat. No modifica el partido.',
  viewer: 'Solo mira y participa del chat.',
}

export const ASSIGNABLE_ROLES = ['editor', 'field', 'commentator', 'viewer']
