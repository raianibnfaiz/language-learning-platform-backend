import argon2 from 'argon2'
import { AppError } from '../../core/errors.js'

// OWASP-recommended argon2id parameters (§5.2): 19 MiB, t=2, p=1.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const

const COMMON = new Set([
  '12345678',
  '123456789',
  '1234567890',
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty123',
  'qwertyuiop',
  '11111111',
  '00000000',
  'iloveyou',
  'abc12345',
  'abcd1234',
  '1q2w3e4r',
  '1qaz2wsx',
  'letmein1',
  'welcome1',
  'welcome123',
  'admin123',
  'administrator',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'trustno1',
  'starwars',
  'whatever',
  'dragon123',
  'monkey123',
  'p@ssw0rd',
  'lingbloomtalk',
  'linguawealth',
  'changeme',
  'changeme123',
  'qwerty12',
  'asdfghjk',
  'zxcvbnm1',
  '987654321',
])

export function assertPasswordAllowed(password: string): void {
  if (COMMON.has(password.toLowerCase()))
    throw new AppError('VALIDATION_ERROR', 'This password is too common, choose another one', {
      details: [{ path: 'password', message: 'too common' }],
    })
}

export const hashPassword = (password: string) => argon2.hash(password, OPTIONS)

let dummyHash: Promise<string> | undefined
/** Verifies; for unknown users still spends the same time so responses don't reveal accounts. */
export async function verifyPassword(hash: string | undefined, password: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= argon2.hash('dummy-password-for-timing', OPTIONS)
    await argon2.verify(await dummyHash, password).catch(() => false)
    return false
  }
  return argon2.verify(hash, password).catch(() => false)
}
