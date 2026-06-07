import { getToken } from './auth'

// VITE_WORKER_URL 未注入时（如 Pages 构建未配置环境变量）兜底到生产 worker 域名，
// 避免请求打到前端自身域名导致 405。本地开发由 .env.local 覆盖。
const BASE = import.meta.env.VITE_WORKER_URL ?? 'https://api.9shi.cc/crawler'

export async function fetchWorker(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> ?? {}) }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  return fetch(`${BASE}${path}`, { ...init, headers })
}
