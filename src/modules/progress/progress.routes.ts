import { Router } from 'express'
import { z } from 'zod'
import { ok } from '../../core/http.js'
import { userId } from '../../core/middleware/auth.js'
import { noStore } from '../../core/middleware/cache.js'
import { defineRoute } from '../../core/route.js'
import { langId, localDay } from '../../core/schemas.js'
import { addDays, todayIn } from '../../core/time.js'
import * as state from './state.service.js'
import { tzOf } from './me.helpers.js'

const tags = ['Learner state']

export function progressRouter(): Router {
  const r = Router()
  r.use('/me', noStore)

  defineRoute(
    r,
    {
      method: 'get',
      path: '/me/state',
      summary: 'Full learner snapshot in the exact client shapes (ProgressState + PhrasebookState)',
      tags,
    },
    async (req, res) => ok(res, await state.snapshot(userId(req), await tzOf(req))),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/me/state/changes',
      summary: 'Delta since a stateVersion (or { full: true, … } when too old)',
      tags,
      query: z.object({ since: z.coerce.number().int().min(0) }).strict(),
    },
    async (req, res, { query }) => ok(res, await state.changes(userId(req), query.since, await tzOf(req))),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/me/summary',
      summary: 'Dashboard numbers (also what Pip personalises with)',
      tags,
    },
    async (req, res) => ok(res, await state.summary(userId(req), await tzOf(req))),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/me/activity',
      summary: 'Daily XP for charts (zero-filled, max 400 days)',
      tags,
      query: z.object({ from: localDay.optional(), to: localDay.optional() }).strict(),
    },
    async (req, res, { query }) => {
      const today = todayIn(await tzOf(req))
      const to = query.to ?? today
      ok(res, await state.activityRange(userId(req), query.from ?? addDays(to, -13), to))
    },
  )

  defineRoute(
    r,
    { method: 'get', path: '/me/progress/languages', summary: 'Per-language progress rows', tags },
    async (req, res) => ok(res, await state.progressLanguages(userId(req), await tzOf(req))),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/me/progress/languages/:langId',
      summary: 'Per-situation progress of one language',
      tags,
      params: z.object({ langId }),
    },
    async (req, res, { params }) => ok(res, await state.progressLanguage(userId(req), params.langId)),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/me/review/due',
      summary: 'Review cards due today or earlier, with phrase content',
      tags,
    },
    async (req, res) => ok(res, await state.reviewDue(userId(req), await tzOf(req))),
  )
  return r
}
