import express, { Router, type Express } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { env, isProd } from './config/env.js'
import { logger } from './config/logger.js'
import { generateOpenApi } from './core/openapi.js'
import { clientInfo } from './core/middleware/clientInfo.js'
import { errorHandler, notFoundHandler } from './core/middleware/errorHandler.js'
import { rateLimits } from './core/middleware/rateLimit.js'
import { requestId } from './core/middleware/requestId.js'
import { adminRouter } from './modules/admin/admin.routes.js'
import { authRouter } from './modules/auth/auth.routes.js'
import { contentRouter } from './modules/content/content.routes.js'
import { healthRouter } from './modules/health/health.routes.js'
import { helpRouter } from './modules/help/help.routes.js'
import { phrasebookRouter } from './modules/phrasebook/phrasebook.routes.js'
import { progressRouter } from './modules/progress/progress.routes.js'
import { syncRouter } from './modules/sync/sync.routes.js'
import { translationRouter } from './modules/translation/translation.routes.js'
import { usersRouter } from './modules/users/users.routes.js'

const BIG_BODY_PATHS = ['/sync', '/sync/import']

/** Mounts every module router (also used to generate openapi.json without starting a server). */
export function buildApiRouter(): Router {
  const api = Router()
  for (const make of [
    healthRouter,
    contentRouter,
    authRouter,
    usersRouter,
    progressRouter,
    phrasebookRouter,
    syncRouter,
    translationRouter,
    helpRouter,
    adminRouter,
  ])
    api.use(make())
  return api
}

let openapiDoc: ReturnType<typeof generateOpenApi> | undefined

export function openapiDocument() {
  if (!openapiDoc) {
    buildApiRouter() // registers every route in the OpenAPI registry
    openapiDoc = generateOpenApi(env.API_BASE_PATH)
  }
  return openapiDoc
}

/** Builds the Express app without listening (used by server.ts and the tests). */
export function createApp(): Express {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY)
  app.set('etag', false) // content ETags are computed from the content version, never from bodies

  app.use(requestId)
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      customProps: (req) => {
        const r = req as express.Request
        return { userId: r.user?.id, client: r.client?.kind, appVersion: r.client?.appVersion }
      },
      serializers: { req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }) },
    }),
  )
  const docsEnabled = env.DOCS_ENABLED ?? !isProd
  app.use(
    helmet({
      // API only; the docs page needs swagger-ui's inline assets
      contentSecurityPolicy: docsEnabled
        ? false
        : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  )
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.CORS_ORIGINS.includes(origin)),
      credentials: true,
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'X-Client',
        'X-App-Version',
        'X-Device-Id',
        'X-Timezone',
        'X-Requested-With',
        'Idempotency-Key',
        'If-None-Match',
        'X-Request-Id',
      ],
      exposedHeaders: ['X-Request-Id', 'ETag', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  )
  app.use(cookieParser())
  const base = env.API_BASE_PATH
  // 100 kB default; /sync and /sync/import parse their own 1 MB bodies.
  const smallJson = express.json({ limit: '100kb' })
  app.use((req, res, next) =>
    BIG_BODY_PATHS.some((p) => req.path === base + p) ? next() : smallJson(req, res, next),
  )

  const apiRouter = buildApiRouter()
  if (docsEnabled) {
    app.get(`${base}/docs/openapi.json`, (_req, res) => {
      res.json(openapiDocument())
    })
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiDocument()))
  }

  app.use(base, clientInfo, rateLimits.general(), apiRouter)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
