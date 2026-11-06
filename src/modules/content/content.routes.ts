import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { defineRoute } from '../../core/route.js'
import { handleConditional } from '../../core/middleware/cache.js'
import { langId, situationId, slugId } from '../../core/schemas.js'
import { ok } from '../../core/http.js'
import { REGIONS } from './content.model.js'
import * as svc from './content.service.js'

const tags = ['Content']

/** Content is versioned: one ETag per content version, 304 when the client already has it. */
function send(req: Request, res: Response, data: unknown): void {
  if (handleConditional(req, res, svc.etag())) return
  ok(res, data, { contentVersion: svc.contentVersion().version })
}

export function contentRouter(): Router {
  const r = Router()

  defineRoute(
    r,
    { method: 'get', path: '/content/version', summary: 'Current content version', tags, auth: 'none' },
    (req, res) => send(req, res, svc.contentVersion()),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/content/bundle',
      summary: 'Everything in one payload for offline caching',
      tags,
      auth: 'none',
      query: z.object({ since: z.coerce.number().int().min(0).optional() }).strict(),
    },
    (req, res, { query }) => {
      const v = svc.contentVersion()
      if (query.since !== undefined && query.since === v.version) {
        if (handleConditional(req, res, svc.etag())) return
        return ok(res, { ...v, unchanged: true }, { contentVersion: v.version })
      }
      send(req, res, svc.bundle())
    },
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/languages',
      summary: 'Language catalog, featured first then by name',
      tags,
      auth: 'none',
      query: z
        .object({
          region: z.enum(REGIONS).optional(),
          featured: z
            .enum(['true', 'false'])
            .transform((v) => v === 'true')
            .optional(),
          q: z.string().trim().max(64).optional(),
        })
        .strict(),
    },
    (req, res, { query }) =>
      send(
        req,
        res,
        svc.listLanguages({
          ...(query.region ? { region: query.region } : {}),
          ...(query.featured !== undefined ? { featured: query.featured } : {}),
          ...(query.q ? { q: query.q } : {}),
        }),
      ),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/languages/:langId',
      summary: 'Language with its situations',
      tags,
      auth: 'none',
      params: z.object({ langId }),
    },
    (req, res, { params }) => send(req, res, svc.getLanguage(params.langId)),
  )

  defineRoute(
    r,
    {
      method: 'get',
      path: '/languages/:langId/situations/:situationId/phrases',
      summary: 'Phrases of one situation in one language (LearnPhrase[] + wordPieces)',
      tags,
      auth: 'none',
      params: z.object({ langId, situationId }),
    },
    (req, res, { params }) => send(req, res, svc.getPhrases(params.langId, params.situationId)),
  )

  defineRoute(
    r,
    { method: 'get', path: '/situations', summary: 'The 7 situations', tags, auth: 'none' },
    (req, res) => send(req, res, svc.listSituations()),
  )
  defineRoute(
    r,
    { method: 'get', path: '/tests', summary: 'The 4 tests per situation', tags, auth: 'none' },
    (req, res) => send(req, res, svc.listTests()),
  )
  defineRoute(
    r,
    {
      method: 'get',
      path: '/career-languages',
      summary: 'The 5 ranked career languages',
      tags,
      auth: 'none',
    },
    (req, res) => send(req, res, svc.listCareerLanguages()),
  )
  defineRoute(
    r,
    {
      method: 'get',
      path: '/career-languages/:id',
      summary: 'Career language detail incl. lessons and phrases',
      tags,
      auth: 'none',
      params: z.object({ id: slugId }),
    },
    (req, res, { params }) => send(req, res, svc.getCareerLanguage(params.id)),
  )
  defineRoute(
    r,
    { method: 'get', path: '/content/stats', summary: 'Content totals', tags, auth: 'none' },
    (req, res) => send(req, res, svc.stats()),
  )
  defineRoute(
    r,
    {
      method: 'get',
      path: '/search',
      summary: 'Search phrases and lessons (accent-insensitive)',
      tags,
      auth: 'none',
      query: z
        .object({
          q: z.string().trim().min(1).max(100),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .strict(),
    },
    (req, res, { query }) => send(req, res, svc.search(query.q, query.limit)),
  )
  return r
}
