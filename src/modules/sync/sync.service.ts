import mongoose, { type ClientSession, type Types } from 'mongoose'
import { env } from '../../config/env.js'
import { AppError } from '../../core/errors.js'
import { todayIn } from '../../core/time.js'
import { trusted } from '../../db/plugins.js'
import { content } from '../content/content.store.js'
import { DailyActivityModel, LearnerStateModel, type LearnerStateDoc } from '../progress/progress.model.js'
import {
  FavoriteWordModel,
  PhraseStateModel,
  TestScoreModel,
  TombstoneModel,
} from '../phrasebook/phrasebook.model.js'
import { activityMap, getLearnerState, snapshot } from '../progress/state.service.js'
import { DeviceModel, UserModel } from '../users/user.model.js'
import { BatchContext, OpRejection, applyOp } from './apply.js'
import {
  cleanLocalState,
  emptyProgress,
  isDemoSeedProgress,
  mergeStates,
  type ContentLookup,
  type LocalState,
} from './merge.js'
import { OpSchema, type OpResult, type SyncOp } from './ops.js'
import { ImportRecordModel, SyncOpModel } from './sync.model.js'

export interface BatchInput {
  deviceId: string
  timezone: string
  ops: unknown[]
}

function toStateDoc(lean: Record<string, unknown>): LearnerStateDoc {
  const s = lean as unknown as LearnerStateDoc
  const toMap = (v: unknown) =>
    v instanceof Map ? (v as Map<string, Date>) : new Map(Object.entries((v as Record<string, Date>) ?? {}))
  return {
    ...s,
    completedLessons: s.completedLessons ?? [],
    bookmarks: s.bookmarks ?? [],
    recent: s.recent ?? [],
    recentVisits: s.recentVisits ?? [],
    lessonChangedAt: toMap(s.lessonChangedAt),
    bookmarkChangedAt: toMap(s.bookmarkChangedAt),
  }
}

/** Increments stateVersion inside the transaction; this write serialises concurrent batches per user. */
async function lockState(userId: Types.ObjectId, session: ClientSession) {
  const doc = await LearnerStateModel.findOneAndUpdate(
    { userId },
    { $inc: { stateVersion: 1 } },
    { new: true, upsert: true, session, lean: true, setDefaultsOnInsert: true },
  )
  return toStateDoc(doc as unknown as Record<string, unknown>)
}

async function withTx<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession()
  try {
    let out: T | undefined
    await session.withTransaction(async () => {
      out = await fn(session)
    })
    return out as T
  } finally {
    await session.endSession()
  }
}

type Parsed = { ok: true; op: SyncOp } | { ok: false; result: OpResult }

function parseOps(raw: unknown[]): Parsed[] {
  return raw.map((r) => {
    const parsed = OpSchema.safeParse(r)
    if (parsed.success) return { ok: true, op: parsed.data }
    const opId = typeof (r as { opId?: unknown })?.opId === 'string' ? (r as { opId: string }).opId : null
    return {
      ok: false,
      result: {
        opId,
        status: 'rejected',
        reason: 'VALIDATION_ERROR',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        xpDelta: 0,
      },
    }
  })
}

/**
 * Applies a batch of ops atomically (one transaction, one stateVersion bump).
 * Idempotent per (userId, opId); rejected ops never block the rest.
 */
export async function applyBatch(
  userId: Types.ObjectId,
  input: BatchInput,
): Promise<{ results: OpResult[]; stateVersion: number }> {
  const parsed = parseOps(input.ops)
  for (let attempt = 0; ; attempt++) {
    try {
      return await withTx((session) => runBatch(userId, input, parsed, session))
    } catch (err) {
      // Two requests raced with the same opId: the loser retries and sees it as a duplicate.
      if ((err as { code?: number }).code === 11000 && attempt < 2) continue
      throw err
    }
  }
}

