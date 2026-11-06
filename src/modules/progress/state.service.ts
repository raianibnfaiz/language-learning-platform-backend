import type { Types } from 'mongoose'
import { trusted } from '../../db/plugins.js'
import { AppError, notFound } from '../../core/errors.js'
import {
  ACTIVITY_WINDOW_DAYS,
  DAILY_GOAL_XP,
  TESTS_PER_SITUATION,
  isTestUnlocked,
  levelFor,
  streak,
} from '../../core/rules/index.js'
import { addDays, diffDays, todayIn } from '../../core/time.js'
import { content } from '../content/content.store.js'
import { learnPhraseDto } from '../content/content.service.js'
import {
  FavoriteWordModel,
  PhraseStateModel,
  TestScoreModel,
  TombstoneModel,
  type PhraseStateDoc,
} from '../phrasebook/phrasebook.model.js'
import { UserModel } from '../users/user.model.js'
import { DailyActivityModel, LearnerStateModel } from './progress.model.js'

// ---------- client shapes (identical to the web app's localStorage) ----------

export interface ProgressState {
  completedLessons: string[]
  xp: number
  activity: Record<string, number>
  bookmarks: string[]
}
export interface PhrasebookState {
  heard: string[]
  notes: Record<string, string>
  stars: Record<string, number>
  review: Record<string, { box: number; due: string }>
  recent: string[]
  favorites: string[]
  favoriteWords: string[]
}

export async function getLearnerState(userId: Types.ObjectId) {
  const s = await LearnerStateModel.findOne({ userId }).lean()
  if (s) return s
  await LearnerStateModel.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true })
  return (await LearnerStateModel.findOne({ userId }).lean())!
}

export async function activityMap(
  userId: Types.ObjectId,
  from: string,
  to?: string,
): Promise<Record<string, number>> {
  const range = to ? trusted({ $gte: from, $lte: to }) : trusted({ $gte: from })
  const docs = await DailyActivityModel.find({ userId, day: range }, { day: 1, xp: 1 })
    .sort({ day: 1 })
    .lean()
  return Object.fromEntries(docs.map((d) => [d.day, d.xp]))
}

async function activeDaySet(userId: Types.ObjectId, today: string): Promise<Set<string>> {
  const docs = await DailyActivityModel.find(
    {
      userId,
      day: trusted({ $gte: addDays(today, -ACTIVITY_WINDOW_DAYS), $lte: addDays(today, 1) }),
      xp: trusted({ $gt: 0 }),
    },
    { day: 1 },
  ).lean()
  return new Set(docs.map((d) => d.day))
}

export async function userTimezone(userId: Types.ObjectId, override?: string): Promise<string> {
  if (override) return override
  const u = await UserModel.findById(userId, { timezone: 1 }).lean()
  return u?.timezone ?? 'UTC'
}

function phrasebookFrom(
  phraseStates: PhraseStateDoc[],
  stars: Record<string, number>,
  recent: string[],
  words: string[],
): PhrasebookState {
  const heard = phraseStates
    .filter((p) => p.heardAt)
    .sort((a, b) => new Date(a.heardAt!).getTime() - new Date(b.heardAt!).getTime())
    .map((p) => p.key)
  const notes: Record<string, string> = {}
  const review: Record<string, { box: number; due: string }> = {}
  const favorites: string[] = []
  for (const p of phraseStates) {
    if (p.note) notes[p.key] = p.note
    if (p.review) review[p.key] = { box: p.review.box, due: p.review.due }
    if (p.favorite) favorites.push(p.key)
  }
  return { heard, notes, stars, review, recent, favorites, favoriteWords: words }
}

async function starsMap(userId: Types.ObjectId, filter: Record<string, unknown> = {}) {
  const scores = await TestScoreModel.find(
    { userId, ...filter },
    { langId: 1, situationId: 1, test: 1, bestStars: 1 },
  ).lean()
  return Object.fromEntries(scores.map((s) => [`${s.langId}:${s.situationId}:${s.test}`, s.bestStars]))
}

