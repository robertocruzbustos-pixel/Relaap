import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken } from './api.js'

const deriveRole = (bundle, userId) => {
  if (bundle.match.owner_id === userId) return 'owner'
  return bundle.members.find((m) => m.id === userId)?.role ?? null
}

/**
 * Carga un partido, se mantiene sincronizado por WebSocket y expone acciones optimistas.
 * Devuelve el estado del partido, acciones optimistas y el chat (messages, unread, sendMessage).
 */
export function useMatch(matchId, userId) {
  const id = Number(matchId)
  const [state, setState] = useState({ loading: true, error: null, bundle: null, role: null })
  const [presence, setPresence] = useState([])
  const [connected, setConnected] = useState(false)
  const offsetRef = useRef(0) // hora del servidor - hora local
  const hasConnected = useRef(false)
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const chatVisible = useRef(false)

  const syncClock = (serverTime) => {
    if (serverTime) offsetRef.current = serverTime - Date.now()
  }

  // Reemplaza el estado con un bundle completo (respuesta HTTP o mensaje del socket).
  const apply = useCallback(
    (data) => {
      syncClock(data.server_time)
      const bundle = { match: data.match, players: data.players, events: data.events, members: data.members }
      const role = data.role ?? deriveRole(bundle, userId)
      setState({ loading: false, error: role ? null : 'not_found', bundle, role })
    },
    [userId],
  )

  const reload = useCallback(async () => {
    try {
      apply(await api.get(`/matches/${id}`))
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.status === 404 ? 'not_found' : err.message }))
    }
  }, [id, apply])

  const loadMessages = useCallback(async () => {
    try {
      setMessages((await api.get(`/matches/${id}/messages`)).messages)
    } catch {
      /* el chat no es crítico: si falla, el resto del partido sigue funcionando */
    }
  }, [id])

  useEffect(() => {
    setState({ loading: true, error: null, bundle: null, role: null })
    setMessages([])
    setUnread(0)
    reload()
    loadMessages()
  }, [reload, loadMessages])

  useEffect(() => {
    let ws
    let closed = false
    let retries = 0
    let timer

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(getToken() ?? '')}`)
      ws.onopen = () => {
        retries = 0
        setConnected(true)
        ws.send(JSON.stringify({ type: 'subscribe', matchId: id }))
        // Tras una reconexión se pudo perder algún mensaje: se recarga el estado completo.
        if (hasConnected.current) {
          reload()
          loadMessages()
        }
        hasConnected.current = true
      }
      ws.onmessage = (e) => {
        let msg
        try {
          msg = JSON.parse(e.data)
        } catch {
          return
        }
        if (msg.matchId !== id) return
        syncClock(msg.server_time)
        if (msg.type === 'bundle') apply(msg.bundle)
        else if (msg.type === 'player') {
          setState((s) =>
            s.bundle
              ? { ...s, bundle: { ...s.bundle, players: s.bundle.players.map((p) => (p.id === msg.player.id ? msg.player : p)) } }
              : s,
          )
        } else if (msg.type === 'message') {
          setMessages((list) => (list.some((m) => m.id === msg.message.id) ? list : [...list, msg.message]))
          if (!chatVisible.current && msg.message.user_id !== userId) setUnread((n) => n + 1)
        } else if (msg.type === 'presence') setPresence(msg.users)
        else if (msg.type === 'members_changed') reload()
        else if (msg.type === 'deleted') setState((s) => ({ ...s, error: 'deleted' }))
      }
      ws.onclose = () => {
        setConnected(false)
        if (closed) return
        retries += 1
        timer = setTimeout(connect, Math.min(8000, 400 * 2 ** retries))
      }
      ws.onerror = () => ws.close()
    }

    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      ws?.close()
    }
  }, [id, apply, reload, loadMessages, userId])

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  // Cambios optimistas sobre un jugador (posición, notas, en cancha…): se ven al instante y se persisten en segundo plano.
  const updatePlayer = useCallback(
    async (playerId, fields) => {
      const merge = (fn) =>
        setState((s) => (s.bundle ? { ...s, bundle: { ...s.bundle, players: s.bundle.players.map((p) => (p.id === playerId ? fn(p) : p)) } } : s))
      merge((p) => ({ ...p, ...fields }))
      try {
        const d = await api.patch(`/matches/${id}/players/${playerId}`, fields)
        merge(() => d.player)
      } catch (err) {
        reload()
        throw err
      }
    },
    [id, reload],
  )

  const movePlayer = useCallback((playerId, x, y) => updatePlayer(playerId, { x, y }), [updatePlayer])

  const sendMessage = useCallback(
    async (body) => {
      const d = await api.post(`/matches/${id}/messages`, { body })
      setMessages((list) => (list.some((m) => m.id === d.message.id) ? list : [...list, d.message]))
    },
    [id],
  )

  // El panel de chat avisa cuándo está a la vista para no contar como "sin leer" lo que ya se ve.
  const setChatVisible = useCallback((visible) => {
    chatVisible.current = visible
    if (visible) setUnread(0)
  }, [])

  return {
    ...state, presence, connected, apply, reload, serverNow, movePlayer, updatePlayer,
    messages, unread, sendMessage, setChatVisible,
  }
}
