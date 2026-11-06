import mongoose from 'mongoose'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { migrateDown, migrateUp } from '../../src/db/migrate.js'
import { compactTombstones } from '../../src/jobs/scheduler.js'
import { LearnerStateModel } from '../../src/modules/progress/progress.model.js'
import { TombstoneModel } from '../../src/modules/phrasebook/phrasebook.model.js'
import { UserModel } from '../../src/modules/users/user.model.js'
import { purgeDeletedAccounts } from '../../src/modules/users/users.service.js'
import { BASE, op, signUp, useTestApp } from '../helpers.js'

const { app } = useTestApp()

describe('account', () => {
  it('reads and patches the profile and preferences', async () => {
    const c = await signUp(app())
    const me = (await c.get('/me').expect(200)).body.data
    expect(me).toMatchObject({
      displayName: 'Test Learner',
      emailVerified: false,
      preferences: { theme: 'system', haptics: true, dailyGoalXp: 50 },
    })
    expect(me.passwordHash).toBeUndefined()
    const r = await c
      .patch('/me', {
        displayName: 'Raian',
        timezone: 'Asia/Dhaka',
        nativeLanguage: 'bn',
        preferences: { theme: 'dark' },
      })
      .expect(200)
    expect(r.body.data).toMatchObject({
      displayName: 'Raian',
      timezone: 'Asia/Dhaka',
      nativeLanguage: 'bn',
      preferences: { theme: 'dark', haptics: true },
    })
    await c.patch('/me', { displayName: '' }).expect(400)
    await c.patch('/me', { role: 'admin' }).expect(400)
    expect((await c.patch('/me', { nativeLanguage: null }).expect(200)).body.data.nativeLanguage).toBeNull()
  })

  it('stores voices per device', async () => {
    const c = await signUp(app())
    await c
      .put('/me/devices/current', { appVersion: '1.3.0', voices: { 'es-ES': 'Monica', 'ja-JP': 'Kyoko' } })
      .expect(200)
    const d = (await c.get('/me/devices/current').expect(200)).body.data
    expect(d).toMatchObject({
      client: 'android',
      appVersion: '1.3.0',
      voices: { 'es-ES': 'Monica', 'ja-JP': 'Kyoko' },
    })
    const other = await request(app())
      .get(`${BASE}/me/devices/current`)
      .set('Authorization', `Bearer ${c.token}`)
      .set('X-Device-Id', 'another-device-01')
      .expect(200)
    expect(other.body.data.voices).toEqual({})
    await request(app())
      .get(`${BASE}/me/devices/current`)
      .set('Authorization', `Bearer ${c.token}`)
      .expect(400)
  })

  it('exports every learner collection including notes, never hashes', async () => {
    const c = await signUp(app())
    await c.put('/me/phrases/spanish:hello/note', { note: 'mine' }).expect(200)
    const r = await c.get('/me/export').expect(200)
    expect(r.headers['content-disposition']).toContain('attachment')
    const e = r.body.data
    expect(e.phraseStates[0]).toMatchObject({ key: 'spanish:hello', note: 'mine' })
    expect(JSON.stringify(e)).not.toMatch(/tokenHash|passwordHash/)
    expect(e.sessions.length).toBeGreaterThan(0)
  })

  it('deletes the account (password required), blocks login, purges after 7 days', async () => {
    const c = await signUp(app())
    await c.post('/me/phrases/spanish:hello/heard', {}).expect(200)
    await c.del('/me', { password: 'wrong one!' }).expect(401)
    const r = await c.del('/me', { password: c.password }).expect(200)
    expect(r.body.data.purgeAfterDays).toBe(7)
    await c.get('/me').expect(401)
    await request(app()).post(`${BASE}/auth/login`).send({ email: c.email, password: c.password }).expect(401)
    expect(await purgeDeletedAccounts()).toBe(0)
    expect(await purgeDeletedAccounts(new Date(Date.now() + 8 * 86400_000))).toBe(1)
    expect(await UserModel.exists({ email: c.email })).toBeNull()
    expect(await LearnerStateModel.exists({ userId: new mongoose.Types.ObjectId(c.userId) })).toBeNull()
  })

  it('compacts old tombstones and moves the delta floor past them', async () => {
    const c = await signUp(app())
    await c
      .post('/sync', {
        deviceId: c.deviceId,
        ops: [op('phrase.favorite', { key: 'english:yes', value: true })],
      })
      .expect(200)
    await c
      .post('/sync', {
        deviceId: c.deviceId,
        ops: [op('phrase.favorite', { key: 'english:yes', value: false })],
      })
      .expect(200)
    expect((await c.get('/me/state/changes?since=1')).body.data.full).toBe(false)
    await TombstoneModel.collection.updateMany(
      {},
      { $set: { createdAt: new Date(Date.now() - 100 * 86400_000) } },
    )
    expect(await compactTombstones()).toBeGreaterThan(0)
    expect((await c.get('/me/state/changes?since=1')).body.data.full).toBe(true)
  })

  it('runs migrations up and down', async () => {
    const db = mongoose.connection.db!
    expect(await migrateUp(db)).toEqual(['0001-initial-indexes'])
    expect(await migrateUp(db)).toEqual([])
    expect(await migrateDown(db)).toBe('0001-initial-indexes')
    expect(await migrateUp(db)).toEqual(['0001-initial-indexes'])
  })
})

