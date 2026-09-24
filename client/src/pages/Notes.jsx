import { useEffect, useMemo, useState } from 'react'
import { NotebookPen, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { formatDateTime } from '../lib/format.js'
import { EmptyState, Field, Modal, PageHeader, PageLoader, useAction, useFeedback } from '../components/ui.jsx'

export default function Notes() {
  const feedback = useFeedback()
  const [notes, setNotes] = useState(null)
  const [matches, setMatches] = useState([])
  const [editing, setEditing] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([api.get('/notes'), api.get('/matches')])
      .then(([n, m]) => {
        setNotes(n.notes)
        setMatches(m.matches)
      })
      .catch((err) => {
        feedback.error(err)
        setNotes([])
      })
  }, [feedback])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (notes ?? []).filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
  }, [notes, search])

  if (!notes) return <PageLoader />

  const upsert = (note) =>
    setNotes((list) => {
      const withMatch = { ...note, ...(matches.find((m) => m.id === note.match_id) ? { home_name: matches.find((m) => m.id === note.match_id).home_name, away_name: matches.find((m) => m.id === note.match_id).away_name } : {}) }
      const next = list.some((n) => n.id === note.id) ? list.map((n) => (n.id === note.id ? withMatch : n)) : [withMatch, ...list]
      return next.sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updated_at) - new Date(a.updated_at))
    })

  const togglePin = async (note) => {
    try {
      upsert((await api.patch(`/notes/${note.id}`, { pinned: !note.pinned })).note)
    } catch (err) {
      feedback.error(err)
    }
  }

  const remove = async (note) => {
    if (!(await feedback.confirm({ title: 'Eliminar nota', message: note.title || 'Esta nota', confirmLabel: 'Eliminar', danger: true }))) return
    try {
      await api.del(`/notes/${note.id}`)
      setNotes((l) => l.filter((n) => n.id !== note.id))
    } catch (err) {
      feedback.error(err)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Notas" subtitle="Apuntes privados. Fijá las importantes para verlas en todos tus partidos.">
        <button className="btn-primary" onClick={() => setEditing({})}>
          <Plus className="h-4 w-4" /> Nueva nota
        </button>
      </PageHeader>

      <div className="relative mb-5 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <input className="input pl-9" placeholder="Buscar en notas…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar notas" />
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={NotebookPen} title={notes.length ? 'Sin resultados' : 'No tenés notas todavía'}>
          {notes.length ? 'Probá con otra búsqueda.' : 'Anotá datos, ideas de relato o recordatorios; podés asociarlos a un partido.'}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((n) => (
            <article key={n.id} className={`card flex flex-col p-4 ${n.pinned ? 'border-amber-500/40' : ''}`}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-white">{n.title || 'Sin título'}</h3>
                <button onClick={() => togglePin(n)} aria-label={n.pinned ? 'Desfijar' : 'Fijar'} className="text-slate-500 hover:text-amber-300">
                  {n.pinned ? <Pin className="h-4 w-4 fill-amber-300 text-amber-300" /> : <PinOff className="h-4 w-4" />}
                </button>
              </div>
              <p className="line-clamp-6 flex-1 whitespace-pre-wrap text-sm text-slate-300">{n.body}</p>
              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="truncate">
                  {n.match_id ? <Link to={`/partidos/${n.match_id}`} className="text-sky-300 hover:underline">{n.home_name} vs {n.away_name}</Link> : formatDateTime(n.updated_at)}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button className="btn-ghost btn-sm" onClick={() => setEditing(n)}>Editar</button>
                  <button className="btn-ghost btn-sm text-red-400" onClick={() => remove(n)} aria-label="Eliminar nota">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <NoteModal note={editing} matches={matches} onClose={() => setEditing(null)} onSaved={upsert} />}
    </div>
  )
}

function NoteModal({ note, matches, onClose, onSaved }) {
  const [run, busy] = useAction()
  const [form, setForm] = useState({ title: note.title ?? '', body: note.body ?? '', pinned: note.pinned ?? false, match_id: note.match_id ?? '' })

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      const body = { ...form, match_id: form.match_id === '' ? null : Number(form.match_id) }
      const d = note.id ? await api.patch(`/notes/${note.id}`, body) : await api.post('/notes', body)
      onSaved(d.note)
      onClose()
    })
  }

  return (
    <Modal
      title={note.id ? 'Editar nota' : 'Nueva nota'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" form="note-form" disabled={busy}>Guardar</button>
        </>
      }
    >
      <form id="note-form" onSubmit={submit} className="space-y-3">
        <Field label="Título">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} />
        </Field>
        <Field label="Contenido">
          <textarea className="input min-h-40" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Asociar a un partido">
            <select className="input" value={form.match_id} onChange={(e) => setForm({ ...form, match_id: e.target.value })}>
              <option value="">Ninguno</option>
              {matches.map((m) => (
                <option key={m.id} value={m.id}>{m.home_name} vs {m.away_name}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="h-4 w-4 accent-emerald-500" />
            Fijar (visible en todos los partidos)
          </label>
        </div>
      </form>
    </Modal>
  )
}
