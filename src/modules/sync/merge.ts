/**
 * Pure functions for the guest → account import (§6.5 POST /sync/import). No I/O, fully unit-tested.
 */
import { RECENT_LIMIT } from '../../core/rules/constants.js'
import { graphemeLength } from '../../core/text.js'
import { addDays, isValidDay } from '../../core/time.js'
import type { PhrasebookState, ProgressState } from '../progress/state.service.js'

export interface ContentLookup {
  hasPhrase(key: string): boolean
  hasLesson(id: string): boolean
  hasLanguage(id: string): boolean
  isAvailable(langId: string, situationId: string): boolean
}

export interface LocalState {
  progress: ProgressState
  phrasebook: PhrasebookState
}

export type Dropped = Record<string, string[]>

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
const WORD_RE = /^[\p{L}\p{M}\p{N}'-]+$/u

/** Validates a guest's local state leniently: unknown/invalid entries are dropped and reported, never a 400. */
export function cleanLocalState(
  rawProgress: unknown,
  rawPhrasebook: unknown,
  c: ContentLookup,
  today: string,
) {
  const dropped: Dropped = {}
  const drop = (field: string, value: string) => (dropped[field] ??= []).push(value)
  const pr = isObj(rawProgress) ? rawProgress : {}
  const pb = isObj(rawPhrasebook) ? rawPhrasebook : {}

  const lessons = (field: string, v: unknown) =>
    [...new Set(strArr(v))].filter((id) => (c.hasLesson(id) ? true : (drop(field, id), false)))

  const activity: Record<string, number> = {}
  if (isObj(pr.activity)) {
    for (const [day, xp] of Object.entries(pr.activity)) {
      if (
        isValidDay(day) &&
        day <= addDays(today, 1) &&
        typeof xp === 'number' &&
        Number.isFinite(xp) &&
        xp >= 0
      )
        activity[day] = Math.floor(xp)
      else drop('activity', day)
    }
  }
  const progress: ProgressState = {
    completedLessons: lessons('completedLessons', pr.completedLessons),
    xp: typeof pr.xp === 'number' && Number.isFinite(pr.xp) && pr.xp >= 0 ? Math.floor(pr.xp) : 0,
    activity,
    bookmarks: lessons('bookmarks', pr.bookmarks),
  }

  const phraseKeys = (field: string, v: unknown) =>
    [...new Set(strArr(v))].filter((k) => (c.hasPhrase(k) ? true : (drop(field, k), false)))

  const notes: Record<string, string> = {}
  if (isObj(pb.notes))
    for (const [k, v] of Object.entries(pb.notes)) {
      const note = typeof v === 'string' ? v.trim() : ''
      if (!note) continue // empty note = deleted
      if (c.hasPhrase(k) && graphemeLength(note) <= 1000) notes[k] = note
      else drop('notes', k)
    }

  const stars: Record<string, number> = {}
  if (isObj(pb.stars))
    for (const [k, v] of Object.entries(pb.stars)) {
      const [lang, sit, n, extra] = k.split(':')
      const test = Number(n)
      if (
        lang &&
        sit &&
        extra === undefined &&
        c.isAvailable(lang, sit) &&
        Number.isInteger(test) &&
        test >= 1 &&
        test <= 4 &&
        typeof v === 'number' &&
        Number.isInteger(v) &&
        v >= 0 &&
        v <= 3
      )
        stars[k] = v
      else drop('stars', k)
    }

  const review: Record<string, { box: number; due: string }> = {}
  if (isObj(pb.review))
    for (const [k, v] of Object.entries(pb.review)) {
      if (
        c.hasPhrase(k) &&
        isObj(v) &&
        typeof v.box === 'number' &&
        Number.isInteger(v.box) &&
        v.box >= 0 &&
        v.box <= 5 &&
        typeof v.due === 'string' &&
        isValidDay(v.due)
      )
        review[k] = { box: v.box, due: v.due }
      else drop('review', k)
    }

  const recent = [...new Set(strArr(pb.recent))]
    .filter((id) => (c.hasLanguage(id) ? true : (drop('recent', id), false)))
    .slice(0, RECENT_LIMIT)

  const favoriteWords = [...new Set(strArr(pb.favoriteWords))].filter((k) => {
    const i = k.indexOf(':')
    const lang = k.slice(0, i)
    const word = k.slice(i + 1).normalize('NFC')
    const okWord = i > 0 && c.hasLanguage(lang) && WORD_RE.test(word) && graphemeLength(word) <= 64
    if (!okWord) drop('favoriteWords', k)
    return okWord
  })

  const phrasebook: PhrasebookState = {
    heard: phraseKeys('heard', pb.heard),
    notes,
    stars,
    review,
    recent,
    favorites: phraseKeys('favorites', pb.favorites),
    favoriteWords,
  }
  return { state: { progress, phrasebook } satisfies LocalState, dropped }
}

// ---------- demo-data guard ----------

export const DEMO_SEED = {
  xp: 290,
  activityPattern: [40, 0, 70, 30, 90, 60],
  completedLessons: ['en-1', 'en-2', 'es-1', 'de-1'],
  bookmarks: ['es-4', 'zh-1'],
} as const

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && new Set(a).size === b.length && b.every((x) => a.includes(x))

/** True when the progress part is exactly the untouched demo seed the clients create on first run. */
export function isDemoSeedProgress(p: ProgressState): boolean {
  if (p.xp !== DEMO_SEED.xp) return false
  if (!sameSet(p.completedLessons, DEMO_SEED.completedLessons) || !sameSet(p.bookmarks, DEMO_SEED.bookmarks))
    return false
  const days = Object.keys(p.activity).sort()
  const first = days.find((d) => (p.activity[d] ?? 0) > 0)
  if (!first) return false
  const pattern = DEMO_SEED.activityPattern
  // every recorded day must sit on the pattern, and every non-zero pattern day must match
  for (const d of days) {
    const idx = Math.round((Date.parse(d) - Date.parse(first)) / 86_400_000)
    if (idx < 0 || idx >= pattern.length || (p.activity[d] ?? 0) !== pattern[idx]) return false
  }
  return pattern.every((xp, i) => xp === 0 || p.activity[addDays(first, i)] === xp)
}

// ---------- merge ----------

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]

