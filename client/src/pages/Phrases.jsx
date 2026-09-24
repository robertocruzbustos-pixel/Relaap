import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { PHRASE_CATEGORIES } from '../lib/constants.js'
import PhraseList from '../components/PhraseList.jsx'
import { Field, Modal, PageHeader, PageLoader, useAction, useFeedback } from '../components/ui.jsx'

export default function Phrases() {
  const feedback = useFeedback()
  const [phrases, setPhrases] = useState(null)
  const [editing, setEditing] = useState(null) // null | {} (nueva) | frase existente

  useEffect(() => {
    api
      .get('/phrases')
      .then((d) => setPhrases(d.phrases))
      .catch((err) => {
        feedback.error(err)
        setPhrases([])
      })
  }, [feedback])

  if (!phrases) return <PageLoader />

  const upsert = (phrase) =>
    setPhrases((list) => (list.some((p) => p.id === phrase.id) ? list.map((p) => (p.id === phrase.id ? phrase : p)) : [phrase, ...list]))

  const remove = async (phrase) => {
    const ok = await feedback.confirm({ title: 'Eliminar frase', message: `«${phrase.text.slice(0, 80)}»`, confirmLabel: 'Eliminar', danger: true })
    if (!ok) return
    try {
      await api.del(`/phrases/${phrase.id}`)
      setPhrases((list) => list.filter((p) => p.id !== phrase.id))
    } catch (err) {
      feedback.error(err)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Banco de frases" subtitle="Tocá una frase para copiarla. Las más usadas suben primero.">
        <button className="btn-primary" onClick={() => setEditing({})}>
          <Plus className="h-4 w-4" /> Nueva frase
        </button>
      </PageHeader>

      <ManageList phrases={phrases} onChange={upsert} onEdit={setEditing} onDelete={remove} />

      {editing && <PhraseModal phrase={editing} onClose={() => setEditing(null)} onSaved={upsert} />}
    </div>
  )
}

// La lista compartida + acciones de edición/borrado al costado de cada frase.
function ManageList({ phrases, onChange, onEdit, onDelete }) {
  return (
    <div className="space-y-4">
      <PhraseList phrases={phrases} onChange={onChange} />
      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-300">Editar o eliminar frases ({phrases.length})</summary>
        <ul className="mt-3 divide-y divide-slate-800">
          {phrases.map((p) => (
            <li key={p.id} className="flex items-start gap-3 py-2">
              <span className="badge shrink-0 bg-slate-800 text-slate-300">{PHRASE_CATEGORIES[p.category]}</span>
              <span className="flex-1 text-slate-300">{p.text}</span>
              <span className="shrink-0 text-xs text-slate-500">{p.uses} usos</span>
              <button className="btn-ghost btn-sm" onClick={() => onEdit(p)} aria-label="Editar frase">
                <Pencil className="h-4 w-4" />
              </button>
              <button className="btn-ghost btn-sm text-red-400" onClick={() => onDelete(p)} aria-label="Eliminar frase">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function PhraseModal({ phrase, onClose, onSaved }) {
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [text, setText] = useState(phrase.text ?? '')
  const [category, setCategory] = useState(phrase.category ?? 'otras')

  const submit = (e) => {
    e.preventDefault()
    run(async () => {
      const d = phrase.id ? await api.patch(`/phrases/${phrase.id}`, { text, category }) : await api.post('/phrases', { text, category })
      onSaved(d.phrase)
      feedback.success('Frase guardada')
      onClose()
    })
  }

  return (
    <Modal
      title={phrase.id ? 'Editar frase' : 'Nueva frase'}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" form="phrase-form" disabled={busy}>Guardar</button>
        </>
      }
    >
      <form id="phrase-form" onSubmit={submit} className="space-y-3">
        <Field label="Categoría">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(PHRASE_CATEGORIES).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>
        <Field label="Frase">
          <textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} required maxLength={1000} />
        </Field>
      </form>
    </Modal>
  )
}
