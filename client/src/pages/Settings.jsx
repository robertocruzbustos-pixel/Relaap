import { useEffect, useState } from 'react'
import { CircleCheck, ExternalLink, KeyRound, LogOut, Trash2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { Field, PageHeader, useAction, useFeedback } from '../components/ui.jsx'

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [name, setName] = useState(user.name)
  const [apiKey, setApiKey] = useState('')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [sports, setSports] = useState(null)
  const [account, setAccount] = useState(null) // { plan, used, limit } | { error }

  const loadSports = () => api.get('/sports/status').then(setSports).catch(() => setSports({ configured: false, source: null }))
  useEffect(() => {
    loadSports()
  }, [])

  const loadAccount = () =>
    api
      .get('/sports/account')
      .then(setAccount)
      .catch((err) => setAccount({ error: err.message }))

  useEffect(() => {
    if (sports?.configured) loadAccount()
  }, [sports?.configured])

  const patchMe = (body, okMessage) =>
    run(async () => {
      const d = await api.patch('/auth/me', body)
      setUser(d.user)
      feedback.success(okMessage)
      return d
    })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Ajustes" subtitle="Tu perfil y la integración con la API deportiva." />

      <section className="card p-5">
        <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Perfil</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            patchMe({ name }, 'Perfil actualizado')
          }}
        >
          <Field label="Nombre" className="min-w-52 flex-1">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </Field>
          <button className="btn-primary" disabled={busy || name === user.name}>Guardar</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Email: {user.email}</p>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-semibold tracking-wide">
          <Users className="h-5 w-5 text-emerald-400" /> Equipo de transmisión
        </h2>
        <p className="mb-3 text-sm text-slate-400">Guardá a tus comentaristas y colaboradores de campo para sumarlos a cada partido con un click.</p>
        <Link to="/equipo" className="btn-secondary">Gestionar mi equipo</Link>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-xl font-semibold tracking-wide">
          <KeyRound className="h-5 w-5 text-emerald-400" /> Integración deportiva (API-Football)
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          Con tu propia key importás partidos, planteles y alineaciones oficiales. Se guarda cifrada y solo se usa para tus consultas. El plan gratuito de{' '}
          <a className="inline-flex items-center gap-0.5 text-emerald-400 hover:underline" href="https://www.api-football.com/" target="_blank" rel="noreferrer">
            API-Football <ExternalLink className="h-3 w-3" />
          </a>{' '}
          incluye 100 consultas por día (con límites de temporadas); la app cachea respuestas para cuidar tu cuota.
        </p>

        {sports && (
          <p className={`mb-3 flex items-center gap-2 text-sm ${sports.configured ? 'text-emerald-300' : 'text-amber-300'}`}>
            <CircleCheck className="h-4 w-4" />
            {sports.configured
              ? sports.source === 'user'
                ? 'Usando tu API key personal.'
                : 'Usando la API key compartida del servidor.'
              : 'Sin API key: podés cargar todo manualmente.'}
          </p>
        )}

        {sports?.configured && account && (
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm">
            {account.error ? (
              <span className="text-amber-300">No se pudo leer tu plan: {account.error}</span>
            ) : (
              <>
                <span>Plan: <strong>{account.plan ?? '—'}</strong></span>
                <span>
                  Consultas hoy: <strong>{account.used ?? '—'}</strong> / {account.limit ?? '—'}
                </span>
              </>
            )}
            <button type="button" className="btn-ghost btn-sm ml-auto" onClick={loadAccount} aria-label="Actualizar estado de la cuenta">
              <RefreshCw className="h-3.5 w-3.5" /> Actualizar
            </button>
          </div>
        )}

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            await patchMe({ api_key: apiKey.trim() }, 'API key guardada')
            setApiKey('')
            loadSports()
          }}
        >
          <Field label={user.has_api_key ? 'Reemplazar API key' : 'API key'} className="min-w-64 flex-1">
            <input className="input font-mono" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="••••••••••••••••" />
          </Field>
          <button className="btn-primary" disabled={busy || !apiKey.trim()}>Guardar key</button>
          {user.has_api_key && (
            <button
              type="button"
              className="btn-ghost text-red-400"
              onClick={async () => {
                await patchMe({ api_key: null }, 'API key eliminada')
                loadSports()
              }}
            >
              <Trash2 className="h-4 w-4" /> Quitar
            </button>
          )}
        </form>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Cambiar contraseña</h2>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const d = await patchMe({ current_password: pw.current, new_password: pw.next }, 'Contraseña actualizada')
            if (d) setPw({ current: '', next: '' })
          }}
        >
          <Field label="Contraseña actual">
            <input className="input" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" required />
          </Field>
          <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
            <input className="input" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" minLength={8} required />
          </Field>
          <div className="sm:col-span-2">
            <button className="btn-secondary" disabled={busy}>Actualizar contraseña</button>
          </div>
        </form>
      </section>

      <button className="btn-secondary lg:hidden" onClick={logout}>
        <LogOut className="h-4 w-4" /> Cerrar sesión
      </button>
    </div>
  )
}