export async function preferencesOf(userId: Types.ObjectId) {
  const u = await UserModel.findById(userId, { preferences: 1 }).lean()
  if (!u) throw new AppError('UNAUTHENTICATED')
  return {
    theme: u.preferences.theme,
    haptics: u.preferences.haptics,
    dailyGoalXp: u.preferences.dailyGoalXp,
  }
}

/** GET /me/state — the full snapshot in the exact client shapes. */
export async function snapshot(userId: Types.ObjectId, tz: string) {
  const today = todayIn(tz)
  const [state, activity, phraseStates, stars, words, preferences] = await Promise.all([
    getLearnerState(userId),
    activityMap(userId, addDays(today, -ACTIVITY_WINDOW_DAYS)),
    PhraseStateModel.find({ userId }).lean(),
    starsMap(userId),
    FavoriteWordModel.find({ userId }, { langId: 1, word: 1 }).sort({ createdAt: 1 }).lean(),
    preferencesOf(userId),
  ])
  const progress: ProgressState = {
    completedLessons: state.completedLessons,
    xp: state.xp,
    activity,
    bookmarks: state.bookmarks,
  }
  return {
    progress,
    phrasebook: phrasebookFrom(
      phraseStates as PhraseStateDoc[],
      stars,
      state.recent,
      words.map((w) => `${w.langId}:${w.word}`),
    ),
    preferences,
    stateVersion: state.stateVersion,
    serverTime: new Date().toISOString(),
    today,
  }
}

/**
 * GET /me/state/changes — what changed after `since`. Scalars (xp, lessons, bookmarks, recent, prefs)
 * are always included because they are tiny; per-key collections only include changed keys.
 * A phrase entry carries the key's whole state (a removed key comes back as all-empty).
 */
export async function changes(userId: Types.ObjectId, since: number, tz: string) {
  const state = await getLearnerState(userId)
  if (since < state.deltaFloor || since > state.stateVersion)
    return { full: true as const, ...(await snapshot(userId, tz)) }
  const gt = () => trusted({ $gt: since })
  const [phrases, phraseTombs, scores, words, wordTombs, days, preferences] = await Promise.all([
    PhraseStateModel.find({ userId, version: gt() }).lean(),
    TombstoneModel.find({ userId, kind: 'phrase', version: gt() }, { key: 1 }).lean(),
    TestScoreModel.find({ userId, version: gt() }).lean(),
    FavoriteWordModel.find({ userId, version: gt() }, { langId: 1, word: 1 }).lean(),
    TombstoneModel.find({ userId, kind: 'word', version: gt() }, { key: 1 }).lean(),
    DailyActivityModel.find({ userId, version: gt() }, { day: 1, xp: 1 }).lean(),
    preferencesOf(userId),
  ])
  const phraseChanges: Record<
    string,
    { heard: boolean; favorite: boolean; note: string; review: { box: number; due: string } | null }
  > = {}
  for (const t of phraseTombs)
    phraseChanges[t.key] = { heard: false, favorite: false, note: '', review: null }
  for (const p of phrases)
    phraseChanges[p.key] = {
      heard: !!p.heardAt,
      favorite: p.favorite,
      note: p.note ?? '',
      review: p.review ? { box: p.review.box, due: p.review.due } : null,
    }
  const favoriteWords: Record<string, boolean> = {}
  for (const t of wordTombs) favoriteWords[t.key] = false
  for (const w of words) favoriteWords[`${w.langId}:${w.word}`] = true
  return {
    full: false as const,
    since,
    stateVersion: state.stateVersion,
    serverTime: new Date().toISOString(),
    today: todayIn(tz),
    progress: {
      xp: state.xp,
      completedLessons: state.completedLessons,
      bookmarks: state.bookmarks,
      activity: Object.fromEntries(days.map((d) => [d.day, d.xp])),
    },
    phrasebook: {
      recent: state.recent,
      phrases: phraseChanges,
      stars: Object.fromEntries(scores.map((s) => [`${s.langId}:${s.situationId}:${s.test}`, s.bestStars])),
      favoriteWords,
    },
    preferences,
  }
}

