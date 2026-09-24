import { useMemo, useState } from 'react'
import { Check, Copy, Search, Star } from 'lucide-react'
import { api } from '../lib/api.js'
import { PHRASE_CATEGORIES } from '../lib/constants.js'
import { useFeedback } from './ui.jsx'

/** Copia texto al portapapeles (con respaldo para contextos sin la API moderna). */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

/**
 * Lista compacta de frases con búsqueda y filtro por categoría.
 * Click en una frase => se copia (para leerla o pegarla) y suma un uso.
 */
export default function PhraseList({ phrases, onChange, compact = false }) {
  const feedback = useFeedback()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [copied, setCopied] = useState(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return phrases.filter((p) => (!category || p.category === category) && (!q || p.text.toLowerCase().includes(q)))
  }, [phrases, search, category])

  const use = async (phrase) => {
    await copyText(phrase.text)
    setCopied(phrase.id)
    setTimeout(() => setCopied((c) => (c === phrase.id ? null : c)), 1200)
    api.post(`/phrases/${phrase.id}/use`).then((d) => onChange?.(d.phrase)).catch(() => {})
  }

  const toggleFavorite = async (phrase) => {
    try {
      const d = await api.patch(`/phrases/${phrase.id}`, { favorite: !phrase.favorite })
      onChange?.(d.phrase)
    } catch (err) {
      feedback.error(err)
    }
  }

  return (
    <div>
      <div className="relative mb-2">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
        <input className="input pl-9" placeholder="Buscar frase…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar frase" />
      </div>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="Categoría">
        {[['', 'Todas'], ...Object.entries(PHRASE_CATEGORIES)].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setCategory(value)}
            aria-pressed={category === value}
            className={`rounded-full px-2.5 py-0.5 text-xs ${category === value ? 'bg-emerald-500 font-medium text-emerald-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No hay frases para este filtro.</p>
      ) : (
        <ul className={`space-y-1.5 ${compact ? 'max-h-[26rem] overflow-y-auto pr-1' : ''}`}>
          {filtered.map((p) => (
            <li key={p.id} className="group flex items-stretch gap-1">
              <button
                onClick={() => use(p)}
                className="flex flex-1 items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:border-emerald-500/50"
                title="Copiar frase"
              >
                <span className="flex-1">{p.text}</span>
                {copied === p.id ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <Copy className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 group-hover:text-slate-400" />}
              </button>
              <button
                onClick={() => toggleFavorite(p)}
                aria-label={p.favorite ? 'Quitar de favoritas' : 'Marcar como favorita'}
                aria-pressed={p.favorite}
                className="rounded-lg px-1.5 text-slate-600 hover:text-amber-300"
              >
                <Star className={`h-4 w-4 ${p.favorite ? 'fill-amber-300 text-amber-300' : ''}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
