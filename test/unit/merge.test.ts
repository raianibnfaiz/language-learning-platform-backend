import { describe, expect, it } from 'vitest'
import {
  cleanLocalState,
  isDemoSeedProgress,
  mergeStates,
  type ContentLookup,
  type LocalState,
} from '../../src/modules/sync/merge.js'
import { parseEnv } from '../../src/config/env.js'

const lookup: ContentLookup = {
  hasPhrase: (k) => ['spanish:hello', 'spanish:yes', 'spanish:no'].includes(k),
  hasLesson: (id) => /^(en|es|de|zh)-[1-6]$/.test(id),
  hasLanguage: (id) => ['spanish', 'english'].includes(id),
  isAvailable: (l, s) => l === 'spanish' && s === 'first-words',
}
const empty = (): LocalState => ({
  progress: { completedLessons: [], xp: 0, activity: {}, bookmarks: [] },
  phrasebook: { heard: [], notes: {}, stars: {}, review: {}, recent: [], favorites: [], favoriteWords: [] },
})

describe('cleanLocalState', () => {
  it('keeps valid entries and reports dropped ones', () => {
    const { state, dropped } = cleanLocalState(
      {
        xp: -3,
        completedLessons: ['es-1', 'xx'],
        activity: { '2026-11-05': 10, '2026-11-99': 1, '2026-11-04': -1 },
        bookmarks: 'nope',
      },
      {
        heard: ['spanish:hello', 'spanish:hello', 7],
        notes: { 'spanish:yes': '  hi ', 'spanish:no': '' },
        stars: { 'spanish:first-words:2': 3, 'spanish:first-words:5': 1, 'spanish:first-words:1': 4 },
        review: { 'spanish:no': { box: 9, due: '2026-11-06' } },
        recent: ['english', 'nope'],
        favorites: [],
        favoriteWords: ['spanish:hola', 'nolang', 'spanish:a b'],
      },
      lookup,
      '2026-11-06',
    )
    expect(state.progress).toEqual({
      completedLessons: ['es-1'],
      xp: 0,
      activity: { '2026-11-05': 10 },
      bookmarks: [],
    })
    expect(state.phrasebook).toMatchObject({
      heard: ['spanish:hello'],
      notes: { 'spanish:yes': 'hi' },
      stars: { 'spanish:first-words:2': 3 },
      review: {},
      recent: ['english'],
      favoriteWords: ['spanish:hola'],
    })
    expect(dropped).toEqual({
      completedLessons: ['xx'],
      activity: ['2026-11-99', '2026-11-04'],
      stars: ['spanish:first-words:5', 'spanish:first-words:1'],
      review: ['spanish:no'],
      recent: ['nope'],
      favoriteWords: ['nolang', 'spanish:a b'],
    })
  })
  it('handles garbage input', () => {
    expect(cleanLocalState(null, 'x', lookup, '2026-11-06').state).toEqual(empty())
  })
})

describe('demo seed guard', () => {
  const seed = {
    xp: 290,
    completedLessons: ['en-1', 'en-2', 'es-1', 'de-1'],
    bookmarks: ['es-4', 'zh-1'],
    activity: { '2026-10-31': 40, '2026-11-02': 70, '2026-11-03': 30, '2026-11-04': 90, '2026-11-05': 60 },
  }
  it('detects the exact seed (zero day absent or present)', () => {
    expect(isDemoSeedProgress(seed)).toBe(true)
    expect(isDemoSeedProgress({ ...seed, activity: { ...seed.activity, '2026-11-01': 0 } })).toBe(true)
  })
  it('does not match touched data', () => {
    expect(isDemoSeedProgress({ ...seed, xp: 292 })).toBe(false)
    expect(isDemoSeedProgress({ ...seed, activity: { ...seed.activity, '2026-11-06': 2 } })).toBe(false)
    expect(isDemoSeedProgress({ ...seed, completedLessons: ['en-1'] })).toBe(false)
    expect(isDemoSeedProgress({ ...seed, activity: {} })).toBe(false)
    expect(isDemoSeedProgress({ ...seed, activity: { ...seed.activity, '2026-11-05': 61 } })).toBe(false)
  })
})

