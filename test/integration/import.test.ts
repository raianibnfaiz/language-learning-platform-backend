import { describe, expect, it } from 'vitest'
import { addDays } from '../../src/core/time.js'
import { op, signUp, today, useTestApp } from '../helpers.js'

const { app } = useTestApp()

const demoSeed = () => {
  const start = addDays(today(), -6)
  const pattern = [40, 0, 70, 30, 90, 60]
  const activity: Record<string, number> = {}
  pattern.forEach((xp, i) => {
    if (xp) activity[addDays(start, i)] = xp
  })
  return {
    completedLessons: ['en-1', 'en-2', 'es-1', 'de-1'],
    xp: 290,
    activity,
    bookmarks: ['es-4', 'zh-1'],
  }
}
const emptyBook = {
  heard: [],
  notes: {},
  stars: {},
  review: {},
  recent: [],
  favorites: [],
  favoriteWords: [],
}

describe('POST /sync/import', () => {
  it('merges guest state with the server, drops unknown keys and reports them', async () => {
    const c = await signUp(app())
    await c
      .post('/sync', {
        deviceId: 'web-device-000001',
        ops: [
          op('phrase.heard', { key: 'spanish:hello' }),
          op('phrase.note', { key: 'spanish:hello', note: 'server note' }),
          op('review.add', { keys: ['spanish:yes'] }),
          op('review.answer', { key: 'spanish:yes', knewIt: true }),
          op('lesson.complete', { lessonId: 'en-1', value: true }),
        ],
      })
      .expect(200)
    const y = addDays(today(), -1)
    const r = await c
      .post('/sync/import', {
        deviceId: c.deviceId,
        timezone: 'UTC',
        progress: {
          completedLessons: ['es-2', 'zz-9'],
          xp: 40,
          activity: { [y]: 40, 'not-a-day': 3 },
          bookmarks: ['en-3'],
        },
        phrasebook: {
          heard: ['spanish:goodbye', 'spanish:hello', 'klingon:hi'],
          notes: { 'spanish:hello': 'local note', 'spanish:goodbye': 'bye note' },
          stars: { 'spanish:first-words:1': 2, 'japanese:taxi:1': 3 },
          review: { 'spanish:yes': { box: 0, due: today() }, 'spanish:no': { box: 2, due: today() } },
          recent: ['japanese', 'spanish'],
          favorites: ['spanish:no'],
          favoriteWords: ['spanish:baño', 'spanish:<b>'],
          extraField: true,
        },
        preferences: { theme: 'light' },
        voices: { 'es-ES': 'com.apple.voice.Monica' },
      })
      .expect(200)
    expect(r.body.meta.dropped).toEqual({
      completedLessons: ['zz-9'],
      activity: ['not-a-day'],
      heard: ['klingon:hi'],
      stars: ['japanese:taxi:1'],
      favoriteWords: ['spanish:<b>'],
    })
    expect(r.body.data.skippedDemoSeed).toBe(false)
    const s = (await c.get('/me/state')).body.data
    expect(s.progress.completedLessons.sort()).toEqual(['en-1', 'es-2'])
    expect(s.progress.bookmarks).toEqual(['en-3'])
    // xp = max(server 57, merged activity sum 57 + 40, local 40)
    expect(s.progress.xp).toBe(97)
    expect(s.phrasebook.heard.sort()).toEqual(['spanish:goodbye', 'spanish:hello'])
    expect(s.phrasebook.notes).toEqual({ 'spanish:hello': 'server note', 'spanish:goodbye': 'bye note' })
    expect(s.phrasebook.review['spanish:yes']).toEqual({ box: 0, due: today() }) // lower box wins
    expect(s.phrasebook.recent).toEqual(['japanese', 'spanish'])
    expect(s.preferences.theme).toBe('light')
    expect((await c.get('/me/devices/current')).body.data.voices).toEqual({
      'es-ES': 'com.apple.voice.Monica',
    })

    // idempotent per device
    const again = await c
      .post('/sync/import', { deviceId: c.deviceId, progress: {}, phrasebook: {} })
      .expect(200)
    expect(again.body.data.duplicate).toBe(true)
    // a second device must choose a strategy explicitly
    const other = await c
      .post('/sync/import', { deviceId: 'tablet-device-001', progress: {}, phrasebook: {} })
      .expect(409)
    expect(other.body.error.code).toBe('CONFLICT')
    await c
      .post('/sync/import', {
        deviceId: 'tablet-device-001',
        strategy: 'merge',
        progress: {},
        phrasebook: {},
      })
      .expect(200)
  })

  it('ignores the untouched demo seed (detected or flagged)', async () => {
    const c = await signUp(app())
    const r = await c
      .post('/sync/import', { deviceId: c.deviceId, progress: demoSeed(), phrasebook: emptyBook })
      .expect(200)
    expect(r.body.data.skippedDemoSeed).toBe(true)
    const s = (await c.get('/me/state')).body.data
    expect(s.progress).toEqual({ completedLessons: [], xp: 0, activity: {}, bookmarks: [] })

    const c2 = await signUp(app())
    const tweaked = { ...demoSeed(), xp: 292 }
    const r2 = await c2
      .post('/sync/import', {
        deviceId: c2.deviceId,
        isDemoSeed: true,
        progress: tweaked,
        phrasebook: { ...emptyBook, heard: ['english:hello'] },
      })
      .expect(200)
    expect(r2.body.data.skippedDemoSeed).toBe(true)
    expect((await c2.get('/me/state')).body.data.phrasebook.heard).toEqual(['english:hello'])

    const c3 = await signUp(app())
    const r3 = await c3
      .post('/sync/import', { deviceId: c3.deviceId, progress: tweaked, phrasebook: emptyBook })
      .expect(200)
    expect(r3.body.data.skippedDemoSeed).toBe(false)
  })

  it('replace-server overwrites the server state', async () => {
    const c = await signUp(app())
    await c.post('/me/phrases/english:hello/heard', {}).expect(200)
    await c
      .post('/sync/import', {
        deviceId: c.deviceId,
        strategy: 'replace-server',
        progress: { xp: 7, activity: {}, completedLessons: [], bookmarks: [] },
        phrasebook: { ...emptyBook, heard: ['spanish:yes'] },
      })
      .expect(200)
    const s = (await c.get('/me/state')).body.data
    expect(s.progress.xp).toBe(7)
    expect(s.phrasebook.heard).toEqual(['spanish:yes'])
  })
})
