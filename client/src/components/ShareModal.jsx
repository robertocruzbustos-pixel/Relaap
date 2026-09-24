import { useState } from 'react'
import { Check, Copy, LogOut, UserPlus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { Field, Modal, useAction, useFeedback } from './ui.jsx'
import { copyText } from './PhraseList.jsx'

const ROLE_LABEL = { editor: 'Puede editar', viewer: 'Solo lectura' }

export default function ShareModal({ bundle, role, userId, matchId, apply, onClose }) {
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState('editor')
  const [copied, setCopied] = useState(false)
  const isOwner = role === 'owner'
  const { match, members } = bundle

  const add = (e) => {
    e.preventDefault()
    run(async () => {
      apply(await api.post(`/matches/${matchId}/members`, { email, role: newRole }))
      setEmail('')
      feedback.success('Colaborador agregado')
    })
  }

  const changeRole = (m, value) => run(async () => apply(await api.post(`/matches/${matchId}/members`, { email: m.email, role: value })))

  const remove = (m) =>
    run(async () => {
      await api.del(`/matches/${matchId}/members/${m.id}`)
      if (m.id === userId) return navigate('/partidos')
      apply(await api.get(`/matches/${matchId}`))
    })

  const copyLink = async () => {
    await copyText(`${window.location.origin}/partidos/${matchId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal title="Compartir partido" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-400">
        Quienes agregues ven el partido en tiempo real desde su propia cuenta. Los editores pueden mover jugadores, manejar el reloj y cargar eventos.
      </p>

      {isOwner && (
        <form onSubmit={add} className="mb-5 flex flex-wrap items-end gap-2">
          <Field label="Email del colaborador" className="min-w-52 flex-1">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="comentarista@correo.com" />
          </Field>
          <Field label="Permiso">
            <select className="input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </Field>
          <button className="btn-primary" disabled={busy}>
            <UserPlus className="h-4 w-4" /> Agregar
          </button>
        </form>
      )}

      <h3 className="label">Con acceso</h3>
      <ul className="mb-4 divide-y divide-slate-800 rounded-lg border border-slate-800">
        <li className="flex items-center justify-between px-3 py-2 text-sm">
          <span>{match.owner_name} <span className="text-slate-500">(creador)</span></span>
          <span className="badge bg-emerald-500/15 text-emerald-300">Propietario</span>
        </li>
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{m.name}</span>
              <span className="block truncate text-xs text-slate-500">{m.email}</span>
            </span>
            {isOwner ? (
              <select className="input !w-auto !py-1 text-xs" value={m.role} onChange={(e) => changeRole(m, e.target.value)} aria-label={`Permiso de ${m.name}`}>
                {Object.entries(ROLE_LABEL).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            ) : (
              <span className="badge bg-slate-800 text-slate-300">{ROLE_LABEL[m.role]}</span>
            )}
            {(isOwner || m.id === userId) && (
              <button className="btn-ghost btn-sm !px-1.5 text-red-400" onClick={() => remove(m)} aria-label={m.id === userId ? 'Salir del partido' : `Quitar a ${m.name}`}>
                {m.id === userId ? <LogOut className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </button>
            )}
          </li>
        ))}
        {members.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">Todavía no compartiste este partido.</li>}
      </ul>

      <button className="btn-secondary btn-sm" onClick={copyLink}>
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />} Copiar enlace
      </button>
      <p className="mt-1 text-xs text-slate-500">El enlace solo abre el partido a quienes ya agregaste (necesitan tener cuenta).</p>
    </Modal>
  )
}
