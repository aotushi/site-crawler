import type { Env } from '../index'
import { signToken } from './jwt'
import { getUserByEmail, createUser } from '../db/queries'

function corsHeaders(env: Env) {
  return {
    'Access-Control-Allow-Origin': env.FRONTEND_ORIGIN,
    'Content-Type': 'application/json',
  }
}

function json(data: unknown, status: number, env: Env) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(env) })
}

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json() as { email: string; password: string }
  if (!email || !password || password.length < 8) {
    return json({ error: 'Invalid email or password (min 8 chars)' }, 400, env)
  }
  const existing = await getUserByEmail(env.DB, email)
  if (existing) return json({ error: 'Email already registered' }, 409, env)

  const id = crypto.randomUUID()
  const password_hash = await hashPassword(password)
  await createUser(env.DB, { id, email, password_hash, created_at: Date.now() })

  const token = await signToken({ sub: id, email }, env.JWT_SECRET)
  return json({ token }, 201, env)
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json() as { email: string; password: string }
  const user = await getUserByEmail(env.DB, email)
  if (!user) return json({ error: 'Invalid credentials' }, 401, env)

  const hash = await hashPassword(password)
  if (hash !== user.password_hash) return json({ error: 'Invalid credentials' }, 401, env)

  const token = await signToken({ sub: user.id, email: user.email }, env.JWT_SECRET)
  return json({ token }, 200, env)
}
