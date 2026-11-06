import { Router } from 'express'
import { pingDb } from '../../config/db.js'
import { AppError } from '../../core/errors.js'
import { ok } from '../../core/http.js'
import { defineRoute } from '../../core/route.js'
import { content } from '../content/content.store.js'

export function healthRouter(): Router {
  const r = Router()
  defineRoute(
    r,
    { method: 'get', path: '/health', summary: 'Liveness (no DB)', tags: ['Health'], auth: 'none' },
    (_req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      ok(res, { status: 'ok', uptime: Math.round(process.uptime()) })
    },
  )
  defineRoute(
    r,
    { method: 'get', path: '/ready', summary: 'Readiness (pings MongoDB)', tags: ['Health'], auth: 'none' },
    async (_req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      if (!(await pingDb())) throw new AppError('INTERNAL', 'Database not reachable', { status: 503 })
      ok(res, { status: 'ready', contentVersion: content().version })
    },
  )
  return r
}
