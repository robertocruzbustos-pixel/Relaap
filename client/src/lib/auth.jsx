import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, clearToken, getToken, setToken } from './api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(getToken()))
  const [connectionError, setConnectionError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!getToken()) return
    setConnectionError(null)
    api
      .get('/auth/me')
      .then((data) => setUser(data.user))
      .catch((err) => {
        // Solo un 401 invalida la sesión (api.js ya borra el token). Un corte de red o un 5xx
        // no debe desloguear: se ofrece reintentar.
        if (err.status !== 401) setConnectionError(err.message)
      })
      .finally(() => setLoading(false))
  }, [attempt])

  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('relatorpro:unauthorized', onUnauthorized)
    return () => window.removeEventListener('relatorpro:unauthorized', onUnauthorized)
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password })
    setToken(data.token)
    setUser(data.user)
  }, [])

  const register = useCallback(async (fields) => {
    const data = await api.post('/auth/register', fields)
    setToken(data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
  }, [])

  const retry = useCallback(() => {
    setLoading(true)
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo(
    () => ({ user, setUser, loading, connectionError, retry, login, register, logout }),
    [user, loading, connectionError, retry, login, register, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
