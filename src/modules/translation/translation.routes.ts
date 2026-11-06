import { Router } from 'express'
import { z } from 'zod'
import { ok } from '../../core/http.js'
import { userId } from '../../core/middleware/auth.js'
import { defineRoute } from '../../core/route.js'
import { bcp47 } from '../../core/schemas.js'
import { tzOf } from '../progress/me.helpers.js'
import * as svc from './translation.service.js'

const tags = ['Translation (phase 2)']

export function translationRouter(): Router {
  const r = Router()
  defineRoute(
    r,
    {
      method: 'get',
      path: '/translation/languages',
      summary: 'Supported target languages (501 until enabled)',
      tags,
    },
    async (_req, res) => ok(res, await svc.supportedLanguages()),
  )
  defineRoute(
    r,
    {
      method: 'post',
      path: '/translation',
      summary: 'Translate items, cache-first (501 until enabled)',
      tags,
      body: z
        .object({
          items: z
            .array(z.object({ id: z.string().max(100), text: z.string().min(1).max(5000) }).strict())
            .min(1)
            .max(100),
          sourceLang: bcp47,
          targetLang: bcp47,
          mode: z.enum(['sentence', 'paragraph']).default('sentence'),
          preserveTerms: z.array(z.string().max(100)).max(50).optional(),
        })
        .strict(),
    },
    async (req, res, { body }) => ok(res, await svc.translate(userId(req), await tzOf(req), body)),
  )
  return r
}