async function runBatch(userId: Types.ObjectId, input: BatchInput, parsed: Parsed[], session: ClientSession) {
  const state = await lockState(userId, session)
  const ctx = new BatchContext(userId, session, state.stateVersion, input.timezone, env.MAX_DAILY_XP, state)
  const opIds = parsed.flatMap((p) => (p.ok ? [p.op.opId] : []))
  const existing = new Map(
    (await SyncOpModel.find({ userId, opId: trusted({ $in: opIds }) }, null, { session }).lean()).map((o) => [
      o.opId,
      o,
    ]),
  )
  const seen = new Map<string, OpResult>()
  const results: OpResult[] = []
  const records: Record<string, unknown>[] = []

  for (const p of parsed) {
    if (!p.ok) {
      results.push(p.result)
      continue
    }
    const op = p.op
    const prior = existing.get(op.opId)
    if (prior) {
      results.push({
        opId: op.opId,
        status: 'duplicate',
        xpDelta: prior.xpDelta,
        ...(prior.reason ? { reason: prior.reason } : {}),
        ...(prior.result !== undefined ? { result: prior.result } : {}),
      })
      continue
    }
    const same = seen.get(op.opId)
    if (same) {
      results.push({ ...same, status: 'duplicate' })
      continue
    }
    let result: OpResult
    try {
      const outcome = await applyOp(ctx, op)
      ctx.applied++
      result = { opId: op.opId, status: 'applied', xpDelta: outcome.xpDelta, result: outcome.result }
    } catch (err) {
      if (!(err instanceof OpRejection)) throw err
      result = { opId: op.opId, status: 'rejected', reason: err.code, message: err.message, xpDelta: 0 }
    }
    seen.set(op.opId, result)
    results.push(result)
    records.push({
      userId,
      opId: op.opId,
      deviceId: input.deviceId,
      type: op.type,
      payload: op.type === 'phrase.note' ? { key: op.payload.key } : op.payload, // notes are personal: not kept in the ledger
      occurredAt: new Date(op.occurredAt),
      localDay: op.localDay,
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
      xpDelta: result.xpDelta,
      result: result.result,
    })
  }

  if (records.length) await SyncOpModel.insertMany(records, { session })
  let stateVersion = ctx.version
  if (ctx.applied > 0) {
    if (ctx.stateDirty) await ctx.flush()
  } else {
    // nothing changed: give the version bump back
    await LearnerStateModel.updateOne({ userId }, { $inc: { stateVersion: -1 } }, { session })
    stateVersion -= 1
  }
  await DeviceModel.updateOne(
    { userId, deviceId: input.deviceId },
    { $set: { lastSyncAt: new Date() } },
    { session },
  )
  return { results, stateVersion }
}

/** Runs one op as a single-op batch (used by the direct action endpoints). Throws on rejection. */
export async function applySingle(
  userId: Types.ObjectId,
  deviceId: string,
  timezone: string,
  op: Omit<SyncOp, 'opId' | 'occurredAt' | 'localDay'> & { opId?: string; localDay?: string },
) {
  const full = {
    ...op,
    opId: op.opId ?? crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    localDay: op.localDay ?? todayIn(timezone),
  }
  const { results } = await applyBatch(userId, { deviceId, timezone, ops: [full] })
  const r = results[0]!
  if (r.status === 'rejected') {
    const code = (r.reason ?? 'VALIDATION_ERROR') as ConstructorParameters<typeof AppError>[0]
    throw new AppError(
      code,
      r.message ?? 'Operation rejected',
      code === 'VALIDATION_ERROR' ? { status: 422 } : {},
    )
  }
  return r
}

// ---------- import / reset ----------

export const contentLookup = (): ContentLookup => {
  const c = content()
  return {
    hasPhrase: (k) => c.phrasesByKey.has(k),
    hasLesson: (id) => c.lessonsById.has(id),
    hasLanguage: (id) => c.languagesById.has(id),
    isAvailable: (l, s) => c.isAvailable(l, s),
  }
}

async function wipeLearnerData(userId: Types.ObjectId, session: ClientSession) {
  await Promise.all([
    PhraseStateModel.deleteMany({ userId }, { session }),
    TestScoreModel.deleteMany({ userId }, { session }),
    FavoriteWordModel.deleteMany({ userId }, { session }),
    DailyActivityModel.deleteMany({ userId }, { session }),
    TombstoneModel.deleteMany({ userId }, { session }),
  ])
}

/** Writes a complete state (client shapes) and moves the delta floor so other devices reload fully. */
async function writeFullState(
  userId: Types.ObjectId,
  version: number,
  s: LocalState,
  session: ClientSession,
  now: Date,
) {
  await wipeLearnerData(userId, session)
  const pb = s.phrasebook
  const keys = new Set([...pb.heard, ...pb.favorites, ...Object.keys(pb.notes), ...Object.keys(pb.review)])
  const heard = new Set(pb.heard)
  const fav = new Set(pb.favorites)
  const phraseDocs = [...keys].map((key) => ({
    userId,
    key,
    langId: key.split(':')[0],
    ...(heard.has(key) ? { heardAt: now } : {}),
    favorite: fav.has(key),
    favoriteUpdatedAt: now,
    ...(pb.notes[key] ? { note: pb.notes[key] } : {}),
    noteUpdatedAt: now,
    ...(pb.review[key] ? { review: pb.review[key] } : {}),
    reviewUpdatedAt: now,
    version,
  }))
  if (phraseDocs.length) await PhraseStateModel.insertMany(phraseDocs, { session })
  const scoreDocs = Object.entries(pb.stars).map(([k, stars]) => {
    const [langId, situationId, n] = k.split(':')
    return {
      userId,
      langId,
      situationId,
      test: Number(n),
      bestStars: stars,
      attempts: 0,
      lastPlayedAt: now,
      version,
    }
  })
  if (scoreDocs.length) await TestScoreModel.insertMany(scoreDocs, { session })
  const wordDocs = pb.favoriteWords.map((k) => {
    const i = k.indexOf(':')
    return { userId, langId: k.slice(0, i), word: k.slice(i + 1).normalize('NFC'), changedAt: now, version }
  })
  if (wordDocs.length) await FavoriteWordModel.insertMany(wordDocs, { session })
  const dayDocs = Object.entries(s.progress.activity).map(([day, xp]) => ({ userId, day, xp, version }))
  if (dayDocs.length) await DailyActivityModel.insertMany(dayDocs, { session })
  await LearnerStateModel.updateOne(
    { userId },
    {
      $set: {
        xp: s.progress.xp,
        completedLessons: s.progress.completedLessons,
        bookmarks: s.progress.bookmarks,
        recent: pb.recent,
        // keep the order: newest first
        recentVisits: pb.recent.map((langId, i) => ({ langId, at: new Date(now.getTime() - i) })),
        lessonChangedAt: Object.fromEntries(s.progress.completedLessons.map((l) => [l, now])),
        bookmarkChangedAt: Object.fromEntries(s.progress.bookmarks.map((l) => [l, now])),
        deltaFloor: version,
      },
    },
    { session },
  )
}

