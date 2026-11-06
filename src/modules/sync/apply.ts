import type { ClientSession, Types } from 'mongoose'
import { AppError, type ErrorCode } from '../../core/errors.js'
import {
  GOOD_SPEAK_THRESHOLD,
  RECENT_LIMIT,
  XP,
  answerReview,
  isTestN,
  isTestUnlocked,
  maxComboBonuses,
  starsFor,
  testXp,
  type ReviewCard,
  type TestN,
} from '../../core/rules/index.js'
import { isLocalDayAcceptable } from '../../core/time.js'
import { content } from '../content/content.store.js'
import { DailyActivityModel, LearnerStateModel, type LearnerStateDoc } from '../progress/progress.model.js'
import {
  FavoriteWordModel,
  PhraseStateModel,
  TestScoreModel,
  TombstoneModel,
  type PhraseStateDoc,
} from '../phrasebook/phrasebook.model.js'
import { AuditLogModel, UserModel } from '../users/user.model.js'
import type { OpOf, SyncOp } from './ops.js'

/** A rule violation for one op: the op is rejected, the rest of the batch continues. */
export class OpRejection extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message)
  }
}
const reject = (code: ErrorCode, message: string): never => {
  throw new OpRejection(code, message)
}

export interface OpOutcome {
  xpDelta: number
  result: Record<string, unknown>
}

/**
 * Per-batch state. The batch runs in one transaction that first increments
 * `learnerStates.stateVersion`; that write makes concurrent batches of the same user conflict and retry,
 * so inside a batch reads are stable and XP can be tracked in memory and flushed once.
 */
export class BatchContext {
  xp: number
  readonly dayXp = new Map<string, { before: number; now: number }>()
  readonly state: LearnerStateDoc
  stateDirty = false
  applied = 0

  constructor(
    readonly userId: Types.ObjectId,
    readonly session: ClientSession,
    readonly version: number,
    readonly timezone: string,
    readonly maxDailyXp: number,
    state: LearnerStateDoc,
    readonly now = new Date(),
  ) {
    this.state = state
    this.xp = state.xp
  }

  async addXp(day: string, delta: number): Promise<number> {
    if (delta === 0) return 0
    const newTotal = Math.max(0, this.xp + delta)
    const applied = newTotal - this.xp
    this.xp = newTotal
    let entry = this.dayXp.get(day)
    if (!entry) {
      const doc = await DailyActivityModel.findOne(
        { userId: this.userId, day },
        { xp: 1 },
        { session: this.session },
      ).lean()
      entry = { before: doc?.xp ?? 0, now: doc?.xp ?? 0 }
      this.dayXp.set(day, entry)
    }
    entry.now = Math.max(0, entry.now + delta)
    this.stateDirty = true
    return applied
  }

  async flush(): Promise<void> {
    for (const [day, { before, now }] of this.dayXp) {
      if (before === now) continue
      await DailyActivityModel.updateOne(
        { userId: this.userId, day },
        { $set: { xp: now, version: this.version } },
        { upsert: true, session: this.session },
      )
      if (before <= this.maxDailyXp && now > this.maxDailyXp) {
        // Flag, never block (§4).
        await AuditLogModel.create(
          [
            {
              userId: this.userId,
              event: 'daily_xp_cap_exceeded',
              details: { day, xp: now, cap: this.maxDailyXp },
            },
          ],
          { session: this.session },
        )
      }
    }
    const s = this.state
    await LearnerStateModel.updateOne(
      { userId: this.userId },
      {
        $set: {
          xp: this.xp,
          completedLessons: s.completedLessons,
          bookmarks: s.bookmarks,
          recent: s.recent,
          recentVisits: s.recentVisits,
          lessonChangedAt: s.lessonChangedAt,
          bookmarkChangedAt: s.bookmarkChangedAt,
        },
      },
      { session: this.session },
    )
  }
}

// ---------- helpers ----------

type PhraseStateRecord = Omit<PhraseStateDoc, 'userId' | 'version'>

