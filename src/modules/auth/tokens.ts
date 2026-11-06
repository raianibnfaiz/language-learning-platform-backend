import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import jwt, { type Algorithm, type SignOptions } from 'jsonwebtoken'
import { env } from '../../config/env.js'

export interface AccessClaims {
  sub: string
  role: 'learner' | 'admin'
  tv: number
  sid: string
  iat?: number
}

const signingKey = env.JWT_PRIVATE_KEY ?? env.JWT_ACCESS_SECRET ?? ''
const verifyKey = env.JWT_PUBLIC_KEY ?? env.JWT_ACCESS_SECRET ?? ''
const algorithm: Algorithm = env.JWT_PRIVATE_KEY ? (env.JWT_ALGORITHM as Algorithm) : 'HS256'

export function signAccessToken(claims: Omit<AccessClaims, 'iat'>): string {
  const { sub, ...rest } = claims
  return jwt.sign(rest, signingKey, {
    algorithm,
    subject: sub,
    expiresIn: env.JWT_ACCESS_TTL as NonNullable<SignOptions['expiresIn']>,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  })
}

/** Throws jsonwebtoken errors (TokenExpiredError / JsonWebTokenError); the error handler maps them. */
export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, verifyKey, {
    algorithms: [algorithm],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  })
  if (typeof payload === 'string' || !payload.sub) throw new jwt.JsonWebTokenError('invalid payload')
  const p = payload as jwt.JwtPayload & { role?: unknown; tv?: unknown; sid?: unknown }
  if ((p.role !== 'learner' && p.role !== 'admin') || typeof p.tv !== 'number' || typeof p.sid !== 'string')
    throw new jwt.JsonWebTokenError('invalid claims')
  return { sub: p.sub as string, role: p.role, tv: p.tv, sid: p.sid, ...(p.iat ? { iat: p.iat } : {}) }
}

/** Opaque 256-bit token (base64url). Only its SHA-256 hash is ever stored. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
