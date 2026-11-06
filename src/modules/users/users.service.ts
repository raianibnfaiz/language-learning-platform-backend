import type { Types } from 'mongoose'
import { AppError } from '../../core/errors.js'
import { trusted } from '../../db/plugins.js'
import { publicUser, audit, revokeAllSessions, type RequestMeta } from '../auth/auth.service.js'
import { verifyPassword } from '../auth/passwords.js'
import { SessionModel } from '../auth/session.model.js'
import { DailyActivityModel, LearnerStateModel } from '../progress/progress.model.js'
import {
  FavoriteWordModel,
  PhraseStateModel,
  TestScoreModel,
  TombstoneModel,
} from '../phrasebook/phrasebook.model.js'
import { ImportRecordModel, SyncOpModel } from '../sync/sync.model.js'
import { TranslationUsageModel } from '../translation/translation.model.js'
import { AuditLogModel, DeviceModel, EmailTokenModel, UserModel, type Theme } from './user.model.js'

const RECENT_LOGIN_MS = 10 * 60_000
export const PURGE_AFTER_DAYS = 7

async function requireUser(userId: Types.ObjectId) {
  const u = await UserModel.findById(userId).lean()
  if (!u || u.deletedAt) throw new AppError('UNAUTHENTICATED')
  return u
}

export async function getMe(userId: Types.ObjectId) {
  return publicUser(await requireUser(userId))
}

export interface ProfilePatch {
  displayName?: string | undefined
  timezone?: string | undefined
  nativeLanguage?: string | null | undefined
  preferences?: { theme?: Theme | undefined; haptics?: boolean | undefined } | undefined
}

export async function updateMe(userId: Types.ObjectId, patch: ProfilePatch) {
  const $set: Record<string, unknown> = {}
  const $unset: Record<string, ''> = {}
  if (patch.displayName !== undefined) $set.displayName = patch.displayName
  if (patch.timezone !== undefined) $set.timezone = patch.timezone
  if (patch.nativeLanguage === null) $unset.nativeLanguage = ''
  else if (patch.nativeLanguage !== undefined) $set.nativeLanguage = patch.nativeLanguage
  if (patch.preferences?.theme !== undefined) $set['preferences.theme'] = patch.preferences.theme
  if (patch.preferences?.haptics !== undefined) $set['preferences.haptics'] = patch.preferences.haptics
  if (patch.preferences && Object.keys(patch.preferences).length) {
    $set.preferencesUpdatedAt = new Date()
    // preferences are part of learner state: bump the version so other devices pick them up
    await LearnerStateModel.updateOne({ userId }, { $inc: { stateVersion: 1 } })
  }
  if (Object.keys($set).length || Object.keys($unset).length)
    await UserModel.updateOne(
      { _id: userId },
      { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
    )
  return getMe(userId)
}

/** §5.2: password (or a recent login for passwordless accounts) → soft delete; purge after 7 days. */
export async function deleteMe(
  userId: Types.ObjectId,
  sessionId: string,
  password: string | undefined,
  meta: RequestMeta,
) {
  const user = await requireUser(userId)
  if (user.passwordHash) {
    if (!password || !(await verifyPassword(user.passwordHash, password)))
      throw new AppError('INVALID_CREDENTIALS', 'Password is incorrect')
  } else {
    const current = await SessionModel.findById(sessionId, { familyId: 1 }).lean()
    const first = current
      ? await SessionModel.findOne({ familyId: current.familyId }).sort({ createdAt: 1 }).lean()
      : null
    if (!first || Date.now() - first.createdAt.getTime() > RECENT_LOGIN_MS)
      throw new AppError('FORBIDDEN', 'Please sign in again before deleting your account')
  }
  await UserModel.updateOne(
    { _id: userId },
    { $set: { deletedAt: new Date(), status: 'disabled' }, $inc: { tokenVersion: 1 } },
  )
  await revokeAllSessions(userId, 'deleted')
  await audit('account_deletion', userId, meta)
  return { deletedAt: new Date(), purgeAfterDays: PURGE_AFTER_DAYS }
}

/** Hard delete of every learner collection (scheduled job, 7 days after soft delete). */
export async function purgeUser(userId: Types.ObjectId) {
  await Promise.all([
    LearnerStateModel.deleteMany({ userId }),
    DailyActivityModel.deleteMany({ userId }),
    PhraseStateModel.deleteMany({ userId }),
    TestScoreModel.deleteMany({ userId }),
    FavoriteWordModel.deleteMany({ userId }),
    TombstoneModel.deleteMany({ userId }),
    DeviceModel.deleteMany({ userId }),
    SessionModel.deleteMany({ userId }),
    SyncOpModel.deleteMany({ userId }),
    ImportRecordModel.deleteMany({ userId }),
    EmailTokenModel.deleteMany({ userId }),
    TranslationUsageModel.deleteMany({ userId }),
  ])
  await UserModel.deleteOne({ _id: userId })
  await audit('account_purged', userId)
}

export async function purgeDeletedAccounts(now = new Date()) {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86400_000)
  const users = await UserModel.find({ deletedAt: trusted({ $lte: cutoff }) }, { _id: 1 }).lean()
  for (const u of users) await purgeUser(u._id)
  return users.length
}

