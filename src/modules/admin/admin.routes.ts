import { Router } from 'express'
import { z } from 'zod'
import { ok } from '../../core/http.js'
import { noStore } from '../../core/middleware/cache.js'
import { defineRoute } from '../../core/route.js'
import { objectId } from '../../core/schemas.js'
import * as admin from './admin.service.js'

const tags = ['Admin']

export function adminRouter(): Router {
  const r = Router()
  r.use('/admin', noStore)
  defineRoute(
    r,
    {
      method: 'post',
      path: '/admin/content/reseed',
      summary: 'Reseed content from source-data (dry run by default, returns the diff)',
      tags,
      auth: 'admin',
      body: z.object({ dryRun: z.boolean().default(true) }).strict(),
    },
    async (_req, res, { body }) => ok(res, await admin.reseed(body.dryRun)),
  )
  defineRoute(
    r,
    {
      method: 'get',
      path: '/admin/users',
      summary: 'Search users (no learner content)',
      tags,
      auth: 'admin',
      query: z
        .object({
          q: z.string().trim().max(100).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
          cursor: z.string().max(200).optional(),
        })
        .strict(),
    },
    async (_req, res, { query }) => {
      const page = await admin.listUsers(query.q, query.limit, query.cursor)
      ok(res, page.items, { nextCursor: page.nextCursor })
    },
  )
  defineRoute(
    r,
    {
      method: 'patch',
      path: '/admin/users/:id',
      summary: 'Disable / enable a user or change their role',
      tags,
      auth: 'admin',
      params: z.object({ id: objectId }),
      body: z
        .object({
          status: z.enum(['active', 'disabled']).optional(),
          role: z.enum(['learner', 'admin']).optional(),
        })
        .strict(),
    },
    async (req, res, { params, body }) =>
      ok(
        res,
        await admin.updateUser(req.user!.id, params.id, body, {
          client: req.client.kind,
          userAgent: req.get('user-agent'),
          ip: req.ip,
        }),
      ),
  )
  defineRoute(
    r,
    {
      method: 'get',
      path: '/admin/stats',
      summary: 'DAU, ops per day, sync errors',
      tags,
      auth: 'admin',
      query: z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }).strict(),
    },
    async (_req, res, { query }) => ok(res, await admin.stats(query.days)),
  )
  return r
}