/** Strategy `merge` (§6.5). */
export function mergeStates(server: LocalState, local: LocalState): LocalState {
  const activity: Record<string, number> = { ...server.progress.activity }
  for (const [d, xp] of Object.entries(local.progress.activity)) activity[d] = Math.max(activity[d] ?? 0, xp)
  const activitySum = Object.values(activity).reduce((a, b) => a + b, 0)

  const notes: Record<string, string> = { ...local.phrasebook.notes }
  for (const [k, v] of Object.entries(server.phrasebook.notes)) if (v) notes[k] = v // server's unless empty

  const stars: Record<string, number> = { ...server.phrasebook.stars }
  for (const [k, v] of Object.entries(local.phrasebook.stars)) stars[k] = Math.max(stars[k] ?? 0, v)

  const review: Record<string, { box: number; due: string }> = { ...server.phrasebook.review }
  for (const [k, card] of Object.entries(local.phrasebook.review)) {
    const s = review[k]
    // more practice wins: lower box; on a tie the earlier due date
    if (!s || card.box < s.box || (card.box === s.box && card.due < s.due)) review[k] = card
  }

  return {
    progress: {
      completedLessons: union(server.progress.completedLessons, local.progress.completedLessons),
      xp: Math.max(server.progress.xp, activitySum, local.progress.xp),
      activity,
      bookmarks: union(server.progress.bookmarks, local.progress.bookmarks),
    },
    phrasebook: {
      heard: union(server.phrasebook.heard, local.phrasebook.heard),
      notes,
      stars,
      review,
      recent: union(local.phrasebook.recent, server.phrasebook.recent).slice(0, RECENT_LIMIT),
      favorites: union(server.phrasebook.favorites, local.phrasebook.favorites),
      favoriteWords: union(server.phrasebook.favoriteWords, local.phrasebook.favoriteWords),
    },
  }
}

export function emptyProgress(): ProgressState {
  return { completedLessons: [], xp: 0, activity: {}, bookmarks: [] }
}
