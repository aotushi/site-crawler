import { SignJWT, jwtVerify } from 'jose'

export interface JWTPayload {
  sub: string  // user id
  email: string
}

function getKey(secret: string) {
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: JWTPayload, secret: string): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getKey(secret))
}

export async function verifyToken(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getKey(secret))
    return { sub: payload.sub as string, email: payload.email as string }
  } catch {
    return null
  }
}

export function extractBearer(request: Request): string | null {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}