describe('mergeStates', () => {
  it('applies the documented merge rules', () => {
    const server = empty()
    server.progress = {
      completedLessons: ['en-1'],
      xp: 120,
      activity: { '2026-11-01': 50, '2026-11-02': 70 },
      bookmarks: ['es-1'],
    }
    Object.assign(server.phrasebook, {
      heard: ['spanish:hello'],
      notes: { 'spanish:hello': 'server', 'spanish:no': '' },
      stars: { a: 1, b: 3 },
      review: { 'spanish:yes': { box: 3, due: '2026-11-10' }, 'spanish:no': { box: 1, due: '2026-11-08' } },
      recent: ['english', 'spanish'],
      favorites: ['spanish:hello'],
      favoriteWords: ['spanish:hola'],
    })
    const local = empty()
    local.progress = {
      completedLessons: ['es-2'],
      xp: 40,
      activity: { '2026-11-02': 30, '2026-11-03': 40 },
      bookmarks: ['es-1', 'en-2'],
    }
    Object.assign(local.phrasebook, {
      heard: ['spanish:yes'],
      notes: { 'spanish:hello': 'local', 'spanish:no': 'local no' },
      stars: { a: 2, b: 1 },
      review: { 'spanish:yes': { box: 1, due: '2026-11-07' }, 'spanish:no': { box: 1, due: '2026-11-06' } },
      recent: ['japanese', 'spanish'],
      favorites: ['spanish:yes'],
      favoriteWords: ['spanish:hola'],
    })
    const m = mergeStates(server, local)
    expect(m.progress).toEqual({
      completedLessons: ['en-1', 'es-2'],
      xp: 160,
      activity: { '2026-11-01': 50, '2026-11-02': 70, '2026-11-03': 40 },
      bookmarks: ['es-1', 'en-2'],
    })
    expect(m.phrasebook).toEqual({
      heard: ['spanish:hello', 'spanish:yes'],
      notes: { 'spanish:hello': 'server', 'spanish:no': 'local no' },
      stars: { a: 2, b: 3 },
      review: { 'spanish:yes': { box: 1, due: '2026-11-07' }, 'spanish:no': { box: 1, due: '2026-11-06' } },
      recent: ['japanese', 'spanish', 'english'],
      favorites: ['spanish:hello', 'spanish:yes'],
      favoriteWords: ['spanish:hola'],
    })
  })
  it('xp is the max of server, merged activity and local', () => {
    const a = empty()
    a.progress.xp = 500
    const b = empty()
    b.progress.activity = { '2026-11-01': 10 }
    expect(mergeStates(a, b).progress.xp).toBe(500)
    expect(mergeStates(empty(), b).progress.xp).toBe(10)
  })
})

describe('env', () => {
  it('fails fast on missing or short secrets and parses lists', () => {
    expect(() => parseEnv({ MONGODB_URI: 'mongodb://x' })).toThrow(/JWT_ACCESS_SECRET/)
    expect(() => parseEnv({ MONGODB_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'short' })).toThrow(
      /at least 32 bytes/,
    )
    expect(() => parseEnv({ MONGODB_URI: 'mongodb://x', JWT_PRIVATE_KEY: 'k' })).toThrow(/JWT_PUBLIC_KEY/)
    const e = parseEnv({
      MONGODB_URI: 'mongodb://x',
      JWT_ACCESS_SECRET: 'x'.repeat(32),
      CORS_ORIGINS: 'http://a, http://b',
      COOKIE_SECURE: 'true',
      SMTP_URL: '',
    })
    expect(e.CORS_ORIGINS).toEqual(['http://a', 'http://b'])
    expect(e.COOKIE_SECURE).toBe(true)
    expect(e.SMTP_URL).toBeUndefined()
  })
})
