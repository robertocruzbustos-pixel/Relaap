import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, LoaderCircle, X } from 'lucide-react'
import { STATUS_LABEL } from '../lib/constants.js'

export function Spinner({ className = '' }) {
  return <LoaderCircle className={`animate-spin text-emerald-400 ${className}`} aria-label="Cargando" />
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-700 px-6 py-12 text-center">
      {Icon && <Icon className="h-10 w-10 text-slate-600" aria-hidden />}
      <p className="font-medium text-slate-200">{title}</p>
      {children && <p className="max-w-md text-sm text-slate-400">{children}</p>}
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-wide text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function StatusBadge({ status }) {
  const styles = {
    live: 'bg-red-500/15 text-red-300',
    scheduled: 'bg-sky-500/15 text-sky-300',
    finished: 'bg-slate-700/60 text-slate-300',
  }
  return (
    <span className={`badge ${styles[status] ?? styles.finished}`}>
      {status === 'live' && <span className="live-dot h-2 w-2 rounded-full bg-red-500" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

export function TeamDot({ color, className = '' }) {
  return <span className={`inline-block h-3 w-3 shrink-0 rounded-full ring-1 ring-white/30 ${className}`} style={{ backgroundColor: color }} />
}

export function Modal({ title, onClose, children, wide = false, footer }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const previous = document.activeElement
    ref.current?.querySelector('input, select, textarea, button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-slate-700 bg-slate-900 shadow-2xl sm:rounded-2xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="font-display text-xl font-semibold tracking-wide">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ----- Avisos y confirmaciones -----

const FeedbackContext = createContext(null)

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [dialog, setDialog] = useState(null)
  const nextId = useRef(1)

  const push = useCallback((message, kind) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, message, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000)
  }, [])

  const confirm = useCallback(
    ({ title, message, confirmLabel = 'Confirmar', danger = false }) =>
      new Promise((resolve) => setDialog({ title, message, confirmLabel, danger, resolve })),
    [],
  )

  const api = useMemo(
    () => ({
      success: (m) => push(m, 'success'),
      error: (m) => push(typeof m === 'string' ? m : m?.message ?? 'Ocurrió un error', 'error'),
      confirm,
    }),
    [push, confirm],
  )

  const close = (result) => {
    dialog?.resolve(result)
    setDialog(null)
  }

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div className="no-print pointer-events-none fixed bottom-20 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 lg:bottom-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm shadow-lg ${
              t.kind === 'error' ? 'border-red-500/40 bg-red-950 text-red-100' : 'border-emerald-500/40 bg-emerald-950 text-emerald-100'
            }`}
          >
            {t.kind === 'error' ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => close(false)}>
                Cancelar
              </button>
              <button className={dialog.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
                {dialog.confirmLabel}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-300">{dialog.message}</p>
        </Modal>
      )}
    </FeedbackContext.Provider>
  )
}

export const useFeedback = () => useContext(FeedbackContext)

/** Ejecuta una acción async mostrando el error como aviso. Devuelve [run, busy]. */
export function useAction() {
  const feedback = useFeedback()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    async (fn) => {
      setBusy(true)
      try {
        return await fn()
      } catch (err) {
        feedback.error(err)
        return undefined
      } finally {
        setBusy(false)
      }
    },
    [feedback],
  )
  return [run, busy]
}