function requirePhrase(key: string) {
  const p = content().phrasesByKey.get(key)
  if (!p) reject('UNKNOWN_PHRASE', `Unknown phrase ${key}`)
  return p!
}

function requireLesson(lessonId: string) {
  if (!content().lessonsById.has(lessonId)) reject('UNKNOWN_LESSON', `Unknown lesson ${lessonId}`)
}

function requireLanguage(langId: string) {
  if (!content().languagesById.has(langId)) reject('NOT_FOUND', `Unknown language ${langId}`)
}

async function loadPhraseState(ctx: BatchContext, key: string): Promise<PhraseStateRecord> {
  const doc = await PhraseStateModel.findOne({ userId: ctx.userId, key }, null, {
    session: ctx.session,
  }).lean()
  if (doc) {
    const { userId: _u, version: _v, ...rest } = doc as PhraseStateDoc & { _id?: unknown }
    delete (rest as Record<string, unknown>)._id
    delete (rest as Record<string, unknown>).createdAt
    delete (rest as Record<string, unknown>).updatedAt
    return rest
  }
  const langId = key.split(':')[0] ?? ''
  const tomb = await TombstoneModel.findOne(
    { userId: ctx.userId, kind: 'phrase', key },
    { changedAt: 1 },
    { session: ctx.session },
  ).lean()
  // A removed state keeps its last-change time so an older offline edit cannot resurrect it.
  return tomb
    ? {
        key,
        langId,
        favorite: false,
        favoriteUpdatedAt: tomb.changedAt,
        noteUpdatedAt: tomb.changedAt,
        reviewUpdatedAt: tomb.changedAt,
      }
    : { key, langId, favorite: false }
}

function isEmptyState(s: PhraseStateRecord): boolean {
  return !s.heardAt && !s.favorite && !s.note && !s.review
}

function maxDate(...dates: (Date | undefined)[]): Date {
  return new Date(Math.max(0, ...dates.filter((d): d is Date => !!d).map((d) => d.getTime())))
}

async function savePhraseState(ctx: BatchContext, s: PhraseStateRecord): Promise<void> {
  const filter = { userId: ctx.userId, key: s.key }
  if (isEmptyState(s)) {
    // §3.6: delete the doc when nothing is left; a tombstone keeps delta sync + LWW correct.
    await PhraseStateModel.deleteOne(filter, { session: ctx.session })
    await TombstoneModel.updateOne(
      { userId: ctx.userId, kind: 'phrase', key: s.key },
      {
        $set: {
          changedAt: maxDate(s.favoriteUpdatedAt, s.noteUpdatedAt, s.reviewUpdatedAt),
          version: ctx.version,
        },
      },
      { upsert: true, session: ctx.session },
    )
    return
  }
  const $set: Record<string, unknown> = { langId: s.langId, favorite: s.favorite, version: ctx.version }
  const $unset: Record<string, ''> = {}
  for (const f of [
    'heardAt',
    'favoriteUpdatedAt',
    'note',
    'noteUpdatedAt',
    'review',
    'reviewUpdatedAt',
  ] as const) {
    if (s[f] !== undefined && s[f] !== '') $set[f] = s[f]
    else $unset[f] = ''
  }
  await PhraseStateModel.updateOne(
    filter,
    { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
    {
      upsert: true,
      session: ctx.session,
    },
  )
  await TombstoneModel.deleteOne({ userId: ctx.userId, kind: 'phrase', key: s.key }, { session: ctx.session })
}

/** Last-writer-wins: true when `at` is strictly newer than the stored change time. */
const newer = (at: Date, stored: Date | undefined) => !stored || at.getTime() > new Date(stored).getTime()

function occurred(op: SyncOp, now: Date): Date {
  const t = new Date(op.occurredAt)
  // Never let a client clock in the future pin a last-writer-wins value.
  return t.getTime() > now.getTime() ? now : t
}

function mergeRecent(visits: { langId: string; at: Date }[], add: { langId: string; at: Date }) {
  const byLang = new Map<string, Date>()
  for (const v of [...visits, add]) {
    const prev = byLang.get(v.langId)
    if (!prev || new Date(v.at) > prev) byLang.set(v.langId, new Date(v.at))
  }
  return [...byLang.entries()]
    .map(([langId, at]) => ({ langId, at }))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, RECENT_LIMIT)
}

