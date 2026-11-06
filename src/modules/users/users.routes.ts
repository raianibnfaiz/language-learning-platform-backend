import { Router } from 'express'
import { z } from 'zod'
import { AppError } from '../../core/errors.js'
import { ok } from '../../core/http.js'
import { userId } from '../../core/middleware/auth.js'
import { noStore } from '../../core/middleware/cache.js'
import { defineRoute } from '../../core/route.js'
import { bcp47, displayName, timezone } from '../../core/schemas.js'
import { sendMutation } from '../progress/me.helpers.js'
import { resetState } from '../sync/sync.service.js'
import * as users from './users.service.js'

const tags = ['Account']
const VoicesSchema = z
  .record(z.string().regex(/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/), z.string().min(1).max(300))
  .refine((v) => Object.keys(v).length <= 200, 'too many voices')

export function usersRouter(): Router {
  const r = Router()
  r.use('/me', noStore)

  defineRoute(r, { method: 'get', path: '/me', summary: 'Profile + preferences', tags }, async (req, res) =>
    ok(res, await users.getMe(userId(req))),
  )

  defineRoute(
    r,
    {
      method: 'patch',
      path: '/me',
      summary: 'Update profile / preferences',
      tags,
      body: z
        .object({
          displayName: displayName.optional(),
          timezone: timezone.optional(),
          nativeLanguage: bcp47.nullable().optional(),
          preferences: z
            .object({
              theme: z.enum(['system', 'light', 'dark']).optional(),
              haptics: z.boolean().optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    },
    async (req, res, { body }) => ok(res, await users.updateMe(userId(req), body)),
  )

  defineRoute(
    r,
    {
      method: 'delete',
      path: '/me',
      summary: 'Delete the account (soft delete now, purge after 7 days)',
      tags,
      body: z.object({ password: z.string().max(128).optional() }).strict(),
    },
    async (req, res, { body }) =>
      ok(
        res,
        await users.deleteMe(userId(req), req.user!.sessionId, body.password, {
          client: req.client.kind,
          userAgent: req.get('user-agent'),
          ip: req.ip,
        }),
      ),
  )

  defineRoute(
    r,
    { method: 'get', path: '/me/export', summary: 'Full JSON export of every learner collection', tags },
    async (req, res) => {
      res.setHeader('Content-Disposition', 'attachment; filename="lingbloomtalk-export.json"')
      ok(res, await users.exportData(userId(req)))
    },
  )

  const requireDevice = (deviceId: string | undefined) => {
    if (!deviceId) throw new AppError('VALIDATION_ERROR', 'X-Device-Id header is required')
    return deviceId
  }

  defineRoute(
    r,
    { method: 'get', path: '/me/devices/current', summary: 'This device (incl. voices map)', tags },
    async (req, res) => ok(res, await users.getDevice(userId(req), requireDevice(req.client.deviceId))),
  )

  defineRoute(
    r,
    {
      method: 'put',
      path: '/me/devices/current',
      summary: 'Save this device (voices are per device)',
      tags,
      body: z.object({ appVersion: z.string().max(32).optional(), voices: VoicesSchema.optional() }).strict(),
    },
    async (req, res, { body }) =>
      ok(res, await users.putDevice(userId(req), requireDevice(req.client.deviceId), req.client.kind, body)),
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/me/reset',
      summary: 'Wipe learner data (never seeds demo data)',
      tags,
      body: z.object({ confirm: z.literal('RESET') }).strict(),
    },
    async (req, res) => sendMutation(req, res, await resetState(userId(req))),
  )
  return r
}
