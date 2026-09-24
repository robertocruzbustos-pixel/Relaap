import { useRef, useState } from 'react'
import { textOn } from '../lib/format.js'

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))
const round1 = (n) => Math.round(n * 10) / 10

/**
 * Cancha horizontal (local a la izquierda). Las posiciones son porcentajes (0-100),
 * así el mismo dato se ve bien en cualquier tamaño de pantalla.
 * El arrastre usa Pointer Events (mouse, touch y lápiz) y también hay control por teclado.
 */
export default function Pitch({ players, homeColor, awayColor, selectedId, onSelect, onMove, canEdit }) {
  const fieldRef = useRef(null)
  const dragRef = useRef(null)
  const [drag, setDrag] = useState(null) // { id, x, y } mientras se arrastra

  const pointerPct = (e) => {
    const r = fieldRef.current.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
  }

  const onPointerDown = (e, p) => {
    if (e.button !== undefined && e.button !== 0) return
    onSelect(p.id)
    if (!canEdit) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* algunos navegadores lo rechazan; el arrastre sigue funcionando sin captura */
    }
    const ptr = pointerPct(e)
    // El "agarre" respeta dónde tocaste la ficha: no salta al centro.
    dragRef.current = { id: p.id, sx: e.clientX, sy: e.clientY, dx: p.x - ptr.x, dy: p.y - ptr.y, moved: false }
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return
    d.moved = true
    const ptr = pointerPct(e)
    setDrag({ id: d.id, x: clamp(ptr.x + d.dx, 2, 98), y: clamp(ptr.y + d.dy, 3, 97) })
  }

  const finish = (e, commit) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    if (commit && d.moved) {
      const ptr = pointerPct(e)
      onMove(d.id, round1(clamp(ptr.x + d.dx, 2, 98)), round1(clamp(ptr.y + d.dy, 3, 97)))
    }
    setDrag(null)
  }

  const onKeyDown = (e, p) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      return onSelect(p.id)
    }
    const step = e.shiftKey ? 5 : 1
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!delta || !canEdit) return
    e.preventDefault()
    onMove(p.id, round1(clamp(p.x + delta[0], 2, 98)), round1(clamp(p.y + delta[1], 3, 97)))
  }

  return (
    <div className="@container rounded-xl border-4 border-emerald-950 bg-emerald-950 p-0 shadow-xl" style={{ containerType: 'inline-size' }}>
      <div ref={fieldRef} className="grass relative aspect-[105/68] w-full touch-none select-none overflow-hidden rounded-lg">
        <svg viewBox="0 0 105 68" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="0.35">
            <rect x="3" y="3" width="99" height="62" />
            <line x1="52.5" y1="3" x2="52.5" y2="65" />
            <circle cx="52.5" cy="34" r="8.6" />
            <rect x="3" y="16" width="16" height="36" />
            <rect x="86" y="16" width="16" height="36" />
            <rect x="3" y="26" width="5.5" height="16" />
            <rect x="96.5" y="26" width="5.5" height="16" />
            <path d="M19 27 A8.6 8.6 0 0 1 19 41" />
            <path d="M86 27 A8.6 8.6 0 0 0 86 41" />
            <rect x="1.4" y="30.5" width="1.6" height="7" />
            <rect x="102" y="30.5" width="1.6" height="7" />
          </g>
          <g fill="rgba(255,255,255,0.85)">
            <circle cx="52.5" cy="34" r="0.5" />
            <circle cx="14" cy="34" r="0.45" />
            <circle cx="91" cy="34" r="0.45" />
          </g>
        </svg>

        {players.map((p) => {
          const pos = drag?.id === p.id ? drag : p
          const color = p.side === 'home' ? homeColor : awayColor
          const selected = p.id === selectedId
          const dragging = drag?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              onPointerDown={(e) => onPointerDown(e, p)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => finish(e, true)}
              onPointerCancel={(e) => finish(e, false)}
              onKeyDown={(e) => onKeyDown(e, p)}
              aria-label={`${p.name}, número ${p.number ?? 'sin número'}, ${p.side === 'home' ? 'local' : 'visitante'}`}
              aria-pressed={selected}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center ${canEdit ? 'cursor-grab' : 'cursor-pointer'} ${
                dragging ? 'z-30 cursor-grabbing' : selected ? 'z-20' : 'z-10'
              }`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, touchAction: 'none' }}
            >
              <span
                className={`relative flex items-center justify-center rounded-full border-2 font-display font-bold shadow-lg transition-transform ${
                  selected ? 'scale-110 border-yellow-300 ring-4 ring-yellow-300/40' : 'border-white/90'
                } ${dragging ? 'scale-125' : ''}`}
                style={{
                  width: 'clamp(26px, 4.4cqw, 50px)',
                  height: 'clamp(26px, 4.4cqw, 50px)',
                  backgroundColor: color,
                  color: textOn(color),
                  fontSize: 'clamp(12px, 2.1cqw, 22px)',
                }}
              >
                {p.number ?? '·'}
                {p.yellows > 0 && <Badge className="right-[-14%] top-[-18%] bg-yellow-300" />}
                {p.red && <Badge className="right-[-14%] top-[-18%] bg-red-600" />}
                {p.goals > 0 && (
                  <span
                    className="absolute bottom-[-14%] right-[-22%] flex h-[42%] min-h-[13px] min-w-[13px] items-center justify-center rounded-full bg-white px-0.5 text-[9px] font-bold leading-none text-slate-900"
                    title={`${p.goals} gol(es)`}
                  >
                    ⚽{p.goals > 1 ? p.goals : ''}
                  </span>
                )}
              </span>
              <span
                className="mt-0.5 max-w-[9ch] truncate rounded bg-black/65 px-1 font-medium leading-tight text-white"
                style={{ fontSize: 'clamp(8px, 1.35cqw, 12px)' }}
              >
                {shortName(p.name)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const Badge = ({ className }) => <span className={`absolute h-[38%] w-[26%] min-h-[9px] min-w-[7px] rounded-[1px] ring-1 ring-black/40 ${className}`} />

/** "Juan Carlos Pérez" -> "Pérez"; conserva apellidos con partícula ("De Paul"). */
function shortName(name) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  const prev = parts[parts.length - 2]
  return /^(de|del|di|da|van|von|la|le|mc|mac)$/i.test(prev) ? `${prev} ${last}` : last
}
