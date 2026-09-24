import { useEffect, useState } from 'react'
import { Eye, ListOrdered, MessageCircle, MessageSquareQuote, NotebookPen, Radio, Users } from 'lucide-react'
import { api } from '../../lib/api.js'
import { useElapsed } from '../../lib/useElapsed.js'
import Bench from '../../components/Bench.jsx'
import ChatPanel from '../../components/ChatPanel.jsx'
import ClockControls from '../../components/ClockControls.jsx'
import EventPad from '../../components/EventPad.jsx'
import NotesPanel from '../../components/NotesPanel.jsx'
import Pitch from '../../components/Pitch.jsx'
import PhraseList from '../../components/PhraseList.jsx'
import PlayerPanel from '../../components/PlayerPanel.jsx'
import SquadList from '../../components/SquadList.jsx'
import SubstitutionModal from '../../components/SubstitutionModal.jsx'
import Timeline from '../../components/Timeline.jsx'
import { useFeedback } from '../../components/ui.jsx'

const TABS = [
  { id: 'eventos', label: 'Eventos', icon: Radio },
  { id: 'cronologia', label: 'Cronología', icon: ListOrdered },
  { id: 'frases', label: 'Frases', icon: MessageSquareQuote },
  { id: 'fichas', label: 'Fichas', icon: Users },
  { id: 'notas', label: 'Notas', icon: NotebookPen },
  { id: 'chat', label: 'Chat', icon: MessageCircle },
]

const ROLE_BANNER = {
  field: 'Modo campo: cargá eventos y cambios desde el estadio. El reloj y las fichas los maneja el editor.',
  commentator: 'Modo comentarista: ves todo en vivo, podés anotar notas y chatear con el equipo.',
  viewer: 'Modo solo lectura: ves el partido en vivo y podés chatear, pero no modificar nada.',
}

export default function LiveTab({ ctx }) {
  const {
    bundle, canEdit, perms, apply, matchId, serverNow, movePlayer, updatePlayer,
    userId, messages, unread, sendMessage, setChatVisible, roleLabels,
  } = ctx
  const { match, players, events } = bundle
  const feedback = useFeedback()
  const elapsed = useElapsed(match, serverNow)

  const [selectedId, setSelectedId] = useState(null)
  const [sub, setSub] = useState(null)
  const [tab, setTab] = useState('eventos')
  const [phrases, setPhrases] = useState(null)

  const hasTeam = bundle.members.length > 0 // con más de una persona, la cronología muestra quién cargó cada evento
  const selected = players.find((p) => p.id === selectedId) ?? null
  const onPitch = players.filter((p) => p.on_pitch && p.x !== null && p.y !== null)

  useEffect(() => {
    if (tab === 'frases' && !phrases) {
      api.get('/phrases').then((d) => setPhrases(d.phrases)).catch(() => setPhrases([]))
    }
  }, [tab, phrases])

  const register = async (body) => {
    try {
      apply(await api.post(`/matches/${matchId}/events`, body))
      return true
    } catch (err) {
      feedback.error(err)
      return false
    }
  }

  const upsertPhrase = (phrase) => setPhrases((list) => list.map((p) => (p.id === phrase.id ? phrase : p)))

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0">
        {canEdit ? (
          <ClockControls match={match} elapsed={elapsed} matchId={matchId} apply={apply} />
        ) : (
          <p className="card mb-3 flex items-center gap-2 px-3 py-2 text-sm text-sky-300">
            <Eye className="h-4 w-4 shrink-0" /> {ROLE_BANNER[perms.role]}
          </p>
        )}

        <Pitch
          players={onPitch}
          homeColor={match.home_color}
          awayColor={match.away_color}
          selectedId={selectedId}
          onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
          onMove={(id, x, y) => movePlayer(id, x, y).catch((err) => feedback.error(err))}
          canEdit={canEdit}
        />
        <p className="mt-1.5 text-xs text-slate-500">
          {canEdit ? 'Arrastrá a los jugadores para reflejar el juego. Tocá uno para asignarle eventos y ver su ficha. Con el teclado: flechas (Shift = más rápido).' : 'Tocá un jugador para ver su ficha.'}
        </p>

        <Bench match={match} players={players} canEdit={perms.substitute} onPick={setSub} />
      </div>

      <aside className="min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto xl:pr-1">
        {selected && (
          <PlayerPanel
            player={selected}
            match={match}
            canEdit={canEdit}
            updatePlayer={updatePlayer}
            onClose={() => setSelectedId(null)}
            onSubstitute={setSub}
          />
        )}

        <div className="card p-3">
          <div className="mb-3 flex gap-0.5 rounded-lg bg-slate-950 p-0.5" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-md px-0.5 py-1.5 text-[10px] font-medium ${
                  tab === id ? 'bg-slate-800 text-emerald-300' : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className="relative">
                  <Icon className="h-4 w-4" />
                  {id === 'chat' && unread > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-emerald-950">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </span>
                {label}
              </button>
            ))}
          </div>

          {tab === 'eventos' && (
            <>
              <EventPad
                match={match}
                players={players}
                selected={selected}
                perms={perms}
                onClearSelected={() => setSelectedId(null)}
                onRegister={register}
                onSubstitute={setSub}
              />
              <h3 className="label mt-4">Últimos eventos</h3>
              <Timeline events={events.slice(-4)} match={match} showAuthors={hasTeam} apply={apply} matchId={matchId} emptyText="Cuando se carguen eventos, aparecen acá." />
            </>
          )}
          {tab === 'cronologia' && (
            <Timeline events={events} match={match} canEditEvent={perms.canModifyEvent} showAuthors={hasTeam} apply={apply} matchId={matchId} />
          )}
          {tab === 'frases' && (phrases ? <PhraseList phrases={phrases} onChange={upsertPhrase} compact /> : <p className="py-6 text-center text-sm text-slate-500">Cargando…</p>)}
          {tab === 'fichas' && <SquadList match={match} players={players} selectedId={selectedId} onSelect={(id) => setSelectedId(id)} />}
          {tab === 'notas' && <NotesPanel match={match} matchId={matchId} />}
          {tab === 'chat' && (
            <ChatPanel messages={messages} userId={userId} roleLabels={roleLabels} onSend={sendMessage} setChatVisible={setChatVisible} />
          )}
        </div>
      </aside>

      {sub && <SubstitutionModal match={match} players={players} matchId={matchId} apply={apply} initial={sub} onClose={() => setSub(null)} />}
    </div>
  )
}
