import { Router, type Request, type Response, type NextFunction, type CookieOptions } from 'express'
import { z } from 'zod'
import { env } from '../../config/env.js'
import { AppError } from '../../core/errors.js'
import { accepted, created, noContent, ok } from '../../core/http.js'
import { userId } from '../../core/middleware/auth.js'
import { noStore } from '../../core/middleware/cache.js'
import { rateLimits } from '../../core/middleware/rateLimit.js'
import { defineRoute } from '../../core/route.js'
import { bcp47, displayName, email, objectId, password, timezone } from '../../core/schemas.js'
import * as auth from './auth.service.js'
import { verifyAccessToken } from './tokens.js'

const tags = ['Auth']
export const REFRESH_COOKIE = 'lbt_rt'

const cookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAMESITE,
  path: `${env.API_BASE_PATH}/auth`,
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  ...(expires ? { expires } : {}),
})

const meta = (req: Request): auth.RequestMeta => ({
  client: req.client.kind,
  deviceId: req.client.deviceId,
  userAgent: req.get('user-agent'),
  ip: req.ip,
})

/** Web gets the refresh token as an httpOnly cookie; mobile gets it in the JSON body. */
function sendAuth(
  req: Request,
  res: Response,
  status: 200 | 201,
  out: { user: unknown; tokens: auth.IssuedTokens },
) {
  const body: Record<string, unknown> = {
    user: out.user,
    accessToken: out.tokens.accessToken,
    accessTokenExpiresIn: env.JWT_ACCESS_TTL,
  }
  if (req.client.kind === 'web')
    res.cookie(REFRESH_COOKIE, out.tokens.refreshToken, cookieOptions(out.tokens.refreshExpiresAt))
  else body.refreshToken = out.tokens.refreshToken
  return status === 201 ? created(res, body) : ok(res, body)
}

/** CSRF guard for cookie-authenticated endpoints: custom header + allowed Origin. */
function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  if (req.client.kind !== 'web') return next()
  if (req.get('x-requested-with') !== 'lingbloomtalk')
    throw new AppError('FORBIDDEN', 'Missing X-Requested-With header')
  const origin = req.get('origin')
  if (origin && !env.CORS_ORIGINS.includes(origin)) throw new AppError('FORBIDDEN', 'Origin not allowed')
  next()
}

const TokenResponse = z
  .object({
    data: z.object({
      user: z.record(z.string(), z.unknown()),
      accessToken: z.string(),
      accessTokenExpiresIn: z.string(),
      refreshToken: z.string().optional().describe('mobile clients only (X-Client: ios|android)'),
    }),
  })
  .openapi('AuthResponse')

