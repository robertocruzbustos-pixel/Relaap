import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, Printer, Save, Sparkles } from 'lucide-react'
import { api } from '../../lib/api.js'
import { EVENT_META } from '../../lib/constants.js'
import { formatDate } from '../../lib/format.js'
import { buildSummary, countEvents } from '../../lib/summary.js'
import { copyText } from '../../components/PhraseList.jsx'
import Timeline, { describeEvent } from '../../components/Timeline.jsx'
import { TeamDot, useAction, useFeedback } from '../../components/ui.jsx'

const STAT_ROWS = [
  ['yellow', 'Tarjetas amarillas'],
  ['red', 'Tarjetas rojas'],
  ['substitution', 'Cambios'],
  ['corner', 'Córners'],
  ['chance', 'Ocasiones'],
  ['save', 'Atajadas'],
  ['foul', 'Faltas'],
  ['offside', 'Offsides'],
]

export default function PostmatchTab({ ctx }) {
  const { bundle, canEdit, apply, matchId } = ctx
  const { match, events } = bundle
  const feedback = useFeedback()
  const [run, busy] = useAction()
  const [text, setText] = useState(match.summary)
  const [copied, setCopied] = useState(false)
  const counts = useMemo(() => countEvents(events), [events])
  const dirty = text !== match.summary

  useEffect(() => setText(match.summary), [match.summary])

  const generate = () => {
    if (text.trim() && !window.confirm('Ya hay un resumen escrito. ¿Reemplazarlo por uno generado automáticamente?')) return
    setText(buildSummary(bundle))
  }

  const save = () =>
    run(async () => {
      apply(await api.patch(`/matches/${matchId}`, { summary: text }))
      feedback.success('Resumen guardado')
    })

  const copy = async () => {
    await copyText(text || buildSummary(bundle))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const blob = new Blob([text || buildSummary(bundle)], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${match.home_name} vs ${match.away_name}.txt`.replace(/[\\/:*?"<>|]/g, '')
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const scorers = events.filter((e) => ['goal', 'penalty_goal', 'own_goal'].includes(e.type))
  const cards = events.filter((e) => e.type === 'yellow' || e.type === 'red')

  return (
    <>
      <div className="no-print grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Estadísticas del relato</h2>
            <div className="mb-3 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2"><TeamDot color={match.home_color} /> {match.home_name}</span>
              <span className="flex items-center gap-2">{match.away_name} <TeamDot color={match.away_color} /></span>
            </div>
            <StatBar label="Goles" home={match.home_score} away={match.away_score} homeColor={match.home_color} awayColor={match.away_color} />
            {STAT_ROWS.map(([type, label]) => (
              <StatBar key={type} label={label} home={counts[type]?.home ?? 0} away={counts[type]?.away ?? 0} homeColor={match.home_color} awayColor={match.away_color} />
            ))}
            <p className="mt-3 text-xs text-slate-500">Se calculan con los eventos que cargaste durante el partido.</p>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Goles y tarjetas</h2>
            {scorers.length + cards.length === 0 ? (
              <p className="text-sm text-slate-500">No se registraron goles ni tarjetas.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {[...scorers, ...cards].sort((a, b) => a.id - b.id).map((e) => {
                  const Icon = EVENT_META[e.type].icon
                  return (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="w-11 text-right font-display font-semibold tabular-nums text-slate-300">{e.minute_label}</span>
                      <Icon className={`h-4 w-4 ${EVENT_META[e.type].color}`} fill={EVENT_META[e.type].fill ? 'currentColor' : 'none'} />
                      <span>{describeEvent(e, match).replace('¡', '').replace('!', '')}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-semibold tracking-wide">Resumen del partido</h2>
              {canEdit && (
                <button className="btn-secondary btn-sm" onClick={generate}>
                  <Sparkles className="h-3.5 w-3.5" /> Generar con los datos
                </button>
              )}
            </div>
            <textarea
              className="input min-h-72 font-mono text-sm leading-relaxed"
              value={text}
              onChange={(e) => setText(e.target.value)}
              readOnly={!canEdit}
              placeholder="Escribí tu resumen o generalo automáticamente con los eventos cargados y después editalo."
              aria-label="Resumen del partido"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {canEdit && (
                <button className="btn-primary" onClick={save} disabled={busy || !dirty}>
                  <Save className="h-4 w-4" /> Guardar resumen
                </button>
              )}
              <button className="btn-secondary" onClick={copy}>
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />} Copiar
              </button>
              <button className="btn-secondary" onClick={download}>
                <Download className="h-4 w-4" /> .txt
              </button>
              <button className="btn-secondary" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </button>
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-display text-xl font-semibold tracking-wide">Cronología completa</h2>
            <Timeline events={events} match={match} canEdit={canEdit} apply={apply} matchId={matchId} />
          </section>
        </div>
      </div>

      <PrintSheet match={match} events={events} summary={text || buildSummary(bundle)} />
    </>
  )
}

function StatBar({ label, home, away, homeColor, awayColor }) {
  const total = home + away
  const hp = total === 0 ? 50 : (home / total) * 100
  return (
    <div className="mb-2.5">
      <div className="mb-0.5 flex items-center justify-between text-sm">
        <span className="w-8 font-display text-lg font-semibold tabular-nums">{home}</span>
        <span className="text-xs text-slate-400">{label}</span>
        <span className="w-8 text-right font-display text-lg font-semibold tabular-nums">{away}</span>
      </div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-slate-800">
        <div style={{ width: `${hp}%`, backgroundColor: total === 0 ? '#334155' : homeColor }} />
        <div style={{ width: `${100 - hp}%`, backgroundColor: total === 0 ? '#334155' : awayColor }} />
      </div>
    </div>
  )
}

/** Hoja limpia que sólo se ve al imprimir o guardar como PDF. */
function PrintSheet({ match, events, summary }) {
  return (
    <div className="print-only print-page">
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>
        {match.home_name} {match.home_score} - {match.away_score} {match.away_name}
      </h1>
      <p style={{ marginBottom: 16 }}>
        {[match.competition, match.venue, match.kickoff_at ? formatDate(match.kickoff_at) : null].filter(Boolean).join(' · ')}
      </p>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 14, marginBottom: 20 }}>{summary}</pre>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Cronología</h2>
      <ul style={{ fontSize: 13, lineHeight: 1.6 }}>
        {events.map((e) => (
          <li key={e.id}>
            <strong>{e.minute_label}</strong> — {describeEvent(e, match)}
          </li>
        ))}
      </ul>
    </div>
  )
}
