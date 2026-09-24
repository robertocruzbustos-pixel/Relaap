const pad = (n) => String(n).padStart(2, '0')

export const formatClock = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`

export function formatDateTime(iso, opts = {}) {
  if (!iso) return 'Sin fecha'
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', ...opts,
  })
}

export function formatDate(iso) {
  if (!iso) return 'Sin fecha'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** ISO -> valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

/** Color de texto legible (negro/blanco) sobre un color de fondo hex. */
export function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '')
  if (!m) return '#ffffff'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff'
}

export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parsea líneas tipo "10 Nombre Apellido D" (número, nombre y posición opcional al final). */
export function parseRoster(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      let rest = line
      let number = null
      let position = 'M'
      const num = /^(\d{1,2})[\s.\-)]+/.exec(rest)
      if (num) {
        number = Number(num[1])
        rest = rest.slice(num[0].length)
      }
      const pos = /\s+\(?([GDMF])\)?$/i.exec(rest)
      if (pos) {
        position = pos[1].toUpperCase()
        rest = rest.slice(0, pos.index)
      }
      return { name: rest.trim(), number, position }
    })
    .filter((p) => p.name)
}
