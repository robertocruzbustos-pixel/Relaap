import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClipboardList, FileText, Radio, Share2, Trash2 } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { useMatch } from '../lib/useMatch.js'
import ScoreBoard from '../components/ScoreBoard.jsx'
import ShareModal from '../components/ShareModal.jsx'
import { EmptyState, PageLoader, useFeedback } from '../components/ui.jsx'
import LiveTab from './match/LiveTab.jsx'
import PostmatchTab from './match/PostmatchTab.jsx'
import PrematchTab from './match/PrematchTab.jsx'

const TABS = [
  { id: 'previa', label: 'Previa', icon: ClipboardList },
  { id: 'vivo', label: 'En vivo', icon: Radio },
  { id: 'post', label: 'Post-partido', icon: FileText },
]

export default function MatchPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const feedback = useFeedback()
  const [params, setParams] = useSearchParams()
  const [sharing, setSharing] = useState(false)
  const m = useMatch(id, user.id)

  const status = m.bundle?.match.status
  const requested = params.get('tab')
  const defaultTab = status === 'live' ? 'vivo' : status === 'finished' ? 'post' : 'previa'
  const tab = TABS.some((t) => t.id === requested) ? requested : defaultTab

  useEffect(() => {
    if (m.bundle) document.title = `${m.bundle.match.home_name} vs ${m.bundle.match.away_name} · Relator Pro`
    return () => {
      document.title = 'Relator Pro'
    }
  }, [m.bundle?.match.home_name, m.bundle?.match.away_name]) // eslint-disable-line react-hooks/exhaustive-deps

  if (m.loading) return <PageLoader />
  if (m.error || !m.bundle) {
    const gone = m.error === 'deleted'
    return (
      <EmptyState
        title={m.error === 'not_found' ? 'No encontramos este partido' : gone ? 'Este partido fue eliminado' : m.error ?? 'Error'}
        action={<Link to="/partidos" className="btn-secondary">Volver a partidos</Link>}
      >
        {m.error === 'not_found' ? 'Puede que no exista o que ya no tengas acceso.' : undefined}
      </EmptyState>
    )
  }

  const canEdit = m.role === 'owner' || m.role === 'editor'
  const ctx = { ...m, matchId: Number(id), canEdit }

  const remove = async () => {
    const ok = await feedback.confirm({
      title: 'Eliminar partido',
      message: 'Se borra el partido con su alineación, eventos y resumen. No se puede deshacer.',
      confirmLabel: 'Eliminar partido',
      danger: true,
    })
    if (!ok) return
    try {
      await api.del(`/matches/${id}`)
      navigate('/partidos')
    } catch (err) {
      feedback.error(err)
    }
  }

  return (
    <div className="mx-auto max-w-[110rem]">
      <ScoreBoard match={m.bundle.match} serverNow={m.serverNow} presence={m.presence} connected={m.connected} />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 border-b border-slate-800">
        <div className="flex gap-1" role="tablist">
          {TABS.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              role="tab"
              aria-selected={tab === tabId}
              onClick={() => setParams({ tab: tabId }, { replace: true })}
              className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium sm:px-4 ${
                tab === tabId ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
              {tabId === 'vivo' && status === 'live' && <span className="live-dot h-2 w-2 rounded-full bg-red-500" aria-label="En vivo" />}
            </button>
          ))}
        </div>
        <div className="mb-1 ml-auto flex gap-1.5">
          <button className="btn-secondary btn-sm" onClick={() => setSharing(true)}>
            <Share2 className="h-4 w-4" /> Compartir{m.bundle.members.length > 0 ? ` (${m.bundle.members.length})` : ''}
          </button>
          {m.role === 'owner' && (
            <button className="btn-ghost btn-sm text-red-400" onClick={remove} aria-label="Eliminar partido">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {tab === 'previa' && <PrematchTab ctx={ctx} />}
      {tab === 'vivo' && <LiveTab ctx={ctx} />}
      {tab === 'post' && <PostmatchTab ctx={ctx} />}

      {sharing && (
        <ShareModal bundle={m.bundle} role={m.role} userId={user.id} matchId={Number(id)} apply={m.apply} onClose={() => setSharing(false)} />
      )}
    </div>
  )
}
