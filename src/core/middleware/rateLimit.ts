import type { Request, RequestHandler } from 'express'
import {
  rateLimit,
  ipKeyGenerator,
  type Options,
  type Store,
  type IncrementResponse,
} from 'express-rate-limit'
import { env } from '../../config/env.js'
import { AppError } from '../errors.js'
import { verifyAccessToken } from '../../modules/auth/tokens.js'
import { RateLimitModel } from './rateLimitStore.model.js'
import { trusted } from '../../db/plugins.js'

/** express-rate-limit store backed by MongoDB (shared across instances, TTL-cleaned). */
export class MongoRateLimitStore implements Store {
  windowMs = 60_000
  prefix: string
  constructor(prefix: string) {
    this.prefix = prefix
  }
  init(options: Options): void {
    this.windowMs = options.windowMs
  }
  async increment(key: string): Promise<IncrementResponse> {
    const now = new Date()
    const expired = { $or: [{ $eq: [{ $type: '$resetAt' }, 'missing'] }, { $lt: ['$resetAt', now] }] }
    const doc = await RateLimitModel.findOneAndUpdate(
      { _id: this.prefix + key },
      [
        {
          $set: {
            hits: { $cond: [expired, 1, { $add: ['$hits', 1] }] },
            resetAt: { $cond: [expired, new Date(now.getTime() + this.windowMs), '$resetAt'] },
          },
        },
      ],
      { upsert: true, new: true, lean: true },
    )
    return { totalHits: doc?.hits ?? 1, resetTime: doc?.resetAt ?? new Date(now.getTime() + this.windowMs) }
  }
  async decrement(key: string): Promise<void> {
    await RateLimitModel.updateOne(
      { _id: this.prefix + key, hits: trusted({ $gt: 0 }) },
      { $inc: { hits: -1 } },
    )
  }
  async resetKey(key: string): Promise<void> {
    await RateLimitModel.deleteOne({ _id: this.prefix + key })
  }
}

const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown')

/** Key by the authenticated user when a valid access token is present, else by IP. */
export function userOrIpKey(req: Request): string {
  if (req.user) return `u:${req.user.id}`
  const header = req.get('authorization')
  if (header?.startsWith('Bearer ')) {
    try {
      return `u:${verifyAccessToken(header.slice(7).trim()).sub}`
    } catch {
      /* fall through to IP */
    }
  }
  return `ip:${ipKey(req)}`
}

export function emailKey(req: Request): string {
  const email = (req.body as { email?: unknown } | undefined)?.email
  return typeof email === 'string' ? `e:${email.trim().toLowerCase()}` : `ip:${ipKey(req)}`
}

function limiter(name: string, limit: number, keyGenerator: (req: Request) => string): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) return (_req, _res, next) => next()
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    ...(env.RATE_LIMIT_STORE === 'mongo' ? { store: new MongoRateLimitStore(`${name}:`) } : {}),
    handler: () => {
      throw new AppError('RATE_LIMITED', 'Too many requests, slow down')
    },
  })
}

export const rateLimits = {
  general: () => limiter('general', 300, userOrIpKey),
  authIp: () => limiter('auth-ip', 10, (req) => `ip:${ipKey(req)}`),
  authEmail: () => limiter('auth-email', 5, emailKey),
  refresh: () => limiter('refresh', 30, (req) => `ip:${ipKey(req)}`),
  sync: () => limiter('sync', 30, userOrIpKey),
  resend: () => limiter('resend', 3, userOrIpKey),
}
