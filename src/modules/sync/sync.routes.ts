import express, { Router } from 'express'
import { z } from 'zod'
import { ok } from '../../core/http.js'
import { userId } from '../../core/middleware/auth.js'
import { noStore } from '../../core/middleware/cache.js'
import { rateLimits } from '../../core/middleware/rateLimit.js'
import { defineRoute } from '../../core/route.js'
import { deviceId, timezone } from '../../core/schemas.js'
import { changes, derived, userTimezone } from '../progress/state.service.js'
import { UserModel } from '../users/user.model.js'
import { SyncRequestSchema } from './ops.js'
import { applyBatch, importState } from './sync.service.js'

const tags = ['Sync']
const bigJson = express.json({ limit: '1mb' })

const SyncResponse = z
  .object({
    data: z.object({
      results: z.array(
        z.object({
          opId: z.string().nullable(),
          status: z.enum(['applied', 'duplicate', 'rejected']),
          reason: z.string().optional(),
          xpDelta: z.number(),
          result: z.unknown().optional(),
        }),
      ),
      stateVersion: z.number(),
      changes: z.unknown(),
      derived: z.object({
        xp: z.number(),
        level: z.number(),
        streak: z.number(),
        todayXp: z.number(),
        dueCount: z.number(),
      }),
    }),
  })
  .openapi('SyncResponse')

export function syncRouter(): Router {
  const r = Router()
  r.use('/sync', noStore)

  defineRoute(
    r,
    {
      method: 'post',
      path: '/sync',
      summary: 'Push an outbox of offline ops, get the delta back',
      description:
        'Op types: phrase.heard, phrase.speak, phrase.note, phrase.favorite, word.favorite, test.recorded, review.add, review.answer, lesson.complete, lesson.bookmark, practice.answered, language.visit, prefs.update. Max 500 ops, 1 MB.',
      tags,
      middleware: [rateLimits.sync(), bigJson],
      body: SyncRequestSchema,
      responses: { 200: { description: 'OK', schema: SyncResponse } },
    },
    async (req, res, { body }) => {
      const uid = userId(req)
      const tz = body.timezone ?? (await userTimezone(uid, req.client.timezone))
      if (body.timezone) await UserModel.updateOne({ _id: uid }, { $set: { timezone: body.timezone } })
      const { results, stateVersion } = await applyBatch(uid, {
        deviceId: body.deviceId,
        timezone: tz,
        ops: body.ops,
      })
      const [delta, d] = await Promise.all([
        body.sinceVersion !== undefined ? changes(uid, body.sinceVersion, tz) : Promise.resolve(null),
        derived(uid, tz),
      ])
      ok(res, { results, stateVersion, changes: delta, derived: d })
    },
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/sync/import',
      summary: "One-time upload of a guest's local state on first sign-in",
      description:
        'Lenient by design: unknown fields/keys are dropped and reported in `meta.dropped` instead of failing. Untouched demo seed data is ignored.',
      tags,
      middleware: [rateLimits.sync(), bigJson],
      body: z
        .object({
          deviceId,
          timezone: timezone.optional(),
          strategy: z.enum(['merge', 'replace-server']).optional(),
          isDemoSeed: z.boolean().optional(),
          progress: z.unknown().optional(),
          phrasebook: z.unknown().optional(),
          preferences: z
            .object({
              theme: z.enum(['system', 'light', 'dark']).optional(),
              haptics: z.boolean().optional(),
            })
            .passthrough()
            .optional(),
          voices: z.record(z.string(), z.string().max(300)).optional(),
        })
        .passthrough(),
    },
    async (req, res, { body }) => {
      const uid = userId(req)
      const result = await importState(uid, {
        deviceId: body.deviceId,
        timezone: body.timezone,
        strategy: body.strategy,
        isDemoSeed: body.isDemoSeed,
        progress: body.progress,
        phrasebook: body.phrasebook,
        preferences: body.preferences
          ? { theme: body.preferences.theme, haptics: body.preferences.haptics }
          : undefined,
        voices: body.voices,
        client: req.client.kind,
      })
      const { dropped, ...data } = result as Record<string, unknown>
      ok(res, data, { dropped: dropped ?? {} })
    },
  )
  return r
}
