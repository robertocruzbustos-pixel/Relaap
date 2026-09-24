import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useFeedback } from './ui.jsx'

const time = (iso) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

/** Chat del equipo de transmisión dentro del partido. roleLabels: { [userId]: 'Campo' | ... } */
export default function ChatPanel({ messages, userId, roleLabels, onSend, setChatVisible, height = 'h-[26rem]' }) {
  const feedback = useFeedback()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)

  // Mientras el panel está montado, lo que llega se considera leído.
  useEffect(() => {
    setChatVisible(true)
    return () => setChatVisible(false)
  }, [setChatVisible])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const submit = async (e) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      await onSend(body)
      setDraft('')
    } catch (err) {
      feedback.error(err)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`flex ${height} flex-col`}>
      <ol ref={listRef} className="flex-1 space-y-2 overflow-y-auto pr-1" aria-live="polite" aria-label="Mensajes del equipo">
        {messages.length === 0 && (
          <li className="py-8 text-center text-sm text-slate-500">
            Chat del equipo. Ideal para avisos rápidos entre cabina y campo (“gol anulado”, “ingresa el 14”).
          </li>
        )}
        {messages.map((m) => {
          const mine = m.user_id === userId
          return (
            <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <span className="mb-0.5 text-[11px] text-slate-500">
                {mine ? 'Vos' : (m.author_name ?? 'Usuario eliminado')}
                {!mine && roleLabels[m.user_id] && <span className="text-slate-600"> · {roleLabels[m.user_id]}</span>} · {time(m.created_at)}
              </span>
              <p
                className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                  mine ? 'rounded-br-sm bg-emerald-600 text-white' : 'rounded-bl-sm bg-slate-800 text-slate-100'
                }`}
              >
                {m.body}
              </p>
            </li>
          )
        })}
      </ol>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          className="input"
          placeholder="Escribí un mensaje…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          aria-label="Mensaje"
        />
        <button className="btn-primary px-3" disabled={sending || !draft.trim()} aria-label="Enviar mensaje">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
