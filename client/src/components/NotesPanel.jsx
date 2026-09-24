import { useEffect, useState } from 'react'
import { Pin, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAction } from './ui.jsx'

/** Notas de la previa, notas del partido y notas fijadas, a mano durante el relato. */
export default function NotesPanel({ match, matchId }) {
  const [notes, setNotes] = useState(null)
  const [draft, setDraft] = useState('')
  const [run, busy] = useAction()

  useEffect(() => {
    api.get(`/notes?match_id=${matchId}`).then((d) => setNotes(d.notes)).catch(() => setNotes([]))
  }, [matchId])

  const add = (e) => {
    e.preventDefault()
    if (!draft.trim()) return
    run(async () => {
      const d = await api.post('/notes', { body: draft.trim(), match_id: matchId })
      setNotes((n) => [d.note, ...(n ?? [])])
      setDraft('')
    })
  }

  return (
    <div className="space-y-4">
      {match.prematch_notes && (
        <section>
          <h3 className="label">Notas de la previa</h3>
          <p className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-200">{match.prematch_notes}</p>
          <Link to={`?tab=previa`} className="mt-1 inline-block text-xs text-emerald-400 hover:underline">Editar en la previa</Link>
        </section>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input className="input" placeholder="Nota rápida del partido…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Nota rápida" />
        <button className="btn-secondary px-3" disabled={busy || !draft.trim()} aria-label="Agregar nota">
          <Plus className="h-4 w-4" />
        </button>
      </form>

      <ul className="space-y-1.5">
        {notes?.map((n) => (
          <li key={n.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5 text-sm">
            {n.pinned && <Pin className="mr-1 inline h-3.5 w-3.5 fill-amber-300 text-amber-300" />}
            {n.title && <strong className="mr-1">{n.title}</strong>}
            <span className="whitespace-pre-wrap text-slate-300">{n.body}</span>
          </li>
        ))}
        {notes && notes.length === 0 && !match.prematch_notes && <p className="py-4 text-center text-sm text-slate-500">Sin notas todavía.</p>}
      </ul>
    </div>
  )
}