const strip = <T extends Record<string, unknown>>(docs: T[]) =>
  docs.map(({ _id, __v, userId: _u, tokenHash: _t, ...rest }) => ({ id: String(_id), ...rest }))

/** GET /me/export — every learner collection (GDPR). Notes are included: they are the learner's own. */
export async function exportData(userId: Types.ObjectId) {
  const user = await requireUser(userId)
  const [learnerState, activity, phraseStates, testScores, favoriteWords, devices, sessions, auditLogs] =
    await Promise.all([
      LearnerStateModel.findOne({ userId }).lean(),
      DailyActivityModel.find({ userId }).sort({ day: 1 }).lean(),
      PhraseStateModel.find({ userId }).lean(),
      TestScoreModel.find({ userId }).lean(),
      FavoriteWordModel.find({ userId }).lean(),
      DeviceModel.find({ userId }).lean(),
      SessionModel.find({ userId }, { tokenHash: 0 }).lean(),
      AuditLogModel.find({ userId }).sort({ createdAt: -1 }).limit(500).lean(),
    ])
  return {
    exportedAt: new Date().toISOString(),
    user: publicUser(user),
    learnerState: learnerState ? strip([learnerState as unknown as Record<string, unknown>])[0] : null,
    dailyActivity: strip(activity as unknown as Record<string, unknown>[]),
    phraseStates: strip(phraseStates as unknown as Record<string, unknown>[]),
    testScores: strip(testScores as unknown as Record<string, unknown>[]),
    favoriteWords: strip(favoriteWords as unknown as Record<string, unknown>[]),
    devices: strip(devices as unknown as Record<string, unknown>[]),
    sessions: strip(sessions as unknown as Record<string, unknown>[]),
    securityEvents: strip(auditLogs as unknown as Record<string, unknown>[]),
  }
}

function deviceDto(
  d: {
    deviceId: string
    client: string
    appVersion?: string | undefined
    voices?: unknown
    lastSyncAt?: Date | undefined
  } | null,
  deviceId: string,
) {
  if (!d) return { deviceId, client: null, appVersion: null, voices: {}, lastSyncAt: null }
  const voices =
    d.voices instanceof Map ? Object.fromEntries(d.voices) : ((d.voices as Record<string, string>) ?? {})
  return {
    deviceId: d.deviceId,
    client: d.client,
    appVersion: d.appVersion ?? null,
    voices,
    lastSyncAt: d.lastSyncAt ?? null,
  }
}

export async function getDevice(userId: Types.ObjectId, deviceId: string) {
  return deviceDto(await DeviceModel.findOne({ userId, deviceId }).lean(), deviceId)
}

export async function putDevice(
  userId: Types.ObjectId,
  deviceId: string,
  client: 'web' | 'ios' | 'android',
  body: { appVersion?: string | undefined; voices?: Record<string, string> | undefined },
) {
  const $set: Record<string, unknown> = { client }
  if (body.appVersion) $set.appVersion = body.appVersion
  if (body.voices) $set.voices = body.voices
  const d = await DeviceModel.findOneAndUpdate(
    { userId, deviceId },
    { $set },
    { upsert: true, new: true, lean: true },
  )
  return deviceDto(d, deviceId)
}
