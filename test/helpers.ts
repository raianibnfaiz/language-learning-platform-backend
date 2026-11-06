import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import request from 'supertest'
import type { Express } from 'express'
import { afterAll, beforeAll } from 'vitest'
import { createApp } from '../src/app.js'
import { env } from '../src/config/env.js'
import { loadContent } from '../src/modules/content/content.store.js'
import { seedFromSource } from '../src/db/seed/seed.js'
import { todayIn } from '../src/core/time.js'

export const FIXTURE_COUNTS = { languages: 3, situations: 7, phrases: 86, careerLanguages: 2, lessons: 12 }
export const BASE = env.API_BASE_PATH

/** Connects to this file's private database, seeds the fixture content and builds the app. */
export function useTestApp(): { app: () => Express } {
  let app: Express | undefined
  beforeAll(async () => {
    await mongoose.connect(env.MONGODB_URI)
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()))
    await seedFromSource({ expected: FIXTURE_COUNTS })
    await loadContent()
    app = createApp()
  })
  afterAll(async () => {
    await mongoose.connection.dropDatabase()
    await mongoose.disconnect()
  })
  return { app: () => app! }
}

export interface Client {
  token: string
  refreshToken: string
  userId: string
  deviceId: string
  email: string
  password: string
  get(path: string): request.Test
  post(path: string, body?: object): request.Test
  put(path: string, body?: object): request.Test
  patch(path: string, body?: object): request.Test
  del(path: string, body?: object): request.Test
}

export const today = (tz = 'UTC') => todayIn(tz)

/** Registers a mobile (body refresh token) user and returns a tiny authenticated client. */
export async function signUp(
  app: Express,
  opts: { email?: string; timezone?: string; client?: 'ios' | 'android' } = {},
): Promise<Client> {
  const email = opts.email ?? `u${randomUUID().slice(0, 8)}@example.com`
  const password = 'correct horse battery'
  const deviceId = randomUUID()
  const res = await request(app)
    .post(`${BASE}/auth/register`)
    .set('X-Client', opts.client ?? 'android')
    .set('X-Device-Id', deviceId)
    .send({ email, password, displayName: 'Test Learner', timezone: opts.timezone ?? 'UTC' })
    .expect(201)
  return makeClient(app, {
    token: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
    userId: res.body.data.user.id,
    deviceId,
    email,
    password,
    timezone: opts.timezone ?? 'UTC',
  })
}

export function makeClient(
  app: Express,
  c: {
    token: string
    refreshToken: string
    userId: string
    deviceId: string
    email: string
    password: string
    timezone?: string
  },
): Client {
  const h = (t: request.Test) =>
    t
      .set('Authorization', `Bearer ${c.token}`)
      .set('X-Client', 'android')
      .set('X-Device-Id', c.deviceId)
      .set('X-Timezone', c.timezone ?? 'UTC')
  return {
    ...c,
    get: (p) => h(request(app).get(BASE + p)),
    post: (p, b) => h(request(app).post(BASE + p)).send(b ?? {}),
    put: (p, b) => h(request(app).put(BASE + p)).send(b ?? {}),
    patch: (p, b) => h(request(app).patch(BASE + p)).send(b ?? {}),
    del: (p, b) => h(request(app).delete(BASE + p)).send(b ?? {}),
  }
}

let opCounter = 0
export function op(
  type: string,
  payload: object,
  extra: { occurredAt?: string; localDay?: string; opId?: string } = {},
) {
  return {
    opId: extra.opId ?? `${randomUUID()}`,
    type,
    occurredAt: extra.occurredAt ?? new Date(Date.now() - 1000 + opCounter++).toISOString(),
    localDay: extra.localDay ?? today(),
    payload,
  }
}
