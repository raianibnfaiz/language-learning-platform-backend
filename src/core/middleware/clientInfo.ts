import type { NextFunction, Request, Response } from 'express'
import { env } from '../../config/env.js'
import { AppError } from '../errors.js'
import { isValidTimezone } from '../time.js'

const CLIENTS = new Set(['web', 'ios', 'android'])
const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  return 0
}

const minVersion = {
  web: env.MIN_APP_VERSION_WEB,
  ios: env.MIN_APP_VERSION_IOS,
  android: env.MIN_APP_VERSION_ANDROID,
} as const

/** Reads X-Client, X-App-Version, X-Device-Id, X-Timezone and enforces the minimum app version. */
export function clientInfo(req: Request, _res: Response, next: NextFunction): void {
  const rawClient = (req.get('x-client') ?? 'web').toLowerCase()
  const kind = (CLIENTS.has(rawClient) ? rawClient : 'web') as 'web' | 'ios' | 'android'
  const appVersion = req.get('x-app-version')
  const deviceId = req.get('x-device-id')
  const tz = req.get('x-timezone')
  req.client = {
    kind,
    appVersion: appVersion && /^\d+\.\d+\.\d+/.test(appVersion) ? appVersion : undefined,
    deviceId: deviceId && DEVICE_ID.test(deviceId) ? deviceId : undefined,
    timezone: tz && isValidTimezone(tz) ? tz : undefined,
  }
  if (req.client.appVersion && compareSemver(req.client.appVersion, minVersion[kind]) < 0) {
    throw new AppError('UPGRADE_REQUIRED', 'Please update the app to keep syncing', {
      details: { minVersion: minVersion[kind] },
    })
  }
  next()
}
