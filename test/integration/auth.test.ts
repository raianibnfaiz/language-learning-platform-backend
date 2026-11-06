import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { emailService, type ConsoleEmailService } from '../../src/modules/auth/email.service.js'
import { AuditLogModel } from '../../src/modules/users/user.model.js'
import { BASE, makeClient, signUp, useTestApp } from '../helpers.js'

const { app } = useTestApp()
const outbox = () => (emailService as ConsoleEmailService).outbox
const lastToken = (to: string, kind: 'verify-email' | 'reset-password') => {
  const mail = [...outbox()].reverse().find((m) => m.to === to && m.text.includes(kind))
  return mail?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1]
}

describe('auth: registration and login', () => {
  it('registers (mobile gets the refresh token in the body) and rejects duplicates / weak passwords', async () => {
    const c = await signUp(app(), { email: 'dup@example.com' })
    expect(c.refreshToken).toBeTruthy()
    const dup = await request(app())
      .post(`${BASE}/auth/register`)
      .send({ email: 'DUP@example.com', password: 'another good one', displayName: 'X', timezone: 'UTC' })
      .expect(409)
    expect(dup.body.error.code).toBe('EMAIL_TAKEN')
    const weak = await request(app())
      .post(`${BASE}/auth/register`)
      .send({ email: 'weak@example.com', password: 'password123', displayName: 'X', timezone: 'UTC' })
      .expect(400)
    expect(weak.body.error.code).toBe('VALIDATION_ERROR')
    await request(app())
      .post(`${BASE}/auth/register`)
      .send({ email: 'tz@example.com', password: 'fine password', displayName: 'X', timezone: 'Mars/Base' })
      .expect(400)
    await request(app())
      .post(`${BASE}/auth/register`)
      .send({
        email: 'x@example.com',
        password: 'fine password',
        displayName: 'X',
        timezone: 'UTC',
        extra: 1,
      })
      .expect(400)
  })

  it('web gets an httpOnly cookie scoped to the auth path and no refresh token in the body', async () => {
    const r = await request(app())
      .post(`${BASE}/auth/register`)
      .set('X-Client', 'web')
      .send({
        email: 'web@example.com',
        password: 'web password 1',
        displayName: 'Web',
        timezone: 'Asia/Dhaka',
      })
      .expect(201)
    expect(r.body.data.refreshToken).toBeUndefined()
    const cookie = String(r.headers['set-cookie'])
    expect(cookie).toContain('lbt_rt=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain(`Path=${BASE}/auth`)
    expect(cookie).toContain('SameSite=Strict')

    // refresh needs the CSRF header
    const noHeader = await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('Cookie', cookie)
      .send({})
      .expect(403)
    expect(noHeader.body.error.code).toBe('FORBIDDEN')
    await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'lingbloomtalk')
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403)
    const ok = await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('Cookie', cookie)
      .set('X-Requested-With', 'lingbloomtalk')
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(200)
    expect(ok.body.data.accessToken).toBeTruthy()
    expect(String(ok.headers['set-cookie'])).toContain('lbt_rt=')
    // logout clears the cookie
    const out = await request(app())
      .post(`${BASE}/auth/logout`)
      .set('Cookie', String(ok.headers['set-cookie']))
      .set('X-Requested-With', 'lingbloomtalk')
      .send({})
      .expect(204)
    expect(String(out.headers['set-cookie'])).toMatch(/lbt_rt=;/)
  })

  it('logs in, rejects bad credentials without enumeration, locks after 5 failures', async () => {
    const c = await signUp(app(), { email: 'lock@example.com' })
    const unknown = await request(app())
      .post(`${BASE}/auth/login`)
      .send({ email: 'nobody@example.com', password: 'whatever pass' })
      .expect(401)
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS')
    for (let i = 0; i < 5; i++)
      await request(app())
        .post(`${BASE}/auth/login`)
        .send({ email: c.email, password: 'wrong password' })
        .expect(401)
    const locked = await request(app())
      .post(`${BASE}/auth/login`)
      .send({ email: c.email, password: c.password })
      .expect(403)
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED')
    expect(await AuditLogModel.countDocuments({ event: 'account_locked' })).toBe(1)
  })

  it('requires a valid bearer token', async () => {
    const r = await request(app()).get(`${BASE}/me`).expect(401)
    expect(r.body.error.code).toBe('UNAUTHENTICATED')
    const bad = await request(app()).get(`${BASE}/me`).set('Authorization', 'Bearer abc.def.ghi').expect(401)
    expect(bad.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('auth: refresh rotation', () => {
  it('rotates on every use and revokes the whole family when an old token is replayed', async () => {
    const c = await signUp(app())
    const r1 = await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('X-Client', 'ios')
      .send({ refreshToken: c.refreshToken })
      .expect(200)
    const t2 = r1.body.data.refreshToken as string
    expect(t2).not.toBe(c.refreshToken)
    const r2 = await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('X-Client', 'ios')
      .send({ refreshToken: t2 })
      .expect(200)
    const t3 = r2.body.data.refreshToken as string
    // the access token from r2 works
    const live = makeClient(app(), { ...c, token: r2.body.data.accessToken })
    await live.get('/me').expect(200)
    // replay of t2 (already rotated) = theft
    const reuse = await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('X-Client', 'ios')
      .send({ refreshToken: t2 })
      .expect(401)
    expect(reuse.body.error.code).toBe('TOKEN_REVOKED')
    // the newest token of the family is dead too, and so are its access tokens
    await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('X-Client', 'ios')
      .send({ refreshToken: t3 })
      .expect(401)
    const dead = await live.get('/me').expect(401)
    expect(dead.body.error.code).toBe('TOKEN_REVOKED')
    expect(await AuditLogModel.countDocuments({ event: 'refresh_reuse_detected' })).toBeGreaterThan(0)
  })

  it('logout-all bumps tokenVersion so every access token is rejected', async () => {
    const c = await signUp(app())
    const other = await request(app())
      .post(`${BASE}/auth/login`)
      .set('X-Client', 'ios')
      .send({ email: c.email, password: c.password })
      .expect(200)
    await c.post('/auth/logout-all').expect(204)
    const r = await c.get('/me').expect(401)
    expect(r.body.error.code).toBe('TOKEN_REVOKED')
    await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('X-Client', 'ios')
      .send({ refreshToken: other.body.data.refreshToken })
      .expect(401)
  })

  it('lists and revokes sessions', async () => {
    const c = await signUp(app())
    const second = await request(app())
      .post(`${BASE}/auth/login`)
      .set('X-Client', 'ios')
      .send({ email: c.email, password: c.password })
      .expect(200)
    const list = await c.get('/auth/sessions').expect(200)
    expect(list.body.data).toHaveLength(2)
    const other = list.body.data.find((s: { current: boolean }) => !s.current)
    await c.del(`/auth/sessions/${other.id}`).expect(204)
    await request(app())
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${second.body.data.accessToken}`)
      .expect(401)
    await c.get('/me').expect(200)
    await c.del('/auth/sessions/000000000000000000000000').expect(404)
  })
})

describe('auth: email verification and passwords', () => {
  it('verifies email, then resets the password and revokes all sessions', async () => {
    const c = await signUp(app(), { email: 'reset@example.com' })
    // unverified: forgot-password sends a verification link instead
    await request(app()).post(`${BASE}/auth/forgot-password`).send({ email: c.email }).expect(202)
    expect(lastToken(c.email, 'reset-password')).toBeUndefined()
    const vt = lastToken(c.email, 'verify-email')!
    await request(app()).post(`${BASE}/auth/verify-email`).send({ token: vt }).expect(200)
    expect((await c.get('/me')).body.data.emailVerified).toBe(true)
    await request(app()).post(`${BASE}/auth/verify-email`).send({ token: vt }).expect(400)

    await request(app()).post(`${BASE}/auth/forgot-password`).send({ email: 'ghost@example.com' }).expect(202)
    await request(app()).post(`${BASE}/auth/forgot-password`).send({ email: c.email }).expect(202)
    const rt = lastToken(c.email, 'reset-password')!
    await request(app())
      .post(`${BASE}/auth/reset-password`)
      .send({ token: rt, password: 'brand new secret' })
      .expect(200)
    await request(app())
      .post(`${BASE}/auth/reset-password`)
      .send({ token: rt, password: 'brand new secret 2' })
      .expect(400)
    await c.get('/me').expect(401)
    await request(app())
      .post(`${BASE}/auth/login`)
      .send({ email: c.email, password: 'brand new secret' })
      .expect(200)
  })

  it('changes the password, keeps this device signed in, signs out the rest', async () => {
    const c = await signUp(app())
    await c
      .post('/auth/change-password', { currentPassword: 'nope nope nope', newPassword: 'another secret!' })
      .expect(401)
    const r = await c
      .post('/auth/change-password', { currentPassword: c.password, newPassword: 'another secret!' })
      .expect(200)
    await c.get('/me').expect(401)
    await request(app())
      .get(`${BASE}/me`)
      .set('Authorization', `Bearer ${r.body.data.accessToken}`)
      .expect(200)
    await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('X-Client', 'android')
      .send({ refreshToken: c.refreshToken })
      .expect(401)
    await request(app())
      .post(`${BASE}/auth/refresh`)
      .set('X-Client', 'android')
      .send({ refreshToken: r.body.data.refreshToken })
      .expect(200)
  })

  it('resends verification', async () => {
    const c = await signUp(app())
    const r = await c.post('/auth/resend-verification').expect(200)
    expect(r.body.data.sent).toBe(true)
  })
})

describe('client headers', () => {
  it('returns 426 UPGRADE_REQUIRED below the minimum app version', async () => {
    const r = await request(app())
      .get(`${BASE}/health`)
      .set('X-Client', 'ios')
      .set('X-App-Version', '1.1.9')
      .expect(426)
    expect(r.body.error).toMatchObject({ code: 'UPGRADE_REQUIRED', details: { minVersion: '1.2.0' } })
    await request(app())
      .get(`${BASE}/health`)
      .set('X-Client', 'ios')
      .set('X-App-Version', '1.2.0')
      .expect(200)
  })
})