/** The numbers every mutating response carries in `meta` (header pill, flame, level badge). */
export async function headerMeta(userId: Types.ObjectId, tz: string) {
  const today = todayIn(tz)
  const [state, days, todayDoc] = await Promise.all([
    getLearnerState(userId),
    activeDaySet(userId, today),
    DailyActivityModel.findOne({ userId, day: today }, { xp: 1 }).lean(),
  ])
  return {
    stateVersion: state.stateVersion,
    xp: state.xp,
    level: levelFor(state.xp).level,
    streak: streak(days, today),
    todayXp: todayDoc?.xp ?? 0,
  }
}

export async function dueCount(userId: Types.ObjectId, today: string): Promise<number> {
  return PhraseStateModel.countDocuments({ userId, 'review.due': trusted({ $lte: today }) })
}

export async function derived(userId: Types.ObjectId, tz: string) {
  const meta = await headerMeta(userId, tz)
  return {
    xp: meta.xp,
    level: meta.level,
    streak: meta.streak,
    todayXp: meta.todayXp,
    dueCount: await dueCount(userId, todayIn(tz)),
  }
}

// ---------- progress read models ----------

interface LangAgg {
  heard: Set<string>
  reviewCount: number
  dueCount: number
  favorites: number
  notes: number
}

function nextSituationFor(langId: string, heard: Set<string>, stars: Record<string, number>) {
  const c = content()
  const avail = c.availableSituations(langId)
  const firstUnheard = avail.find((s) => c.phrasesFor(langId, s._id).some((p) => !heard.has(p.key)))
  const firstUnstarred =
    firstUnheard ??
    avail.find((s) => {
      let total = 0
      for (let n = 1; n <= TESTS_PER_SITUATION; n++) total += stars[`${langId}:${s._id}:${n}`] ?? 0
      return total < TESTS_PER_SITUATION * 3
    })
  return firstUnstarred
    ? { id: firstUnstarred._id, title: firstUnstarred.title, emoji: firstUnstarred.emoji }
    : null
}

async function aggregateByLanguage(userId: Types.ObjectId, today: string) {
  const states = await PhraseStateModel.find(
    { userId },
    { key: 1, langId: 1, heardAt: 1, review: 1, favorite: 1, note: 1 },
  ).lean()
  const byLang = new Map<string, LangAgg>()
  for (const s of states) {
    const agg = byLang.get(s.langId) ?? {
      heard: new Set<string>(),
      reviewCount: 0,
      dueCount: 0,
      favorites: 0,
      notes: 0,
    }
    if (s.heardAt) agg.heard.add(s.key)
    if (s.review) {
      agg.reviewCount++
      if (s.review.due <= today) agg.dueCount++
    }
    if (s.favorite) agg.favorites++
    if (s.note) agg.notes++
    byLang.set(s.langId, agg)
  }
  return byLang
}

/** GET /me/progress/languages — same rows as the web `progressRows`. */
export async function progressLanguages(userId: Types.ObjectId, tz: string) {
  const today = todayIn(tz)
  const c = content()
  const [byLang, stars, state] = await Promise.all([
    aggregateByLanguage(userId, today),
    starsMap(userId),
    getLearnerState(userId),
  ])
  const starsByLang = new Map<string, number>()
  for (const [k, v] of Object.entries(stars)) {
    const lang = k.split(':')[0]!
    starsByLang.set(lang, (starsByLang.get(lang) ?? 0) + v)
  }
  const langIds = new Set([...byLang.keys(), ...starsByLang.keys(), ...state.recent])
  return c.languages
    .filter((l) => langIds.has(l._id))
    .map((l) => {
      const agg = byLang.get(l._id)
      const heard = agg?.heard.size ?? 0
      const total = l.phraseCount
      const maxStars = l.availableSituationIds.length * TESTS_PER_SITUATION * 3
      return {
        langId: l._id,
        name: l.name,
        flag: l.flag,
        heard,
        total,
        pct: total ? Math.round((heard / total) * 100) : 0,
        stars: starsByLang.get(l._id) ?? 0,
        maxStars,
        reviewCount: agg?.reviewCount ?? 0,
        dueCount: agg?.dueCount ?? 0,
        needsPractice: (agg?.dueCount ?? 0) > 0,
        favorites: agg?.favorites ?? 0,
        notes: agg?.notes ?? 0,
      }
    })
}

