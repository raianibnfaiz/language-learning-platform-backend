import type { NextFunction, Request, RequestHandler, Response, Router } from 'express'
import type { RouteConfig } from '@asteasolutions/zod-to-openapi'
import type { z } from 'zod'
import { type ZodTypeAny } from 'zod'
import { ErrorResponseSchema, registry } from './openapi.js'
import { requireAuth, requireRole } from './middleware/auth.js'

/** Routers may be built more than once (tests build several apps); document each route once. */
const registered = new Set<string>()

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'
type Infer<T> = T extends ZodTypeAny ? z.output<T> : undefined

export interface RouteDef<B, Q, P> {
  method: Method
  /** Express-style path relative to the router, e.g. '/phrases/:key/heard' */
  path: string
  summary: string
  tags: string[]
  description?: string
  auth?: 'none' | 'user' | 'admin'
  body?: B
  query?: Q
  params?: P
  /** Extra middleware (rate limits, cache headers) run after auth, before validation. */
  middleware?: RequestHandler[]
  responses?: Record<number, { description: string; schema?: ZodTypeAny }>
  /** Extra request headers to document (e.g. Idempotency-Key). */
  headers?: ZodTypeAny
}

export interface Input<B, Q, P> {
  body: Infer<B>
  query: Infer<Q>
  params: Infer<P>
}

/**
 * Declares an endpoint once: registers it in the OpenAPI document, wires auth + Zod validation,
 * and hands the handler the parsed (typed) input. Express 5 forwards async errors automatically.
 */
export function defineRoute<
  B extends ZodTypeAny | undefined = undefined,
  Q extends ZodTypeAny | undefined = undefined,
  P extends ZodTypeAny | undefined = undefined,
>(
  router: Router,
  def: RouteDef<B, Q, P>,
  handler: (req: Request, res: Response, input: Input<B, Q, P>) => Promise<void> | void,
): void {
  const auth = def.auth ?? 'user'
  const chain: RequestHandler[] = []
  if (auth !== 'none') chain.push(requireAuth)
  if (auth === 'admin') chain.push(requireRole('admin'))
  if (def.middleware) chain.push(...def.middleware)

  chain.push((req: Request, res: Response, next: NextFunction) => {
    const input = {
      body: def.body ? (def.body as ZodTypeAny).parse(req.body ?? {}) : undefined,
      query: def.query ? (def.query as ZodTypeAny).parse(req.query ?? {}) : undefined,
      params: def.params ? (def.params as ZodTypeAny).parse(req.params ?? {}) : undefined,
    } as Input<B, Q, P>
    return Promise.resolve(handler(req, res, input)).catch(next)
  })

  router[def.method](def.path, ...chain)

  // documented relative to the server URL (API_BASE_PATH), e.g. /me/phrases/{key}/heard
  const openapiPath = def.path.replace(/:([A-Za-z_]+)/g, '{$1}').replace(/\/$/, '') || '/'
  const registrationKey = `${def.method} ${openapiPath}`
  if (registered.has(registrationKey)) return
  registered.add(registrationKey)
  const responses: RouteConfig['responses'] = {}
  for (const [status, r] of Object.entries(def.responses ?? { 200: { description: 'OK' } })) {
    responses[status] = r.schema
      ? { description: r.description, content: { 'application/json': { schema: r.schema } } }
      : { description: r.description }
  }
  responses.default = {
    description: 'Error',
    content: { 'application/json': { schema: ErrorResponseSchema } },
  }
  const request: NonNullable<RouteConfig['request']> = {}
  if (def.body) request.body = { content: { 'application/json': { schema: def.body as ZodTypeAny } } }
  if (def.query) request.query = def.query as unknown as z.ZodObject
  if (def.params) request.params = def.params as unknown as z.ZodObject
  if (def.headers) request.headers = def.headers as unknown as z.ZodObject

  registry.registerPath({
    method: def.method,
    path: openapiPath,
    summary: def.summary,
    ...(def.description ? { description: def.description } : {}),
    tags: def.tags,
    ...(auth !== 'none' ? { security: [{ bearerAuth: [] }] } : {}),
    request,
    responses,
  })
}
