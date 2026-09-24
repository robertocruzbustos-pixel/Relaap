import { useEffect, useState } from 'react'
import { Plus, Star, Trash2, UserPlus, Users, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { ASSIGNABLE_ROLES, ROLE_HELP, ROLE_LABEL } from '../lib/constants.js'
import { EmptyState, Field, PageHeader, PageLoader, useAction, useFeedback } from '../components/ui.jsx'

export default function Crews() {
  const feedback = useFeedback()
  const [crews, setCrews] = useState(null)
  const [name, setName] = useState('')
  const [run, busy] = useAction()

  useEffect(() => {
    api
      .get('/crews')
      .then((d) => setCrews(d.crews))
      .catch((err) => {
        feedback.error(err)
        setCrews([])
      })
  }, [feedback])

  if (!crews) return <PageLoader />

  // Todas las operaciones devuelven la lista actualizada.
  const act = (fn, okMessage) =>
    run(async () => {
      const d = await fn()
      setCrews(d.crews)
      if (okMessage) feedback.success(okMessage)
      return true
    })

  const create = (e) => {
    e.preventDefault()
    act(() => api.post('/crews', { name, is_default: crews.length === 0 }), 'Equipo creado').then((ok) => ok && setName(''))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Equipo de transmisión"
        subtitle="Guardá a las personas con las que trabajás (comentaristas, campo, operador) y sumalas a cada partido con un click."
      />

      <form onSubmit={create} className="card mb-6 flex flex-wrap items-end gap-2 p-4">
        <Field label="Nuevo equipo" className="min-w-52 flex-1">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Cabina titular" required maxLength={80} />
        </Field>
        <button className="btn-primary" disabled={busy}>
          <Plus className="h-4 w-4" /> Crear
        </button>
      </form>

      {crews.length === 0 ? (
        <EmptyState icon={Users} title="Todavía no armaste ningún equipo">
          Creá uno, sumá a tus compañeros por email y marcalo como predeterminado: cada partido nuevo los va a incluir automáticamente.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {crews.map((crew) => (
            <CrewCard key={crew.id} crew={crew} act={act} busy={busy} />
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Los cambios de un equipo se aplican a los partidos nuevos, o cuando lo sumás a mano desde <strong>Compartir</strong> dentro de un partido.
        No modifican los partidos que ya compartiste. Cada persona necesita tener su cuenta creada.
      </p>
    </div>
  )
}

function CrewCard({ crew, act, busy }) {
  const feedback = useFeedback()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('field')

  const add = (e) => {
    e.preventDefault()
    act(() => api.post(`/crews/${crew.id}/members`, { email, role })).then((ok) => ok && setEmail(''))
  }

  const remove = async () => {
    const ok = await feedback.confirm({
      title: 'Eliminar equipo',
      message: `Se borra “${crew.name}”. Los partidos que ya compartiste con este equipo no cambian.`,
      confirmLabel: 'Eliminar',
      danger: true,
    })
    if (ok) act(() => api.del(`/crews/${crew.id}`), 'Equipo eliminado')
  }

  return (
    <section className={`card p-4 ${crew.is_default ? 'border-emerald-500/40' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-xl font-semibold tracking-wide">{crew.name}</h2>
        {crew.is_default && (
          <span className="badge bg-emerald-500/15 text-emerald-300">
            <Star className="h-3 w-3 fill-emerald-300" /> Predeterminado
          </span>
        )}
        <span className="ml-auto flex gap-1.5">
          <button
            className="btn-secondary btn-sm"
            disabled={busy}
            onClick={() => act(() => api.patch(`/crews/${crew.id}`, { is_default: !crew.is_default }))}
            title="Los partidos nuevos incluyen automáticamente a este equipo"
          >
            <Star className="h-3.5 w-3.5" /> {crew.is_default ? 'Quitar predeterminado' : 'Usar en partidos nuevos'}
          </button>
          <button className="btn-ghost btn-sm text-red-400" onClick={remove} aria-label={`Eliminar ${crew.name}`}>
            <Trash2 className="h-4 w-4" />
          </button>
        </span>
      </div>

      {crew.members.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500">Sin integrantes todavía.</p>
      ) : (
        <ul className="mb-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {crew.members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.name}</span>
                <span className="block truncate text-xs text-slate-500">{m.email}</span>
              </span>
              <select
                className="input !w-auto !py-1 text-xs"
                value={m.role}
                aria-label={`Rol de ${m.name}`}
                onChange={(e) => act(() => api.post(`/crews/${crew.id}/members`, { email: m.email, role: e.target.value }))}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
              <button
                className="btn-ghost btn-sm !px-1.5 text-red-400"
                aria-label={`Quitar a ${m.name}`}
                onClick={() => act(() => api.del(`/crews/${crew.id}/members/${m.user_id}`))}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <Field label="Sumar por email" className="min-w-52 flex-1">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@correo.com" required />
        </Field>
        <Field label="Rol">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
        </Field>
        <button className="btn-secondary" disabled={busy}>
          <UserPlus className="h-4 w-4" /> Sumar
        </button>
      </form>
      <p className="mt-1.5 text-xs text-slate-500">{ROLE_HELP[role]}</p>
    </section>
  )
}