/** GET /me/progress/languages/:langId — per situation detail. */
export async function progressLanguage(userId: Types.ObjectId, langId: string) {
  const c = content()
  const lang = c.languagesById.get(langId)
  if (!lang) throw notFound('Language')
  const [states, stars] = await Promise.all([
    PhraseStateModel.find({ userId, langId, heardAt: trusted({ $exists: true }) }, { key: 1 }).lean(),
    starsMap(userId, { langId }),
  ])
  const heard = new Set(states.map((s) => s.key))
  const situations = c.situations.map((s) => {
    const available = c.isAvailable(langId, s._id)
    const phrases = available ? c.phrasesFor(langId, s._id) : []
    const testStars = [1, 2, 3, 4].map((n) => stars[`${langId}:${s._id}:${n}`] ?? 0)
    return {
      id: s._id,
      title: s.title,
      emoji: s.emoji,
      available,
      heard: phrases.filter((p) => heard.has(p.key)).length,
      total: phrases.length,
      testStars,
      stars: testStars.reduce((a, b) => a + b, 0),
      maxStars: TESTS_PER_SITUATION * 3,
      unlockedTests: available
        ? [1, 2, 3, 4].filter((n) => isTestUnlocked(n, (m) => testStars[m - 1] ?? 0))
        : [],
    }
  })
  return {
    langId,
    name: lang.name,
    flag: lang.flag,
    situations,
    nextSituation: nextSituationFor(langId, heard, stars),
  }
}

/** GET /me/review/due */
export async function reviewDue(userId: Types.ObjectId, tz: string) {
  const today = todayIn(tz)
  const c = content()
  const docs = await PhraseStateModel.find(
    { userId, 'review.due': trusted({ $lte: today }) },
    { key: 1, review: 1 },
  )
    .sort({ 'review.due': 1, key: 1 })
    .lean()
  return docs.flatMap((d) => {
    const p = c.phrasesByKey.get(d.key)
    if (!p || !d.review) return []
    return [
      {
        key: d.key,
        box: d.review.box,
        due: d.review.due,
        langId: p.langId,
        situationId: p.situationId,
        phrase: learnPhraseDto(p),
      },
    ]
  })
}

/** GET /me/activity?from=&to= — zero-filled daily XP for charts. */
export async function activityRange(userId: Types.ObjectId, from: string, to: string) {
  if (to < from) throw new AppError('VALIDATION_ERROR', '`to` must not be before `from`')
  if (diffDays(to, from) > ACTIVITY_WINDOW_DAYS)
    throw new AppError('VALIDATION_ERROR', `range is limited to ${ACTIVITY_WINDOW_DAYS} days`)
  const map = await activityMap(userId, from, to)
  const out: { day: string; xp: number }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, xp: map[d] ?? 0 })
  return out
}

/** GET /me/summary — dashboard numbers (also exactly what Pip personalises with). */
export async function summary(userId: Types.ObjectId, tz: string) {
  const today = todayIn(tz)
  const c = content()
  const [meta, state, heardDocs, due, last7, stars] = await Promise.all([
    headerMeta(userId, tz),
    getLearnerState(userId),
    PhraseStateModel.find({ userId, heardAt: trusted({ $exists: true }) }, { key: 1 }).lean(),
    dueCount(userId, today),
    activityRange(userId, addDays(today, -6), today),
    starsMap(userId),
  ])
  const heard = new Set(heardDocs.map((d) => d.key))
  const lvl = levelFor(state.xp)
  return {
    xp: state.xp,
    level: lvl.level,
    into: lvl.into,
    need: lvl.need,
    streak: meta.streak,
    todayXp: meta.todayXp,
    dailyGoal: DAILY_GOAL_XP,
    dueCount: due,
    heardCount: heard.size,
    recentLanguages: state.recent.flatMap((id) => {
      const l = c.languagesById.get(id)
      return l ? [{ id, name: l.name, flag: l.flag, nextSituation: nextSituationFor(id, heard, stars) }] : []
    }),
    recentLanguage: state.recent[0] ?? null,
    last7Days: last7,
    stateVersion: state.stateVersion,
    today,
  }
}
