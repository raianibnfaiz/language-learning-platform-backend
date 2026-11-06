import { describe, expect, it } from 'vitest'
import { addDays } from '../../src/core/time.js'
import { signUp, today, useTestApp } from '../helpers.js'

const { app } = useTestApp()

describe('direct learner actions', () => {
  it('awards first-listen XP once and returns header meta + no-store', async () => {
    const c = await signUp(app())
    const r1 = await c.post('/me/phrases/spanish:hello/heard', {}).expect(200)
    expect(r1.body.data).toEqual({ firstTime: true, xpAwarded: 2 })
    expect(r1.body.meta).toMatchObject({ xp: 2, level: 1, streak: 1, todayXp: 2, stateVersion: 1 })
    expect(r1.headers['cache-control']).toBe('no-store')
    const r2 = await c.post('/me/phrases/spanish:hello/heard', {}).expect(200)
    expect(r2.body.data).toEqual({ firstTime: false, xpAwarded: 0 })
    expect(r2.body.meta.xp).toBe(2)
    const unknown = await c.post('/me/phrases/spanish:nope/heard', {}).expect(422)
    expect(unknown.body.error.code).toBe('UNKNOWN_PHRASE')
    await c.post('/me/phrases/BAD/heard', {}).expect(400)
  })

  it('honours Idempotency-Key on retries', async () => {
    const c = await signUp(app())
    const key = '0195f2c3-aaaa-7bbb-8ccc-000000000001'
    await c.post('/me/practice', { correct: 3, total: 5 }).set('Idempotency-Key', key).expect(200)
    const again = await c
      .post('/me/practice', { correct: 3, total: 5 })
      .set('Idempotency-Key', key)
      .expect(200)
    expect(again.body.data.duplicate).toBe(true)
    expect(again.body.meta.xp).toBe(30)
    await c.post('/me/practice', { correct: 6, total: 5 }).expect(400)
    await c.post('/me/practice', { correct: 5, total: 21 }).expect(400)
  })

  it('speak gives +5 only at score >= 0.7', async () => {
    const c = await signUp(app())
    expect((await c.post('/me/phrases/spanish:yes/speak', { score: 0.69 }).expect(200)).body.data).toEqual({
      passed: false,
      xpAwarded: 0,
    })
    expect((await c.post('/me/phrases/spanish:yes/speak', { score: 0.7 }).expect(200)).body.data).toEqual({
      passed: true,
      xpAwarded: 5,
    })
  })

  it('stores notes, favourites and unicode favourite words; empty note deletes', async () => {
    const c = await signUp(app())
    await c.put('/me/phrases/japanese:thanks/note', { note: '  polite form  ' }).expect(200)
    await c.put('/me/phrases/japanese:thanks/favorite').expect(200)
    await c.put(`/me/words/japanese/${encodeURIComponent('ありがとう')}/favorite`).expect(200)
    await c.put(`/me/words/spanish/${encodeURIComponent('baño')}/favorite`).expect(200)
    let s = (await c.get('/me/state').expect(200)).body.data
    expect(s.phrasebook.notes).toEqual({ 'japanese:thanks': 'polite form' })
    expect(s.phrasebook.favorites).toEqual(['japanese:thanks'])
    expect(s.phrasebook.favoriteWords.sort()).toEqual(['japanese:ありがとう', 'spanish:baño'].sort())
    await c.put('/me/phrases/japanese:thanks/note', { note: '' }).expect(200)
    await c.del('/me/phrases/japanese:thanks/favorite').expect(200)
    await c.del(`/me/words/spanish/${encodeURIComponent('baño')}/favorite`).expect(200)
    s = (await c.get('/me/state').expect(200)).body.data
    expect(s.phrasebook.notes).toEqual({})
    expect(s.phrasebook.favorites).toEqual([])
    expect(s.phrasebook.favoriteWords).toEqual(['japanese:ありがとう'])
    await c.put(`/me/words/spanish/${encodeURIComponent('<script>')}/favorite`).expect(400)
  })

  it('enforces the test unlock rule, stars, combos and phrase counts', async () => {
    const c = await signUp(app())
    const base = { langId: 'spanish', situationId: 'first-words', total: 6, missed: [], comboBonuses: 0 }
    const locked = await c.post('/me/tests', { ...base, test: 2, correct: 6 }).expect(422)
    expect(locked.body.error.code).toBe('TEST_LOCKED')
    const wrongTotal = await c.post('/me/tests', { ...base, test: 1, correct: 4, total: 5 }).expect(422)
    expect(wrongTotal.body.error.code).toBe('VALIDATION_ERROR')
    await c.post('/me/tests', { ...base, test: 1, correct: 6, total: 6, comboBonuses: 3 }).expect(422)
    await c.post('/me/tests', { ...base, test: 1, correct: 7 }).expect(422)
    // 2/6 = 0 stars: test 2 stays locked
    const t0 = await c
      .post('/me/tests', {
        ...base,
        test: 1,
        correct: 2,
        missed: ['spanish:hello', 'spanish:yes', 'spanish:no', 'spanish:please'],
      })
      .expect(200)
    expect(t0.body.data).toMatchObject({ stars: 0, bestStars: 0, xpAwarded: 10, nextTestUnlocked: false })
    // 5/6 = 2 stars, 1 combo: 5*5 + 5
    const t1 = await c
      .post('/me/tests', { ...base, test: 1, correct: 5, comboBonuses: 1, missed: ['spanish:hello'] })
      .expect(200)
    expect(t1.body.data).toMatchObject({ stars: 2, bestStars: 2, xpAwarded: 30, nextTestUnlocked: true })
    const t1b = await c.post('/me/tests', { ...base, test: 1, correct: 3 }).expect(200)
    expect(t1b.body.data).toMatchObject({ stars: 1, bestStars: 2 })
    const t2 = await c.post('/me/tests', { ...base, test: 2, correct: 6, comboBonuses: 2 }).expect(200)
    expect(t2.body.data).toMatchObject({ stars: 3, xpAwarded: 6 * 8 + 10 })
    const unavailable = await c
      .post('/me/tests', { ...base, langId: 'japanese', situationId: 'taxi', test: 1, correct: 5, total: 5 })
      .expect(422)
    expect(unavailable.body.error.code).toBe('SITUATION_UNAVAILABLE')
    await c.post('/me/tests', { ...base, test: 3, correct: 1, missed: ['english:hello'] }).expect(422)
    await c
      .post('/me/tests', { ...base, test: 3, correct: 2, answers: [{ key: 'spanish:hello', correct: true }] })
      .expect(422)

    const s = (await c.get('/me/state').expect(200)).body.data
    expect(s.phrasebook.stars).toEqual({ 'spanish:first-words:1': 2, 'spanish:first-words:2': 3 })
    expect(Object.keys(s.phrasebook.review).sort()).toEqual([
      'spanish:hello',
      'spanish:no',
      'spanish:please',
      'spanish:yes',
    ])
    expect(s.phrasebook.review['spanish:hello']).toEqual({ box: 0, due: today() })

    const p = (await c.get('/me/progress/languages/spanish').expect(200)).body.data
    const fw = p.situations.find((x: { id: string }) => x.id === 'first-words')
    expect(fw).toMatchObject({ testStars: [2, 3, 0, 0], stars: 5, maxStars: 12, unlockedTests: [1, 2, 3] })
  })

  it('moves review cards through the Leitner boxes to mastered', async () => {
    const c = await signUp(app())
    await c.post('/me/review/add', { keys: ['english:hello', 'english:yes'] }).expect(200)
    expect((await c.get('/me/review/due').expect(200)).body.data).toHaveLength(2)
    const wrong = await c.post('/me/review/english:yes/answer', { knewIt: false }).expect(200)
    expect(wrong.body.data).toMatchObject({ card: { box: 0, due: today() }, xpAwarded: 0 })
    const intervals = [1, 3, 7, 14, 30]
    for (const [i, days] of intervals.entries()) {
      const r = await c.post('/me/review/english:hello/answer', { knewIt: true }).expect(200)
      expect(r.body.data.card).toEqual({ box: i + 1, due: addDays(today(), days) })
    }
    const last = await c.post('/me/review/english:hello/answer', { knewIt: true }).expect(200)
    expect(last.body.data).toMatchObject({ card: null, mastered: true, xpAwarded: 5 })
    expect(last.body.meta.xp).toBe(30)
    const missing = await c.post('/me/review/english:hello/answer', { knewIt: true }).expect(200)
    expect(missing.body.data).toMatchObject({ ignored: 'no-card', card: null })
    const due = (await c.get('/me/review/due').expect(200)).body.data
    expect(due.map((d: { key: string }) => d.key)).toEqual(['english:yes'])
    expect(due[0].phrase.text).toBe('Yes')
  })

  it('toggles lessons (±50 only on real change), bookmarks, and never lets XP go negative', async () => {
    const c = await signUp(app())
    const off = await c.del('/me/lessons/en-1/complete', {}).expect(200)
    expect(off.body.data).toMatchObject({ completed: false, changed: false, xpAwarded: 0 })
    const on = await c.put('/me/lessons/en-1/complete', {}).expect(200)
    expect(on.body.meta.xp).toBe(50)
    await c.put('/me/lessons/en-1/complete', {}).expect(200)
    expect((await c.get('/me/summary')).body.data.xp).toBe(50)
    const unknown = await c.put('/me/lessons/zz-1/complete', {}).expect(422)
    expect(unknown.body.error.code).toBe('UNKNOWN_LESSON')
    await c.put('/me/bookmarks/es-4').expect(200)
    await c.put('/me/bookmarks/es-4').expect(200)

    // lesson done yesterday (offline), then undone today after the day's XP… total and day stay >= 0
    const c2 = await signUp(app())
    await c2.put('/me/lessons/es-1/complete', {}).expect(200)
    await c2.post('/me/practice', { correct: 0, total: 3 }).expect(200)
    const undo = await c2.del('/me/lessons/es-1/complete', {}).expect(200)
    expect(undo.body.meta).toMatchObject({ xp: 0, todayXp: 0 })
    const s = (await c.get('/me/state')).body.data
    expect(s.progress).toMatchObject({ completedLessons: ['en-1'], bookmarks: ['es-4'], xp: 50 })
  })

  it('keeps the 6 most recent languages, newest first', async () => {
    const c = await signUp(app())
    for (const l of ['spanish', 'english', 'japanese', 'spanish'])
      await c.post(`/me/languages/${l}/visit`).expect(200)
    expect((await c.get('/me/state')).body.data.phrasebook.recent).toEqual(['spanish', 'japanese', 'english'])
    await c.post('/me/languages/klingon/visit').expect(404)
  })

  it('builds summary, activity and progress rows', async () => {
    const c = await signUp(app())
    for (const k of ['spanish:hello', 'spanish:goodbye', 'japanese:yes'])
      await c.post(`/me/phrases/${k}/heard`, {}).expect(200)
    await c.post('/me/languages/spanish/visit').expect(200)
    await c.post('/me/review/add', { keys: ['spanish:hello'] }).expect(200)
    const s = (await c.get('/me/summary').expect(200)).body.data
    expect(s).toMatchObject({
      xp: 6,
      level: 1,
      into: 6,
      need: 100,
      streak: 1,
      todayXp: 6,
      dailyGoal: 50,
      dueCount: 1,
      heardCount: 3,
      recentLanguage: 'spanish',
    })
    expect(s.recentLanguages[0]).toMatchObject({ id: 'spanish', nextSituation: { id: 'first-words' } })
    expect(s.last7Days).toHaveLength(7)
    expect(s.last7Days[6]).toEqual({ day: today(), xp: 6 })
    const a = (await c.get(`/me/activity?from=${addDays(today(), -13)}`).expect(200)).body.data
    expect(a).toHaveLength(14)
    await c.get(`/me/activity?from=${today()}&to=${addDays(today(), -1)}`).expect(400)
    const rows = (await c.get('/me/progress/languages').expect(200)).body.data
    expect(rows.find((r: { langId: string }) => r.langId === 'spanish')).toMatchObject({
      heard: 2,
      total: 37,
      pct: 5,
      reviewCount: 1,
      needsPractice: true,
      maxStars: 7 * 12,
    })
    expect(rows.find((r: { langId: string }) => r.langId === 'japanese')).toMatchObject({
      heard: 1,
      total: 12,
      maxStars: 24,
    })
  })

  it('resets learner data without seeding demo data', async () => {
    const c = await signUp(app())
    await c.post('/me/phrases/spanish:hello/heard', {}).expect(200)
    await c.post('/me/reset', { confirm: 'nope' }).expect(400)
    const r = await c.post('/me/reset', { confirm: 'RESET' }).expect(200)
    expect(r.body.meta).toMatchObject({ xp: 0, streak: 0 })
    const s = (await c.get('/me/state')).body.data
    expect(s.progress).toEqual({ completedLessons: [], xp: 0, activity: {}, bookmarks: [] })
    expect(s.phrasebook.heard).toEqual([])
    // a delta from before the reset must come back as a full snapshot
    expect((await c.get('/me/state/changes?since=0')).body.data.full).toBe(true)
  })
})
