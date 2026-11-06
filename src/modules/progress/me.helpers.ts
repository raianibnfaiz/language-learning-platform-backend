import type { Request, Response } from 'express'
import { userId } from '../../core/middleware/auth.js'
import { ok } from '../../core/http.js'
import { headerMeta, userTimezone } from './state.service.js'

export const tzOf = (req: Request) => userTimezone(userId(req), req.client.timezone)
export const deviceOf = (req: Request) => req.client.deviceId ?? `direct-${req.client.kind}`

/** Every mutating learner response: `{ data, meta: { stateVersion, xp, level, streak, todayXp } }`. */
export async function sendMutation(req: Request, res: Response, data: unknown): Promise<void> {
  ok(res, data, await headerMeta(userId(req), await tzOf(req)))
}