export interface ImportInput {
  deviceId: string
  timezone?: string | undefined
  strategy?: 'merge' | 'replace-server' | undefined
  isDemoSeed?: boolean | undefined
  progress?: unknown
  phrasebook?: unknown
  preferences?: { theme?: 'system' | 'light' | 'dark' | undefined; haptics?: boolean | undefined } | undefined
  voices?: Record<string, string> | undefined
  client: 'web' | 'ios' | 'android'
}

export async function importState(userId: Types.ObjectId, input: ImportInput) {
  const prior = await ImportRecordModel.findOne({ userId, deviceId: input.deviceId }).lean()
  if (prior) return { ...(prior.result as Record<string, unknown>), duplicate: true }
  const user = await UserModel.findById(userId, { importedAt: 1, timezone: 1 }).lean()
  if (!user) throw new AppError('UNAUTHENTICATED')
  if (user.importedAt && !input.strategy)
    throw new AppError(
      'CONFLICT',
      'This account already imported local data; pass `strategy` explicitly to import again',
    )
  const strategy = input.strategy ?? 'merge'
  const tz = input.timezone ?? user.timezone
  const today = todayIn(tz)
  const { state: local, dropped } = cleanLocalState(input.progress, input.phrasebook, contentLookup(), today)

  // detect the seed on the raw shape (its lesson ids must not be filtered out first)
  const permissive: ContentLookup = {
    hasPhrase: () => true,
    hasLesson: () => true,
    hasLanguage: () => true,
    isAvailable: () => true,
  }
  const raw = cleanLocalState(input.progress, undefined, permissive, today).state
  const demo = input.isDemoSeed === true || isDemoSeedProgress(raw.progress)
  if (demo) local.progress = emptyProgress() // never import the untouched demo seed

  return withTx(async (session) => {
    const now = new Date()
    const locked = await lockState(userId, session)
    const version = locked.stateVersion
    let merged: LocalState
    if (strategy === 'replace-server') {
      merged = local
    } else {
      const server = await snapshot(userId, tz)
      const allActivity = await activityMap(userId, '0000-01-01')
      merged = mergeStates(
        { progress: { ...server.progress, activity: allActivity }, phrasebook: server.phrasebook },
        local,
      )
    }
    await writeFullState(userId, version, merged, session, now)

    const userSet: Record<string, unknown> = { importedAt: now, timezone: tz }
    if (input.preferences?.theme !== undefined) userSet['preferences.theme'] = input.preferences.theme
    if (input.preferences?.haptics !== undefined) userSet['preferences.haptics'] = input.preferences.haptics
    if (input.preferences && Object.keys(input.preferences).length) userSet.preferencesUpdatedAt = now
    await UserModel.updateOne({ _id: userId }, { $set: userSet }, { session })
    if (input.voices) {
      await DeviceModel.updateOne(
        { userId, deviceId: input.deviceId },
        { $set: { voices: input.voices, client: input.client } },
        { upsert: true, session },
      )
    }
    const result = {
      strategy,
      skippedDemoSeed: demo,
      stateVersion: version,
      dropped,
      counts: {
        heard: merged.phrasebook.heard.length,
        stars: Object.keys(merged.phrasebook.stars).length,
        review: Object.keys(merged.phrasebook.review).length,
        completedLessons: merged.progress.completedLessons.length,
        xp: merged.progress.xp,
      },
    }
    await ImportRecordModel.create([{ userId, deviceId: input.deviceId, strategy, result }], { session })
    return result
  })
}

/** POST /me/reset — wipes learner data (never seeds demo data on the server). */
export async function resetState(userId: Types.ObjectId) {
  return withTx(async (session) => {
    const locked = await lockState(userId, session)
    await wipeLearnerData(userId, session)
    await LearnerStateModel.updateOne(
      { userId },
      {
        $set: {
          xp: 0,
          completedLessons: [],
          bookmarks: [],
          recent: [],
          recentVisits: [],
          lessonChangedAt: {},
          bookmarkChangedAt: {},
          deltaFloor: locked.stateVersion,
        },
      },
      { session },
    )
    return { stateVersion: locked.stateVersion }
  })
}

export { getLearnerState }
