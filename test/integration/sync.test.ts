import { describe, expect, it } from 'vitest'
import { addDays } from '../../src/core/time.js'
import { AuditLogModel } from '../../src/modules/users/user.model.js'
import { env } from '../../src/config/env.js'
import { op, signUp, today, useTestApp, type Client } from '../helpers.js'

const { app } = useTestApp()
const sync = (c: Client, ops: object[], extra: object = {}) =>
  c.post('/sync', { deviceId: c.deviceId, timezone: 'UTC', ops, ...extra })
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

describe('POST /sync', () => {
  it('applies a batch atomically with one version bump and returns derived numbers + changes', async () => {
    const c = await signUp(app())
    const r = await sync(
      c,
      [
        op('phrase.heard', { key: 'spanish:hello' }),
        op('phrase.heard', { key: 'spanish:goodbye' }),
        op('language.visit', { langId: 'spanish' }),
        op('phrase.favorite', { key: 'spanish:hello', value: true }),
      ],
      { sinceVersion: 0 },
    ).expect(200)
    expect(r.body.data.results.map((x: { status: string }) => x.status)).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
    ])
    expect(r.body.data.stateVersion).toBe(1)
    expect(r.body.data.derived).toMatchObject({ xp: 4, level: 1, streak: 1, todayXp: 4, dueCount: 0 })
    expect(r.body.data.changes).toMatchObject({
      full: false,
      stateVersion: 1,
      phrasebook: { recent: ['spanish'] },
    })
    expect(r.body.data.changes.phrasebook.phrases['spanish:hello']).toEqual({
      heard: true,
      favorite: true,
      note: '',
      review: null,
    })
  })

  it('replaying the same batch changes nothing', async () => {
    const c = await signUp(app())
    const batch = [
      op('phrase.heard', { key: 'english:hello' }),
      op('practice.answered', { correct: 2, total: 4 }),
    ]
    const first = await sync(c, batch).expect(200)
    const second = await sync(c, batch).expect(200)
    expect(second.body.data.results.map((x: { status: string }) => x.status)).toEqual([
      'duplicate',
      'duplicate',
    ])
    expect(second.body.data.results[1].xpDelta).toBe(20)
    expect(second.body.data.stateVersion).toBe(first.body.data.stateVersion)
    expect(second.body.data.derived.xp).toBe(22)
    // same opId twice inside one batch
    const dupInBatch = op('phrase.speak', { key: 'english:yes', score: 1 })
    const r = await sync(c, [dupInBatch, dupInBatch]).expect(200)
    expect(r.body.data.results.map((x: { status: string }) => x.status)).toEqual(['applied', 'duplicate'])
    expect(r.body.data.derived.xp).toBe(27)
  })

  it('awards first-listen XP once across two devices', async () => {
    const c = await signUp(app())
    const phone = { ...c, deviceId: 'phone-device-0001' }
    const web = { ...c, deviceId: 'web-device-000001' }
    const [a, b] = await Promise.all([
      sync(phone, [op('phrase.heard', { key: 'spanish:yes' })]),
      sync(web, [op('phrase.heard', { key: 'spanish:yes' })]),
    ])
    const xps = [a.body.data.results[0].xpDelta, b.body.data.results[0].xpDelta].sort()
    expect(xps).toEqual([0, 2])
    expect((await c.get('/me/summary')).body.data.xp).toBe(2)
  })

  it('rejected ops never block the rest and carry an error code', async () => {
    const c = await signUp(app())
    const r = await sync(c, [
      op('phrase.heard', { key: 'spanish:unknown' }),
      op('test.recorded', {
        langId: 'spanish',
        situationId: 'taxi',
        test: 3,
        correct: 5,
        total: 5,
        missed: [],
        comboBonuses: 0,
      }),
      { opId: 'broken-op-0001', type: 'phrase.heard' },
      { type: 'nonsense' },
      op('phrase.heard', { key: 'spanish:no' }, { localDay: addDays(today(), 3) }),
      op('phrase.heard', { key: 'spanish:yes' }),
    ]).expect(200)
    expect(r.body.data.results.map((x: { status: string; reason?: string }) => [x.status, x.reason])).toEqual(
      [
        ['rejected', 'UNKNOWN_PHRASE'],
        ['rejected', 'TEST_LOCKED'],
        ['rejected', 'VALIDATION_ERROR'],
        ['rejected', 'VALIDATION_ERROR'],
        ['rejected', 'DAY_OUT_OF_RANGE'],
        ['applied', undefined],
      ],
    )
    expect(r.body.data.derived.xp).toBe(2)
  })

  it('accepts backdated days only for offline ops, up to 30 days', async () => {
    const c = await signUp(app())
    const r = await sync(c, [
      op(
        'practice.answered',
        { correct: 1, total: 1 },
        { localDay: addDays(today(), -5), occurredAt: new Date().toISOString() },
      ),
      op(
        'practice.answered',
        { correct: 1, total: 1 },
        { localDay: addDays(today(), -5), occurredAt: hoursAgo(5 * 24) },
      ),
      op(
        'practice.answered',
        { correct: 1, total: 1 },
        { localDay: addDays(today(), -31), occurredAt: hoursAgo(31 * 24) },
      ),
      op(
        'practice.answered',
        { correct: 1, total: 1 },
        { localDay: addDays(today(), -1), occurredAt: new Date().toISOString() },
      ),
    ]).expect(200)
    expect(r.body.data.results.map((x: { status: string }) => x.status)).toEqual([
      'rejected',
      'applied',
      'rejected',
      'applied',
    ])
    const s = (await c.get('/me/state')).body.data
    expect(s.progress.activity).toEqual({ [addDays(today(), -5)]: 10, [addDays(today(), -1)]: 10 })
    expect(r.body.data.derived.streak).toBe(1)
  })

  it('ignores an older review answer that arrives after a newer one', async () => {
    const c = await signUp(app())
    await sync(c, [op('review.add', { keys: ['english:left'] }, { occurredAt: hoursAgo(3) })]).expect(200)
    const newer = op('review.answer', { key: 'english:left', knewIt: true }, { occurredAt: hoursAgo(1) })
    const older = op('review.answer', { key: 'english:left', knewIt: false }, { occurredAt: hoursAgo(2) })
    await sync(c, [newer]).expect(200)
    const r = await sync(c, [older]).expect(200)
    expect(r.body.data.results[0].result).toMatchObject({ ignored: 'stale' })
    expect((await c.get('/me/state')).body.data.phrasebook.review['english:left'].box).toBe(1)
  })

  it('converges when two devices sync interleaved batches in either order', async () => {
    const t = (h: number) => hoursAgo(h)
    const phoneOps = [
      op('phrase.heard', { key: 'spanish:hello' }, { occurredAt: t(5) }),
      op('phrase.note', { key: 'spanish:hello', note: 'from phone' }, { occurredAt: t(4) }),
      op('phrase.favorite', { key: 'spanish:hello', value: true }, { occurredAt: t(3) }),
      op('lesson.complete', { lessonId: 'es-1', value: true }, { occurredAt: t(5) }),
      op('language.visit', { langId: 'japanese' }, { occurredAt: t(1) }),
    ]
    const webOps = [
      op('phrase.heard', { key: 'spanish:hello' }, { occurredAt: t(4.5) }),
      op('phrase.note', { key: 'spanish:hello', note: 'from web' }, { occurredAt: t(2) }),
      op('phrase.favorite', { key: 'spanish:hello', value: false }, { occurredAt: t(3.5) }),
      op('lesson.complete', { lessonId: 'es-1', value: false }, { occurredAt: t(2) }),
      op('language.visit', { langId: 'english' }, { occurredAt: t(2) }),
      op('prefs.update', { theme: 'dark' }, { occurredAt: t(2) }),
    ]
    const run = async (order: 'phone-first' | 'web-first') => {
      const c = await signUp(app())
      const phone = { ...c, deviceId: 'phone-device-0001' }
      const web = { ...c, deviceId: 'web-device-000001' }
      const batches =
        order === 'phone-first'
          ? ([
              [phone, phoneOps],
              [web, webOps],
            ] as const)
          : ([
              [web, webOps],
              [phone, phoneOps],
            ] as const)
      for (const [dev, ops] of batches)
        await sync(
          dev,
          ops.map((o) => ({ ...o, opId: `${o.opId.slice(0, 30)}-${order}` })),
        ).expect(200)
      const s = (await c.get('/me/state')).body.data
      return { progress: s.progress, phrasebook: s.phrasebook, preferences: s.preferences }
    }
    const a = await run('phone-first')
    const b = await run('web-first')
    expect(a).toEqual(b)
    expect(a.phrasebook).toMatchObject({
      heard: ['spanish:hello'],
      notes: { 'spanish:hello': 'from web' },
      favorites: ['spanish:hello'],
      recent: ['japanese', 'english'],
    })
    expect(a.progress).toMatchObject({ completedLessons: [], xp: 2 })
    expect(a.preferences.theme).toBe('dark')
  })

  it('flags (does not block) more than the daily XP cap', async () => {
    const c = await signUp(app())
    const ops = Array.from({ length: Math.ceil(env.MAX_DAILY_XP / 200) + 1 }, () =>
      op('practice.answered', { correct: 20, total: 20 }),
    )
    const r = await sync(c, ops).expect(200)
    expect(r.body.data.results.every((x: { status: string }) => x.status === 'applied')).toBe(true)
    expect(await AuditLogModel.countDocuments({ event: 'daily_xp_cap_exceeded' })).toBe(1)
  })

  it('serves deltas with removals and falls back to a full snapshot when too old', async () => {
    const c = await signUp(app())
    const v1 = (
      await sync(c, [
        op('phrase.favorite', { key: 'english:right', value: true }),
        op('word.favorite', { langId: 'english', word: 'right', value: true }),
      ]).expect(200)
    ).body.data.stateVersion
    await sync(c, [
      op('phrase.favorite', { key: 'english:right', value: false }),
      op('word.favorite', { langId: 'english', word: 'right', value: false }),
      op('test.recorded', {
        langId: 'english',
        situationId: 'directions',
        test: 1,
        correct: 5,
        total: 5,
        missed: [],
        comboBonuses: 1,
      }),
    ]).expect(200)
    const d = (await c.get(`/me/state/changes?since=${v1}`).expect(200)).body.data
    expect(d.full).toBe(false)
    expect(d.phrasebook.phrases).toEqual({
      'english:right': { heard: false, favorite: false, note: '', review: null },
    })
    expect(d.phrasebook.favoriteWords).toEqual({ 'english:right': false })
    expect(d.phrasebook.stars).toEqual({ 'english:directions:1': 3 })
    expect(d.progress.activity).toEqual({ [today()]: 30 })
    const none = (await c.get(`/me/state/changes?since=${d.stateVersion}`).expect(200)).body.data
    expect(none.phrasebook.phrases).toEqual({})
    expect((await c.get('/me/state/changes?since=999').expect(200)).body.data.full).toBe(true)
  })

  it('validates the envelope (max 500 ops, deviceId)', async () => {
    const c = await signUp(app())
    await c.post('/sync', { deviceId: 'x', ops: [] }).expect(400)
    await c.post('/sync', { deviceId: c.deviceId, ops: Array.from({ length: 501 }, () => ({})) }).expect(400)
  })
})
