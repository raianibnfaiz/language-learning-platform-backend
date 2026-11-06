import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { BASE, useTestApp } from '../helpers.js'

const { app } = useTestApp()

describe('content', () => {
  it('serves health and readiness', async () => {
    await request(app()).get(`${BASE}/health`).expect(200)
    const r = await request(app()).get(`${BASE}/ready`).expect(200)
    expect(r.body.data.status).toBe('ready')
  })

  it('lists languages featured-first then by name, with filters', async () => {
    const r = await request(app()).get(`${BASE}/languages`).expect(200)
    expect(r.body.data.map((l: { id: string }) => l.id)).toEqual(['english', 'spanish', 'japanese'])
    const q = await request(app()).get(`${BASE}/languages?q=espanol`).expect(200)
    expect(q.body.data.map((l: { id: string }) => l.id)).toEqual(['spanish'])
    const f = await request(app()).get(`${BASE}/languages?featured=false`).expect(200)
    expect(f.body.data).toHaveLength(1)
    await request(app()).get(`${BASE}/languages?region=Mars`).expect(400)
  })

  it('returns ETags, 304s and public caching', async () => {
    const r = await request(app()).get(`${BASE}/situations`).expect(200)
    expect(r.headers['cache-control']).toBe('public, max-age=300, stale-while-revalidate=86400')
    const etag = r.headers.etag as string
    expect(etag).toMatch(/^"c1-/)
    await request(app()).get(`${BASE}/situations`).set('If-None-Match', etag).expect(304)
    expect(r.headers['x-request-id']).toBeTruthy()
  })

  it('shows situations with availability and phrases with word pieces', async () => {
    const ja = await request(app()).get(`${BASE}/languages/japanese`).expect(200)
    const sits = ja.body.data.situations as { id: string; available: boolean; phraseCount: number }[]
    expect(sits.filter((s) => s.available).map((s) => s.id)).toEqual(['first-words', 'getting-by'])
    const p = await request(app())
      .get(`${BASE}/languages/japanese/situations/first-words/phrases`)
      .expect(200)
    expect(p.body.data[0]).toMatchObject({
      id: 'hello',
      text: 'こんにちは',
      romanization: 'konnichiwa',
      meaning: 'Hello',
      picture: '👋',
    })
    const es = await request(app()).get(`${BASE}/languages/spanish/situations/getting-by/phrases`).expect(200)
    expect(es.body.data[3].wordPieces).toEqual(['Dónde', 'está', 'el', 'baño'])
    const na = await request(app()).get(`${BASE}/languages/japanese/situations/taxi/phrases`).expect(404)
    expect(na.body.error.code).toBe('SITUATION_UNAVAILABLE')
    await request(app()).get(`${BASE}/languages/klingon`).expect(404)
  })

  it('computes stats, tests, career languages, search and bundle', async () => {
    const s = await request(app()).get(`${BASE}/content/stats`).expect(200)
    expect(s.body.data).toEqual({ languages: 3, phrases: 86, situations: 2 * 7 + 2, topics: 7 })
    const t = await request(app()).get(`${BASE}/tests`).expect(200)
    expect(t.body.data.map((x: { xp: number }) => x.xp)).toEqual([5, 8, 12, 15])
    const c = await request(app()).get(`${BASE}/career-languages`).expect(200)
    expect(c.body.data[0]).toMatchObject({ id: 'english', rank: 1, overallScore: 95 })
    const d = await request(app()).get(`${BASE}/career-languages/spanish`).expect(200)
    expect(d.body.data.lessons).toHaveLength(6)
    const q = await request(app()).get(`${BASE}/search?q=ADIOS`).expect(200)
    expect(q.body.data.phrases[0].key).toBe('spanish:goodbye')
    const ql = await request(app()).get(`${BASE}/search?q=negotiation`).expect(200)
    expect(ql.body.data.lessons[0].id).toBe('en-5')
    const v = await request(app()).get(`${BASE}/content/version`).expect(200)
    const b = await request(app()).get(`${BASE}/content/bundle`).expect(200)
    expect(Object.keys(b.body.data.phrases.japanese)).toEqual(['first-words', 'getting-by'])
    const same = await request(app()).get(`${BASE}/content/bundle?since=${v.body.data.version}`).expect(200)
    expect(same.body.data.unchanged).toBe(true)
  })

  it('returns the error envelope for unknown routes', async () => {
    const r = await request(app()).get(`${BASE}/nope`).expect(404)
    expect(r.body.error).toMatchObject({ code: 'NOT_FOUND' })
    expect(r.body.error.requestId).toBeTruthy()
  })
})
