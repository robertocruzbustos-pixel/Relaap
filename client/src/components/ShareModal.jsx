import { useEffect, useState } from 'react'
import { Check, Copy, LogOut, UserPlus, Users, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { ASSIGNABLE_ROLES, ROLE_HELP, ROLE_LABEL } from '../lib/constants.js'
import { Field, Modal, useAction, useFeedback } from './ui.jsx'
import { copyText } from './PhraseList.jsx'

function RoleSelect({ value, onChange, label, className = '' }) {
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {ASSIGNABLE_ROLES.map((r) => (
        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
      ))}
    </select>
  )
}

export default function ShareModal({ bundle, role, userId, matchId, apply, onClose }) {
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState('editor')
  const [copied, setCopied] = useState(false)
  const [crews, setCrews] = useState([])
  const [crewId, setCrewId] = useState('')
  const isOwner = role === 'owner'
  const { match, members } = bundle

  useEffect(() => {
    if (isOwner) api.get('/crews').then((d) => setCrews(d.crews)).catch(() => {})
  }, [isOwner])

  const add = (e) => {
    e.preventDefault()
    run(async () => {
      apply(await api.post(`/matches/${matchId}/members`, { email, role: newRole }))
      setEmail('')
      feedback.success('Integrante agregado')
    })
  }

  const addCrew = () =>
    run(async () => {
      apply(await api.post(`/matches/${matchId}/members/crew`, { crew_id: Number(crewId) }))
      feedback.success('Equipo agregado al partido')
    })

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
    <Modal title="Equipo de transmisión" onClose={onClose} wide>
      <p className="mb-4 text-sm text-slate-400">
        Sumá a quienes participan de la transmisión. Todos ven el partido en tiempo real desde su propia cuenta, con permisos según su rol.
      </p>

      {isOwner && (
        <>
          {crews.length > 0 && (
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <Field label="Sumar un equipo guardado" className="min-w-52 flex-1">
                <select className="input" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
                  <option value="">Elegí un equipo…</option>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.members.length})</option>
                  ))}
                </select>
              </Field>
              <button className="btn-secondary" onClick={addCrew} disabled={busy || !crewId}>
                <Users className="h-4 w-4" /> Sumar equipo
              </button>
            </div>
          )}

          <form onSubmit={add} className="mb-1 flex flex-wrap items-end gap-2">
            <Field label="Agregar por email" className="min-w-52 flex-1">
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="comentarista@correo.com" />
            </Field>
            <Field label="Rol">
              <RoleSelect value={newRole} onChange={setNewRole} label="Rol del nuevo integrante" />
            </Field>
            <button className="btn-primary" disabled={busy}>
              <UserPlus className="h-4 w-4" /> Agregar
            </button>
          </form>
          <p className="mb-2 text-xs text-slate-500">{ROLE_HELP[newRole]}</p>
          <p className="mb-5 text-xs text-slate-500">
            ¿Trabajan siempre con las mismas personas? Guardalas en un{' '}
            <Link to="/equipo" className="text-emerald-400 hover:underline" onClick={onClose}>equipo de transmisión</Link> y se suman solas a cada partido nuevo.
          </p>
        </>
      )}

      <h3 className="label">Con acceso</h3>
      <ul className="mb-4 divide-y divide-slate-800 rounded-lg border border-slate-800">
        <li className="flex items-center justify-between px-3 py-2 text-sm">
          <span>{match.owner_name} <span className="text-slate-500">(creador)</span></span>
          <span className="badge bg-emerald-500/15 text-emerald-300">{ROLE_LABEL.owner}</span>
        </li>
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{m.name}</span>
              <span className="block truncate text-xs text-slate-500">{m.email}</span>
            </span>
            {isOwner ? (
              <RoleSelect value={m.role} onChange={(v) => changeRole(m, v)} label={`Rol de ${m.name}`} className="!w-auto !py-1 text-xs" />
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
