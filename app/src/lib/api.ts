import { getToken } from './auth'

const BASE = import.meta.env.VITE_WORKER_URL ?? ''

export async function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> ?? {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(`${BASE}${path}`, { ...init, headers })
}