describe('admin', () => {
  it('is forbidden for learners and works for admins (no notes exposed)', async () => {
    const learner = await signUp(app(), { email: 'learner-admin-test@example.com' })
    await learner.put('/me/phrases/spanish:hello/note', { note: 'secret note' }).expect(200)
    await learner.get('/admin/stats').expect(403)
    const admin = await signUp(app())
    await UserModel.updateOne({ email: admin.email }, { $set: { role: 'admin' } })
    const login = await request(app())
      .post(`${BASE}/auth/login`)
      .set('X-Client', 'ios')
      .send({ email: admin.email, password: admin.password })
      .expect(200)
    const auth = (t: request.Test) => t.set('Authorization', `Bearer ${login.body.data.accessToken}`)
    const users = await auth(request(app()).get(`${BASE}/admin/users?q=learner-admin`)).expect(200)
    expect(users.body.data).toHaveLength(1)
    expect(JSON.stringify(users.body)).not.toContain('secret note')
    const page = await auth(request(app()).get(`${BASE}/admin/users?limit=1`)).expect(200)
    expect(page.body.meta.nextCursor).toBeTruthy()
    await auth(request(app()).get(`${BASE}/admin/users?limit=1&cursor=${page.body.meta.nextCursor}`)).expect(
      200,
    )
    const stats = await auth(request(app()).get(`${BASE}/admin/stats`)).expect(200)
    expect(stats.body.data.opsPerDay.length).toBeGreaterThan(0)
    await auth(request(app()).patch(`${BASE}/admin/users/${learner.userId}`))
      .send({ status: 'disabled' })
      .expect(200)
    await learner.get('/me').expect(401)
    const dry = await auth(request(app()).post(`${BASE}/admin/content/reseed`))
      .send({})
      .expect(200)
    expect(dry.body.data).toMatchObject({ dryRun: true, changed: false, counts: { phrases: 86 } })
  })
})

describe('phase 2 stubs', () => {
  it('translation and help answer 501 NOT_ENABLED', async () => {
    const c = await signUp(app())
    expect((await c.get('/translation/languages').expect(501)).body.error.code).toBe('NOT_ENABLED')
    await c
      .post('/translation', { items: [{ id: '1', text: 'Hello' }], sourceLang: 'en', targetLang: 'bn' })
      .expect(501)
    expect((await c.post('/help/ask', { question: 'what is due?' }).expect(501)).body.error.code).toBe(
      'NOT_ENABLED',
    )
  })

  it('serves the OpenAPI document', async () => {
    const r = await request(app()).get(`${BASE}/docs/openapi.json`).expect(200)
    expect(r.body.openapi).toBe('3.1.0')
    expect(Object.keys(r.body.paths)).toContain('/me/phrases/{key}/heard')
  })
})
