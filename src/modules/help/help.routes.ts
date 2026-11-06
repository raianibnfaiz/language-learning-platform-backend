import { Router } from 'express'
import { z } from 'zod'
import { ok } from '../../core/http.js'
import { userId } from '../../core/middleware/auth.js'
import { defineRoute } from '../../core/route.js'
import { summary } from '../progress/state.service.js'
import { tzOf } from '../progress/me.helpers.js'
import { getHelpBot } from './help.service.js'

export function helpRouter(): Router {
  const r = Router()
  defineRoute(
    r,
    {
      method: 'post',
      path: '/help/ask',
      summary: 'Ask Pip (phase 2, 501 until enabled)',
      tags: ['Help (phase 2)'],
      body: z.object({ question: z.string().trim().min(1).max(500) }).strict(),
    },
    async (req, res, { body }) => {
      const bot = getHelpBot()
      const s = await summary(userId(req), await tzOf(req))
      ok(
        res,
        await bot.ask(body.question, {
          due: s.dueCount,
          heard: s.heardCount,
          xp: s.xp,
          level: s.level,
          streak: s.streak,
          recentLanguage: s.recentLanguage,
        }),
      )
    },
  )
  return r
}