// ---------- op handlers ----------

type Handler<T extends SyncOp['type']> = (ctx: BatchContext, op: OpOf<T>, at: Date) => Promise<OpOutcome>

const handlers: { [T in SyncOp['type']]: Handler<T> } = {
  async 'phrase.heard'(ctx, op, at) {
    requirePhrase(op.payload.key)
    const s = await loadPhraseState(ctx, op.payload.key)
    if (s.heardAt) return { xpDelta: 0, result: { firstTime: false, xpAwarded: 0 } }
    s.heardAt = at
    await savePhraseState(ctx, s)
    const xp = await ctx.addXp(op.localDay, XP.FIRST_LISTEN)
    return { xpDelta: xp, result: { firstTime: true, xpAwarded: xp } }
  },

  async 'phrase.speak'(ctx, op) {
    requirePhrase(op.payload.key)
    const passed = op.payload.score >= GOOD_SPEAK_THRESHOLD
    const xp = passed ? await ctx.addXp(op.localDay, XP.GOOD_SPEAK) : 0
    return { xpDelta: xp, result: { passed, xpAwarded: xp } }
  },

  async 'phrase.note'(ctx, op, at) {
    requirePhrase(op.payload.key)
    const s = await loadPhraseState(ctx, op.payload.key)
    if (!newer(at, s.noteUpdatedAt)) return { xpDelta: 0, result: { ignored: 'stale', note: s.note ?? '' } }
    if (op.payload.note) s.note = op.payload.note
    else delete s.note
    s.noteUpdatedAt = at
    await savePhraseState(ctx, s)
    return { xpDelta: 0, result: { note: s.note ?? '' } }
  },

  async 'phrase.favorite'(ctx, op, at) {
    requirePhrase(op.payload.key)
    const s = await loadPhraseState(ctx, op.payload.key)
    if (!newer(at, s.favoriteUpdatedAt))
      return { xpDelta: 0, result: { ignored: 'stale', favorite: s.favorite } }
    s.favorite = op.payload.value
    s.favoriteUpdatedAt = at
    await savePhraseState(ctx, s)
    return { xpDelta: 0, result: { favorite: s.favorite } }
  },

  async 'word.favorite'(ctx, op, at) {
    const { langId, word, value } = op.payload
    requireLanguage(langId)
    const key = `${langId}:${word}`
    const filter = { userId: ctx.userId, langId, word }
    const [doc, tomb] = await Promise.all([
      FavoriteWordModel.findOne(filter, { changedAt: 1 }, { session: ctx.session }).lean(),
      TombstoneModel.findOne(
        { userId: ctx.userId, kind: 'word', key },
        { changedAt: 1 },
        { session: ctx.session },
      ).lean(),
    ])
    if (!newer(at, doc?.changedAt ?? tomb?.changedAt))
      return { xpDelta: 0, result: { ignored: 'stale', favorite: !!doc } }
    if (value) {
      await FavoriteWordModel.updateOne(
        filter,
        { $set: { changedAt: at, version: ctx.version } },
        { upsert: true, session: ctx.session },
      )
      await TombstoneModel.deleteOne({ userId: ctx.userId, kind: 'word', key }, { session: ctx.session })
    } else {
      await FavoriteWordModel.deleteOne(filter, { session: ctx.session })
      await TombstoneModel.updateOne(
        { userId: ctx.userId, kind: 'word', key },
        { $set: { changedAt: at, version: ctx.version } },
        { upsert: true, session: ctx.session },
      )
    }
    return { xpDelta: 0, result: { favorite: value } }
  },

  async 'test.recorded'(ctx, op, at) {
    const p = op.payload
    const c = content()
    if (!c.languagesById.has(p.langId)) reject('NOT_FOUND', `Unknown language ${p.langId}`)
    if (!c.situationsById.has(p.situationId)) reject('NOT_FOUND', `Unknown situation ${p.situationId}`)
    if (!c.isAvailable(p.langId, p.situationId))
      reject('SITUATION_UNAVAILABLE', 'Situation not available for this language')
    if (!isTestN(p.test)) reject('VALIDATION_ERROR', 'test must be 1–4')
    const phrases = c.phrasesFor(p.langId, p.situationId)
    if (p.total !== phrases.length)
      reject('VALIDATION_ERROR', `total must equal the situation's ${phrases.length} phrases`)
    if (p.correct > p.total) reject('VALIDATION_ERROR', 'correct cannot exceed total')
    if (p.comboBonuses > maxComboBonuses(p.correct)) reject('VALIDATION_ERROR', 'too many combo bonuses')
    const keysInSituation = new Set(phrases.map((x) => x.key))
    for (const k of p.missed)
      if (!keysInSituation.has(k)) reject('UNKNOWN_PHRASE', `${k} is not in this situation`)
    if (p.answers) {
      if (p.answers.length !== p.total) reject('VALIDATION_ERROR', 'answers must have one entry per question')
      if (p.answers.filter((a) => a.correct).length !== p.correct)
        reject('VALIDATION_ERROR', 'answers do not match correct')
      for (const a of p.answers)
        if (!keysInSituation.has(a.key)) reject('UNKNOWN_PHRASE', `${a.key} is not in this situation`)
    }

    const scores = await TestScoreModel.find(
      { userId: ctx.userId, langId: p.langId, situationId: p.situationId },
      { test: 1, bestStars: 1 },
      { session: ctx.session },
    ).lean()
    const best = (n: number) => scores.find((s) => s.test === n)?.bestStars ?? 0
    if (!isTestUnlocked(p.test, best)) reject('TEST_LOCKED', `Test ${p.test} is locked`)

    const stars = starsFor(p.correct, p.total)
    const bestStars = Math.max(stars, best(p.test))
    await TestScoreModel.updateOne(
      { userId: ctx.userId, langId: p.langId, situationId: p.situationId, test: p.test },
      { $max: { bestStars: stars, lastPlayedAt: at }, $inc: { attempts: 1 }, $set: { version: ctx.version } },
      { upsert: true, session: ctx.session },
    )
    // Missed phrases go to the review queue (box 0, due today) unless a newer review change exists.
    for (const key of new Set(p.missed)) {
      const s = await loadPhraseState(ctx, key)
      if (!newer(at, s.reviewUpdatedAt)) continue
      s.review = { box: 0, due: op.localDay }
      s.reviewUpdatedAt = at
      await savePhraseState(ctx, s)
    }
    const xp = await ctx.addXp(op.localDay, testXp(p.test as TestN, p.correct, p.comboBonuses))
    return {
      xpDelta: xp,
      result: { stars, bestStars, xpAwarded: xp, nextTestUnlocked: p.test < 4 && bestStars >= 1 },
    }
  },

  async 'review.add'(ctx, op, at) {
    for (const key of op.payload.keys) requirePhrase(key)
    const added: string[] = []
    for (const key of new Set(op.payload.keys)) {
      const s = await loadPhraseState(ctx, key)
      if (!newer(at, s.reviewUpdatedAt)) continue
      s.review = { box: 0, due: op.localDay }
      s.reviewUpdatedAt = at
      await savePhraseState(ctx, s)
      added.push(key)
    }
    return { xpDelta: 0, result: { added } }
  },

  async 'review.answer'(ctx, op, at) {
    requirePhrase(op.payload.key)
    const s = await loadPhraseState(ctx, op.payload.key)
    if (!s.review) return { xpDelta: 0, result: { ignored: 'no-card', card: null } }
    if (!newer(at, s.reviewUpdatedAt)) return { xpDelta: 0, result: { ignored: 'stale', card: s.review } }
    const next: ReviewCard | null = answerReview(s.review, op.payload.knewIt, op.localDay)
    if (next) s.review = next
    else delete s.review
    s.reviewUpdatedAt = at
    await savePhraseState(ctx, s)
    const xp = op.payload.knewIt ? await ctx.addXp(op.localDay, XP.REVIEW_RECALL) : 0
    return { xpDelta: xp, result: { card: next, mastered: next === null, xpAwarded: xp } }
  },

  async 'lesson.complete'(ctx, op, at) {
    const { lessonId, value } = op.payload
    requireLesson(lessonId)
    const st = ctx.state
    if (!newer(at, st.lessonChangedAt.get(lessonId))) {
      return { xpDelta: 0, result: { ignored: 'stale', completed: st.completedLessons.includes(lessonId) } }
    }
    st.lessonChangedAt.set(lessonId, at)
    ctx.stateDirty = true
    const has = st.completedLessons.includes(lessonId)
    if (has === value) return { xpDelta: 0, result: { completed: value, changed: false, xpAwarded: 0 } }
    st.completedLessons = value
      ? [...st.completedLessons, lessonId]
      : st.completedLessons.filter((l) => l !== lessonId)
    const xp = await ctx.addXp(op.localDay, value ? XP.LESSON : -XP.LESSON)
    return { xpDelta: xp, result: { completed: value, changed: true, xpAwarded: xp } }
  },

  async 'lesson.bookmark'(ctx, op, at) {
    const { lessonId, value } = op.payload
    requireLesson(lessonId)
    const st = ctx.state
    if (!newer(at, st.bookmarkChangedAt.get(lessonId)))
      return { xpDelta: 0, result: { ignored: 'stale', bookmarked: st.bookmarks.includes(lessonId) } }
    st.bookmarkChangedAt.set(lessonId, at)
    const has = st.bookmarks.includes(lessonId)
    if (has !== value)
      st.bookmarks = value ? [...st.bookmarks, lessonId] : st.bookmarks.filter((l) => l !== lessonId)
    ctx.stateDirty = true
    return { xpDelta: 0, result: { bookmarked: value } }
  },

  async 'practice.answered'(ctx, op) {
    const { correct, total } = op.payload
    if (correct > total) reject('VALIDATION_ERROR', 'correct cannot exceed total')
    const xp = await ctx.addXp(op.localDay, correct * XP.PRACTICE_CORRECT)
    return { xpDelta: xp, result: { xpAwarded: xp } }
  },

  async 'language.visit'(ctx, op, at) {
    requireLanguage(op.payload.langId)
    const st = ctx.state
    st.recentVisits = mergeRecent(st.recentVisits, { langId: op.payload.langId, at })
    st.recent = st.recentVisits.map((v) => v.langId)
    ctx.stateDirty = true
    return { xpDelta: 0, result: { recent: st.recent } }
  },

  async 'prefs.update'(ctx, op, at) {
    const user = await UserModel.findById(
      ctx.userId,
      { preferences: 1, preferencesUpdatedAt: 1 },
      { session: ctx.session },
    ).lean()
    if (!user) throw new AppError('UNAUTHENTICATED')
    if (!newer(at, user.preferencesUpdatedAt))
      return { xpDelta: 0, result: { ignored: 'stale', preferences: user.preferences } }
    const $set: Record<string, unknown> = { preferencesUpdatedAt: at }
    if (op.payload.theme !== undefined) $set['preferences.theme'] = op.payload.theme
    if (op.payload.haptics !== undefined) $set['preferences.haptics'] = op.payload.haptics
    await UserModel.updateOne({ _id: ctx.userId }, { $set }, { session: ctx.session })
    return { xpDelta: 0, result: { preferences: { ...user.preferences, ...op.payload } } }
  },
}

export async function applyOp(ctx: BatchContext, op: SyncOp): Promise<OpOutcome> {
  const at = occurred(op, ctx.now)
  if (!isLocalDayAcceptable(op.localDay, ctx.timezone, at, ctx.now))
    reject('DAY_OUT_OF_RANGE', `localDay ${op.localDay} is outside the accepted range for ${ctx.timezone}`)
  const handler = handlers[op.type] as Handler<typeof op.type>
  return handler(ctx, op as never, at)
}
