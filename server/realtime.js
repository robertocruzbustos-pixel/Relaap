import { WebSocketServer } from 'ws'
import { query } from './db.js'
import { verifyToken } from './lib/auth.js'
import { getMatchRole } from './lib/access.js'

// matchId -> Set<ws>
const rooms = new Map()

/** Envía un mensaje JSON a todos los conectados a un partido. */
export function broadcast(matchId, message) {
  const room = rooms.get(matchId)
  if (!room) return
  const payload = JSON.stringify({ ...message, matchId, server_time: Date.now() })
  for (const ws of room) {
    if (ws.readyState === ws.OPEN) ws.send(payload)
  }
}

function presence(matchId) {
  const room = rooms.get(matchId)
  const names = room ? [...new Set([...room].map((ws) => ws.userName))] : []
  broadcast(matchId, { type: 'presence', users: names })
}

function leave(ws) {
  for (const matchId of ws.matchIds) {
    const room = rooms.get(matchId)
    if (!room) continue
    room.delete(ws)
    if (room.size === 0) rooms.delete(matchId)
    else presence(matchId)
  }
  ws.matchIds.clear()
}

export function attachRealtime(server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', async (req, socket, head) => {
    try {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname !== '/ws') return socket.destroy()
      const user = verifyToken(url.searchParams.get('token') ?? '')
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        return socket.destroy()
      }
      const { rows } = await query('SELECT name FROM users WHERE id = $1', [user.id])
      if (!rows[0]) return socket.destroy()
      wss.handleUpgrade(req, socket, head, (ws) => {
        ws.userId = user.id
        ws.userName = rows[0].name
        wss.emit('connection', ws)
      })
    } catch {
      socket.destroy()
    }
  })

  wss.on('connection', (ws) => {
    ws.matchIds = new Set()
    ws.isAlive = true
    ws.on('pong', () => {
      ws.isAlive = true
    })

    ws.on('message', async (raw) => {
      let msg
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      const matchId = Number(msg.matchId)
      if (msg.type === 'subscribe' && Number.isInteger(matchId)) {
        const role = await getMatchRole(matchId, ws.userId)
        if (!role) return ws.send(JSON.stringify({ type: 'error', matchId, error: 'Sin acceso al partido.' }))
        if (!rooms.has(matchId)) rooms.set(matchId, new Set())
        rooms.get(matchId).add(ws)
        ws.matchIds.add(matchId)
        presence(matchId)
      } else if (msg.type === 'unsubscribe' && Number.isInteger(matchId)) {
        rooms.get(matchId)?.delete(ws)
        ws.matchIds.delete(matchId)
        presence(matchId)
      }
    })

    ws.on('close', () => leave(ws))
    ws.on('error', () => leave(ws))
  })

  // Cierra conexiones muertas (proxies de Railway cortan las inactivas).
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate()
        continue
      }
      ws.isAlive = false
      ws.ping()
    }
  }, 30_000)
  heartbeat.unref()
  wss.on('close', () => clearInterval(heartbeat))

  return wss
}
