import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ClipboardList, FileText, MessageCircle, Radio, Share2, Trash2, X } from 'lucide-react'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { ROLE_LABEL } from '../lib/constants.js'
import { permissionsFor } from '../lib/permissions.js'
import { useMatch } from '../lib/useMatch.js'
import ChatPanel from '../components/ChatPanel.jsx'
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
  const [chatOpen, setChatOpen] = useState(false)
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

  const perms = permissionsFor(m.role, user.id)
  // Quién es quién en el chat: dueño + integrantes con su rol.
  const roleLabels = {
    [m.bundle.match.owner_id]: ROLE_LABEL.owner,
    ...Object.fromEntries(m.bundle.members.map((mem) => [mem.id, ROLE_LABEL[mem.role]])),
  }
  const ctx = { ...m, matchId: Number(id), canEdit: perms.manage, perms, userId: user.id, roleLabels }
  const showChatButton = tab !== 'vivo' // en "En vivo" el chat es una pestaña del panel lateral

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
          {showChatButton && (
            <button className="btn-secondary btn-sm relative" onClick={() => setChatOpen(true)}>
              <MessageCircle className="h-4 w-4" /> Chat
              {m.unread > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-emerald-950">
                  {m.unread > 9 ? '9+' : m.unread}
                </span>
              )}
            </button>
          )}
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

      {chatOpen && showChatButton && (
        <aside className="no-print fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-slate-700 bg-slate-900 p-4 shadow-2xl sm:w-96" aria-label="Chat del equipo">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-wide">Chat del equipo</h2>
            <button className="btn-ghost btn-sm" onClick={() => setChatOpen(false)} aria-label="Cerrar chat">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ChatPanel
            messages={m.messages}
            userId={user.id}
            roleLabels={roleLabels}
            onSend={m.sendMessage}
            setChatVisible={m.setChatVisible}
            height="min-h-0 flex-1"
          />
        </aside>
      )}

      {sharing && (
        <ShareModal bundle={m.bundle} role={m.role} userId={user.id} matchId={Number(id)} apply={m.apply} onClose={() => setSharing(false)} />
      )}
    </div>
  )
}
