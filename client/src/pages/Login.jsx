import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ClipboardList, Mic, Radio, Users } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { Field, Spinner } from '../components/ui.jsx'

const FEATURES = [
  { icon: ClipboardList, title: 'Previa ordenada', text: 'Plantillas, notas y datos curiosos listos antes de salir al aire.' },
  { icon: Radio, title: 'Relato en vivo', text: 'Cancha táctica, reloj y eventos que se sincronizan entre dispositivos.' },
  { icon: Users, title: 'Trabajo en equipo', text: 'Compartí el partido con tu comentarista u operador, en tiempo real.' },
]

export default function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', code: '' })
  const [showCode, setShowCode] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'login') await login(form.email, form.password)
      else await register({ name: form.name, email: form.email, password: form.password, ...(form.code ? { code: form.code } : {}) })
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-emerald-950 p-12 lg:flex">
        <div className="grass absolute inset-0 opacity-25" aria-hidden />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-400 text-emerald-950">
            <Mic className="h-6 w-6" />
          </span>
          <span className="font-display text-3xl font-bold tracking-wide">Relator Pro</span>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-display text-6xl font-bold leading-[0.95] tracking-wide text-white">
            Tu cabina,
            <br />
            <span className="text-emerald-300">siempre lista.</span>
          </h1>
          <p className="mt-5 text-lg text-emerald-100/80">
            La herramienta pensada para relatores independientes: preparás, relatás y archivás cada partido en un solo lugar.
          </p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-1 h-5 w-5 shrink-0 text-emerald-300" />
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="text-sm text-emerald-100/70">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-emerald-100/50">Datos de partidos vía API-Football (opcional) o carga manual.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="mb-2 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-emerald-950">
              <Mic className="h-5 w-5" />
            </span>
            <span className="font-display text-2xl font-bold tracking-wide">Relator Pro</span>
          </div>

          <div>
            <h2 className="font-display text-3xl font-semibold tracking-wide">{mode === 'login' ? 'Ingresar' : 'Crear cuenta'}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {mode === 'login' ? 'Bienvenido de vuelta a la cabina.' : 'Empezá gratis: te dejamos un banco de frases de arranque.'}
            </p>
          </div>

          {mode === 'register' && (
            <Field label="Nombre">
              <input className="input" value={form.name} onChange={set('name')} required minLength={2} autoComplete="name" />
            </Field>
          )}
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
          </Field>
          <Field label="Contraseña" hint={mode === 'register' ? 'Mínimo 8 caracteres.' : undefined}>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={set('password')}
              required
              minLength={mode === 'register' ? 8 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </Field>

          {mode === 'register' &&
            (showCode ? (
              <Field label="Código de invitación">
                <input className="input" value={form.code} onChange={set('code')} />
              </Field>
            ) : (
              <button type="button" className="text-xs text-slate-400 underline hover:text-slate-200" onClick={() => setShowCode(true)}>
                ¿Tenés un código de invitación?
              </button>
            ))}

          {error && (
            <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/60 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button className="btn-primary w-full py-2.5" disabled={busy}>
            {busy && <Spinner className="h-4 w-4 !text-emerald-950" />}
            {mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>

          <p className="text-center text-sm text-slate-400">
            {mode === 'login' ? '¿Primera vez?' : '¿Ya tenés cuenta?'}{' '}
            <button
              type="button"
              className="font-medium text-emerald-400 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
              }}
            >
              {mode === 'login' ? 'Creá tu cuenta' : 'Ingresá'}
            </button>
          </p>
        </form>
      </section>
    </div>
  )
}
