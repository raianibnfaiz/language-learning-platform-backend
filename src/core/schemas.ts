import './openapi.js' // extends zod with .openapi() before any schema is built
import { z } from 'zod'
import { graphemeLength } from './text.js'
import { isValidDay, isValidTimezone } from './time.js'

/** Shared Zod primitives (§7). Existence checks against content happen in services so they map to
 *  domain error codes (UNKNOWN_PHRASE, UNKNOWN_LESSON …) that clients switch on. */
export const slugId = z.string().regex(/^[a-z][a-z-]{0,63}$/, 'invalid id')
export const langId = slugId.openapi({ example: 'spanish' })
export const situationId = slugId.openapi({ example: 'first-words' })
export const phraseKey = z
  .string()
  .regex(/^[a-z-]+:[a-z-]+$/, 'invalid phrase key')
  .openapi({ example: 'spanish:hello' })
export const lessonId = z
  .string()
  .regex(/^[a-z]{2}-[1-6]$/, 'invalid lesson id')
  .openapi({ example: 'en-1' })
export const localDay = z
  .string()
  .refine(isValidDay, 'must be a real YYYY-MM-DD date')
  .openapi({ example: '2026-11-06' })
export const testN = z.number().int().min(1).max(4)
export const stars = z.number().int().min(0).max(3)
export const note = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => graphemeLength(s) <= 1000, 'note must be at most 1000 characters')
export const word = z
  .string()
  .transform((s) => s.normalize('NFC').trim())
  .refine((s) => {
    const n = graphemeLength(s)
    return n >= 1 && n <= 64 && /^[\p{L}\p{M}\p{N}'-]+$/u.test(s)
  }, 'word must be 1–64 letters, marks, digits, apostrophes or hyphens')
export const timezone = z
  .string()
  .refine(isValidTimezone, 'unknown IANA timezone')
  .openapi({ example: 'Asia/Dhaka' })
export const uuid = z.string().uuid()
export const opId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'invalid op id')
export const deviceId = z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'invalid device id')
export const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'invalid id')
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254)
  .openapi({ example: 'learner@example.com' })
export const displayName = z
  .string()
  .trim()
  .refine((s) => {
    const n = graphemeLength(s)
    return n >= 1 && n <= 40
  }, 'display name must be 1–40 characters')
export const bcp47 = z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'invalid BCP-47 tag')
export const password = z
  .string()
  .min(8, 'password must be at least 8 characters')
  .max(128, 'password must be at most 128 characters')

export const IdempotencyHeaders = z.object({ 'idempotency-key': opId.optional() })
