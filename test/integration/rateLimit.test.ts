import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { env } from '../../src/config/env.js'
import { createApp } from '../../src/app.js'
import { BASE, useTestApp } from '../helpers.js'

useTestApp()

describe('rate limits', () => {
  it('limits auth endpoints per IP with the Mongo store', async () => {
    Object.assign(env, { RATE_LIMIT_ENABLED: true, RATE_LIMIT_STORE: 'mongo' })
    const app = createApp()
    const codes: number[] = []
    for (let i = 0; i < 11; i++) {
      const r = await request(app)
        .post(`${BASE}/auth/login`)
        .send({ email: `rl${i}@example.com`, password: 'whatever pass' })
      codes.push(r.status)
    }
    expect(codes.slice(0, 10).every((s) => s === 401)).toBe(true)
    const last = await request(app)
      .post(`${BASE}/auth/login`)
      .send({ email: 'rl@example.com', password: 'whatever pass' })
    expect(last.status).toBe(429)
    expect(last.body.error.code).toBe('RATE_LIMITED')
  })
})