export function authRouter(): Router {
  const r = Router()
  r.use(noStore)

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/register',
      summary: 'Create an account',
      tags,
      auth: 'none',
      middleware: [rateLimits.authIp(), rateLimits.authEmail()],
      body: z.object({ email, password, displayName, timezone, nativeLanguage: bcp47.optional() }).strict(),
      responses: { 201: { description: 'Created', schema: TokenResponse } },
    },
    async (req, res, { body }) => sendAuth(req, res, 201, await auth.register(body, meta(req))),
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/login',
      summary: 'Log in with email + password',
      tags,
      auth: 'none',
      middleware: [rateLimits.authIp(), rateLimits.authEmail()],
      body: z.object({ email, password: z.string().min(1).max(128) }).strict(),
      responses: { 200: { description: 'OK', schema: TokenResponse } },
    },
    async (req, res, { body }) => sendAuth(req, res, 200, await auth.login(body, meta(req))),
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/refresh',
      summary: 'Rotate the refresh token (web: cookie, mobile: body)',
      tags,
      auth: 'none',
      middleware: [rateLimits.refresh(), csrfGuard],
      body: z.object({ refreshToken: z.string().min(20).max(200).optional() }).strict(),
      responses: { 200: { description: 'OK', schema: TokenResponse } },
    },
    async (req, res, { body }) => {
      const token =
        req.client.kind === 'web' ? (req.cookies?.[REFRESH_COOKIE] as string | undefined) : body.refreshToken
      if (!token) throw new AppError('UNAUTHENTICATED', 'Missing refresh token')
      try {
        sendAuth(req, res, 200, await auth.refresh(token, meta(req)))
      } catch (err) {
        if (req.client.kind === 'web') res.clearCookie(REFRESH_COOKIE, cookieOptions())
        throw err
      }
    },
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/logout',
      summary: 'Revoke the current session',
      tags,
      auth: 'none',
      middleware: [csrfGuard],
      body: z.object({ refreshToken: z.string().max(200).optional() }).strict(),
      responses: { 204: { description: 'Logged out' } },
    },
    async (req, res, { body }) => {
      let sid: string | undefined
      const header = req.get('authorization')
      if (header?.startsWith('Bearer ')) {
        try {
          sid = verifyAccessToken(header.slice(7)).sid
        } catch {
          /* expired access tokens can still log out via the refresh token */
        }
      }
      const token =
        req.client.kind === 'web' ? (req.cookies?.[REFRESH_COOKIE] as string | undefined) : body.refreshToken
      await auth.logout(sid, token)
      if (req.client.kind === 'web') res.clearCookie(REFRESH_COOKIE, cookieOptions())
      noContent(res)
    },
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/logout-all',
      summary: 'Sign out of all devices',
      tags,
      responses: { 204: { description: 'Done' } },
    },
    async (req, res) => {
      await auth.logoutAll(userId(req), meta(req))
      if (req.client.kind === 'web') res.clearCookie(REFRESH_COOKIE, cookieOptions())
      noContent(res)
    },
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/verify-email',
      summary: 'Confirm an email address',
      tags,
      auth: 'none',
      middleware: [rateLimits.authIp()],
      body: z.object({ token: z.string().min(20).max(200) }).strict(),
    },
    async (_req, res, { body }) => ok(res, await auth.verifyEmail(body.token)),
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/resend-verification',
      summary: 'Send the verification email again',
      tags,
      middleware: [rateLimits.resend()],
    },
    async (req, res) => ok(res, await auth.resendVerification(userId(req))),
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/forgot-password',
      summary: 'Request a password reset email (always 202)',
      tags,
      auth: 'none',
      middleware: [rateLimits.authIp(), rateLimits.authEmail()],
      body: z.object({ email }).strict(),
      responses: { 202: { description: 'Accepted' } },
    },
    async (_req, res, { body }) => {
      await auth.forgotPassword(body.email)
      accepted(res, { message: 'If an account exists for this email, we sent instructions.' })
    },
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/reset-password',
      summary: 'Set a new password with a reset token',
      tags,
      auth: 'none',
      middleware: [rateLimits.authIp()],
      body: z.object({ token: z.string().min(20).max(200), password }).strict(),
    },
    async (req, res, { body }) => {
      await auth.resetPassword(body.token, body.password, meta(req))
      ok(res, { reset: true })
    },
  )

  defineRoute(
    r,
    {
      method: 'post',
      path: '/auth/change-password',
      summary: 'Change password (signs out every other device)',
      tags,
      middleware: [rateLimits.authIp()],
      body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }).strict(),
      responses: { 200: { description: 'OK', schema: TokenResponse } },
    },
    async (req, res, { body }) => {
      const tokens = await auth.changePassword(userId(req), body.currentPassword, body.newPassword, meta(req))
      const out: Record<string, unknown> = {
        accessToken: tokens.accessToken,
        accessTokenExpiresIn: env.JWT_ACCESS_TTL,
      }
      if (req.client.kind === 'web')
        res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(tokens.refreshExpiresAt))
      else out.refreshToken = tokens.refreshToken
      ok(res, out)
    },
  )

  defineRoute(
    r,
    { method: 'get', path: '/auth/sessions', summary: 'Active devices', tags },
    async (req, res) => ok(res, await auth.listSessions(userId(req), req.user!.sessionId)),
  )

  defineRoute(
    r,
    {
      method: 'delete',
      path: '/auth/sessions/:id',
      summary: 'Revoke one device',
      tags,
      params: z.object({ id: objectId }),
      responses: { 204: { description: 'Revoked' } },
    },
    async (req, res, { params }) => {
      await auth.revokeSession(userId(req), params.id)
      noContent(res)
    },
  )
  return r
}
