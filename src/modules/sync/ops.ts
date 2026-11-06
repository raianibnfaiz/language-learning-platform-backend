import { z } from 'zod'
import {
  deviceId,
  langId,
  lessonId,
  localDay,
  note,
  opId,
  phraseKey,
  situationId,
  testN,
  timezone,
  word,
} from '../../core/schemas.js'
import { PRACTICE_MAX_TOTAL } from '../../core/rules/constants.js'

const base = {
  opId,
  occurredAt: z.string().datetime({ offset: true }).openapi({ example: '2026-11-06T08:10:00.000Z' }),
  localDay,
}

export const TestPayload = z
  .object({
    langId,
    situationId,
    test: testN,
    correct: z.number().int().min(0),
    total: z.number().int().min(1).max(50),
    answers: z
      .array(z.object({ key: phraseKey, correct: z.boolean() }).strict())
      .max(50)
      .optional(),
    missed: z.array(phraseKey).max(50).default([]),
    comboBonuses: z.number().int().min(0).default(0),
  })
  .strict()

export const PrefsPayload = z
  .object({ theme: z.enum(['system', 'light', 'dark']).optional(), haptics: z.boolean().optional() })
  .strict()

export const OpSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('phrase.heard'), payload: z.object({ key: phraseKey }).strict() }),
  z.object({
    ...base,
    type: z.literal('phrase.speak'),
    payload: z.object({ key: phraseKey, score: z.number().min(0).max(1) }).strict(),
  }),
  z.object({ ...base, type: z.literal('phrase.note'), payload: z.object({ key: phraseKey, note }).strict() }),
  z.object({
    ...base,
    type: z.literal('phrase.favorite'),
    payload: z.object({ key: phraseKey, value: z.boolean() }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('word.favorite'),
    payload: z.object({ langId, word, value: z.boolean() }).strict(),
  }),
  z.object({ ...base, type: z.literal('test.recorded'), payload: TestPayload }),
  z.object({
    ...base,
    type: z.literal('review.add'),
    payload: z.object({ keys: z.array(phraseKey).min(1).max(100) }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('review.answer'),
    payload: z.object({ key: phraseKey, knewIt: z.boolean() }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('lesson.complete'),
    payload: z.object({ lessonId, value: z.boolean() }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('lesson.bookmark'),
    payload: z.object({ lessonId, value: z.boolean() }).strict(),
  }),
  z.object({
    ...base,
    type: z.literal('practice.answered'),
    payload: z
      .object({ correct: z.number().int().min(0), total: z.number().int().min(1).max(PRACTICE_MAX_TOTAL) })
      .strict(),
  }),
  z.object({ ...base, type: z.literal('language.visit'), payload: z.object({ langId }).strict() }),
  z.object({ ...base, type: z.literal('prefs.update'), payload: PrefsPayload }),
])

export type SyncOp = z.output<typeof OpSchema>
export type OpType = SyncOp['type']
export type OpOf<T extends OpType> = Extract<SyncOp, { type: T }>

export const OP_TYPES = OpSchema.options.map((o) => o.shape.type.value)

export const SyncRequestSchema = z
  .object({
    deviceId,
    timezone: timezone.optional(),
    sinceVersion: z.number().int().min(0).optional(),
    // Each op is validated individually so one bad op never blocks the rest of the batch.
    ops: z
      .array(z.unknown())
      .max(500)
      .openapi({ type: 'array', items: { type: 'object' } }),
  })
  .strict()
  .openapi('SyncRequest')

export interface OpResult {
  opId: string | null
  status: 'applied' | 'duplicate' | 'rejected'
  reason?: string
  message?: string
  xpDelta: number
  result?: unknown
}
