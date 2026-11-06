import { randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import { env } from '../../config/env.js'
import { AppError } from '../../core/errors.js'
import { trusted } from '../../db/plugins.js'
import { LearnerStateModel } from '../progress/progress.model.js'
import {
  AuditLogModel,
  EmailTokenModel,
  UserModel,
  type AuditEvent,
  type UserDoc,
} from '../users/user.model.js'
import { sendEmail } from './email.service.js'
import { assertPasswordAllowed, hashPassword, verifyPassword } from './passwords.js'
import { SessionModel, type ClientKind, type RevokeReason } from './session.model.js'
import { hashToken, randomToken, safeEqualHex, signAccessToken } from './tokens.js'

export interface RequestMeta {
  client: ClientKind
  deviceId?: string | undefined
  userAgent?: string | undefined
  ip?: string | undefined
}

const LOCK_AFTER = 5
const LOCK_MINUTES = 15
const VERIFY_TTL_MS = 24 * 3600_000
const RESET_TTL_MS = 30 * 60_000

export async function audit(
  event: AuditEvent,
  userId: Types.ObjectId | undefined,
  meta?: Partial<RequestMeta>,
  details?: Record<string, unknown>,
) {
  await AuditLogModel.create({
    ...(userId ? { userId } : {}),
    event,
    ...(meta?.ip ? { ip: meta.ip } : {}),
    ...(meta?.userAgent ? { userAgent: meta.userAgent } : {}),
    ...(details ? { details } : {}),
  })
}

export function publicUser(
  u: Pick<UserDoc, '_id' | 'email' | 'displayName' | 'role' | 'timezone' | 'preferences' | 'createdAt'> &
    Partial<UserDoc>,
) {
  return {
    id: String(u._id),
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    emailVerified: !!u.emailVerifiedAt,
    timezone: u.timezone,
    nativeLanguage: u.nativeLanguage ?? null,
    preferences: {
      theme: u.preferences.theme,
      haptics: u.preferences.haptics,
      dailyGoalXp: u.preferences.dailyGoalXp,
    },
    importedAt: u.importedAt ?? null,
    createdAt: u.createdAt,
  }
}

export interface IssuedTokens {
  accessToken: string
  refreshToken: string
  refreshExpiresAt: Date
  sessionId: string
}

async function createSession(
  user: Pick<UserDoc, '_id' | 'role' | 'tokenVersion'>,
  meta: RequestMeta,
  familyId: string = randomUUID(),
): Promise<IssuedTokens> {
  const refreshToken = randomToken()
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400_000)
  const session = await SessionModel.create({
    userId: user._id,
    familyId,
    tokenHash: hashToken(refreshToken),
    client: meta.client,
    ...(meta.deviceId ? { deviceId: meta.deviceId } : {}),
    ...(meta.userAgent ? { userAgent: meta.userAgent.slice(0, 300) } : {}),
    ...(meta.ip ? { ip: meta.ip } : {}),
    expiresAt,
    lastUsedAt: new Date(),
  })
  const accessToken = signAccessToken({
    sub: String(user._id),
    role: user.role,
    tv: user.tokenVersion,
    sid: String(session._id),
  })
  return { accessToken, refreshToken, refreshExpiresAt: expiresAt, sessionId: String(session._id) }
}

async function issueEmailToken(userId: Types.ObjectId, purpose: 'verify' | 'reset'): Promise<string> {
  const token = randomToken()
  // single outstanding token per purpose
  await EmailTokenModel.deleteMany({ userId, purpose, usedAt: trusted({ $exists: false }) })
  await EmailTokenModel.create({
    userId,
    purpose,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + (purpose === 'verify' ? VERIFY_TTL_MS : RESET_TTL_MS)),
  })
  return token
}

async function sendVerification(user: Pick<UserDoc, '_id' | 'email' | 'displayName'>) {
  const token = await issueEmailToken(user._id, 'verify')
  sendEmail({
    to: user.email,
    subject: 'Confirm your LingBloomTalk email',
    text: `Hi ${user.displayName},\n\nConfirm your email: ${env.APP_WEB_URL}/verify-email?token=${token}\n\nThis link is valid for 24 hours.`,
  })
}

/** Looks a token up by hash and double-checks it in constant time. */
async function consumeEmailToken(token: string, purpose: 'verify' | 'reset') {
  const hash = hashToken(token)
  const doc = await EmailTokenModel.findOne({ tokenHash: hash, purpose })
  if (!doc || !safeEqualHex(doc.tokenHash, hash) || doc.usedAt || doc.expiresAt.getTime() < Date.now())
    throw new AppError('VALIDATION_ERROR', 'This link is invalid or has expired', { status: 400 })
  doc.usedAt = new Date()
  await doc.save()
  return doc.userId
}

export async function register(
  input: {
    email: string
    password: string
    displayName: string
    timezone: string
    nativeLanguage?: string | undefined
  },
  meta: RequestMeta,
) {
  assertPasswordAllowed(input.password)
  if (await UserModel.exists({ email: input.email }))
    throw new AppError('EMAIL_TAKEN', 'An account with this email already exists')
  const user = await UserModel.create({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    displayName: input.displayName,
    timezone: input.timezone,
    ...(input.nativeLanguage ? { nativeLanguage: input.nativeLanguage } : {}),
    lastLoginAt: new Date(),
  }).catch((err: unknown) => {
    if ((err as { code?: number }).code === 11000)
      throw new AppError('EMAIL_TAKEN', 'An account with this email already exists')
    throw err
  })
  await LearnerStateModel.create({ userId: user._id })
  await sendVerification(user)
  const tokens = await createSession(user, meta)
  return { user: publicUser(user.toObject()), tokens }
}

export async function login(input: { email: string; password: string }, meta: RequestMeta) {
  const user = await UserModel.findOne({ email: input.email })
  const usable = user && !user.deletedAt && user.status === 'active'
  if (usable && user.lockedUntil && user.lockedUntil.getTime() > Date.now())
    throw new AppError('ACCOUNT_LOCKED', 'Too many failed attempts, try again later', {
      details: { retryAfterSeconds: Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000) },
    })
  const valid = await verifyPassword(usable ? user.passwordHash : undefined, input.password)
  if (!usable || !valid) {
    if (usable) {
      user.failedLoginCount += 1
      if (user.failedLoginCount >= LOCK_AFTER) {
        user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000)
        user.failedLoginCount = 0
        await audit('account_locked', user._id, meta)
      }
      await user.save()
      await audit('login_failed', user._id, meta)
    }
    throw new AppError('INVALID_CREDENTIALS', 'Email or password is incorrect')
  }
  user.failedLoginCount = 0
  user.set('lockedUntil', undefined)
  user.lastLoginAt = new Date()
  await user.save()
  await audit('login', user._id, meta, { client: meta.client })
  const tokens = await createSession(user, meta)
  return { user: publicUser(user.toObject()), tokens }
}

async function revokeFamily(familyId: string, reason: RevokeReason) {
  await SessionModel.updateMany(
    { familyId, revokedReason: trusted({ $ne: reason }) },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  )
}

/** Rotates the refresh token. Presenting an already-rotated token revokes the whole family (theft). */
export async function refresh(refreshToken: string, meta: RequestMeta) {
  const hash = hashToken(refreshToken)
  const session = await SessionModel.findOne({ tokenHash: hash })
  if (!session || !safeEqualHex(session.tokenHash, hash))
    throw new AppError('UNAUTHENTICATED', 'Invalid refresh token')
  if (session.revokedAt || session.replacedBy) {
    if (session.revokedReason === 'rotated') {
      await revokeFamily(session.familyId, 'reuse')
      await audit('refresh_reuse_detected', session.userId, meta, { familyId: session.familyId })
    }
    throw new AppError('TOKEN_REVOKED', 'Refresh token was revoked')
  }
  if (session.expiresAt.getTime() < Date.now()) throw new AppError('UNAUTHENTICATED', 'Refresh token expired')
  const user = await UserModel.findById(session.userId)
  if (!user || user.deletedAt || user.status !== 'active')
    throw new AppError('UNAUTHENTICATED', 'Account unavailable')

  // Claim the old token atomically so two parallel refreshes cannot both succeed.
  const claimed = await SessionModel.updateOne(
    { _id: session._id, revokedAt: trusted({ $exists: false }) },
    { $set: { revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() } },
  )
  if (claimed.modifiedCount !== 1) {
    await revokeFamily(session.familyId, 'reuse')
    await audit('refresh_reuse_detected', session.userId, meta, { familyId: session.familyId })
    throw new AppError('TOKEN_REVOKED', 'Refresh token was revoked')
  }
  const tokens = await createSession(
    user,
    { ...meta, client: session.client, deviceId: meta.deviceId ?? session.deviceId },
    session.familyId,
  )
  await SessionModel.updateOne(
    { _id: session._id },
    { $set: { replacedBy: new Types.ObjectId(tokens.sessionId) } },
  )
  return { user: publicUser(user.toObject()), tokens }
}

export async function logout(sessionId: string | undefined, refreshToken: string | undefined) {
  if (sessionId && Types.ObjectId.isValid(sessionId)) {
    const s = await SessionModel.findById(sessionId, { familyId: 1 }).lean()
    if (s) return revokeFamily(s.familyId, 'logout')
  }
  if (refreshToken) {
    const s = await SessionModel.findOne({ tokenHash: hashToken(refreshToken) }, { familyId: 1 }).lean()
    if (s) await revokeFamily(s.familyId, 'logout')
  }
}

async function revokeAllSessions(userId: Types.ObjectId, reason: RevokeReason, exceptFamily?: string) {
  await SessionModel.updateMany(
    {
      userId,
      revokedAt: trusted({ $exists: false }),
      ...(exceptFamily ? { familyId: trusted({ $ne: exceptFamily }) } : {}),
    },
    { $set: { revokedAt: new Date(), revokedReason: reason } },
  )
  // rotated-away docs keep reason 'rotated' unless we overwrite them too
  await SessionModel.updateMany(
    {
      userId,
      revokedReason: 'rotated',
      ...(exceptFamily ? { familyId: trusted({ $ne: exceptFamily }) } : {}),
    },
    { $set: { revokedReason: reason } },
  )
}

export async function logoutAll(userId: Types.ObjectId, meta: RequestMeta) {
  await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } })
  await revokeAllSessions(userId, 'logout')
  await audit('logout_all', userId, meta)
}

export async function verifyEmail(token: string) {
  const userId = await consumeEmailToken(token, 'verify')
  await UserModel.updateOne(
    { _id: userId, emailVerifiedAt: trusted({ $exists: false }) },
    { $set: { emailVerifiedAt: new Date() } },
  )
  return { verified: true }
}

export async function resendVerification(userId: Types.ObjectId) {
  const user = await UserModel.findById(userId).lean()
  if (!user) throw new AppError('UNAUTHENTICATED')
  if (user.emailVerifiedAt) return { alreadyVerified: true }
  await sendVerification(user)
  return { sent: true }
}

/** Always 202. Reset needs a verified email; unverified accounts get a verification link instead. */
export async function forgotPassword(email: string) {
  const user = await UserModel.findOne({ email }).lean()
  if (!user || user.deletedAt || user.status !== 'active') return
  if (!user.emailVerifiedAt) {
    await sendVerification(user)
    return
  }
  const token = await issueEmailToken(user._id, 'reset')
  sendEmail({
    to: user.email,
    subject: 'Reset your LingBloomTalk password',
    text: `Hi ${user.displayName},\n\nReset your password: ${env.APP_WEB_URL}/reset-password?token=${token}\n\nThis link is valid for 30 minutes. If you didn't ask for it, ignore this email.`,
  })
}

export async function resetPassword(token: string, password: string, meta: RequestMeta) {
  assertPasswordAllowed(password)
  const userId = await consumeEmailToken(token, 'reset')
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: { passwordHash: await hashPassword(password), failedLoginCount: 0 },
      $unset: { lockedUntil: '' },
      $inc: { tokenVersion: 1 },
    },
  )
  await revokeAllSessions(userId, 'password')
  await audit('password_reset', userId, meta)
}

export async function changePassword(
  userId: Types.ObjectId,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
) {
  const user = await UserModel.findById(userId)
  if (!user) throw new AppError('UNAUTHENTICATED')
  if (!(await verifyPassword(user.passwordHash, currentPassword)))
    throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect')
  assertPasswordAllowed(newPassword)
  user.passwordHash = await hashPassword(newPassword)
  user.tokenVersion += 1
  await user.save()
  await revokeAllSessions(userId, 'password')
  await audit('password_change', userId, meta)
  // keep this device signed in with a fresh session
  return createSession(user, meta)
}

export async function listSessions(userId: Types.ObjectId, currentSessionId: string) {
  const current = await SessionModel.findById(currentSessionId, { familyId: 1 }).lean()
  const sessions = await SessionModel.find(
    { userId, revokedAt: trusted({ $exists: false }), expiresAt: trusted({ $gt: new Date() }) },
    { client: 1, deviceId: 1, userAgent: 1, lastUsedAt: 1, createdAt: 1, familyId: 1 },
  )
    .sort({ lastUsedAt: -1 })
    .lean()
  return sessions.map((s) => ({
    id: String(s._id),
    client: s.client,
    deviceId: s.deviceId ?? null,
    userAgent: s.userAgent ?? null,
    lastUsedAt: s.lastUsedAt,
    createdAt: s.createdAt,
    current: !!current && s.familyId === current.familyId,
  }))
}

export async function revokeSession(userId: Types.ObjectId, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError('NOT_FOUND', 'Session not found')
  const s = await SessionModel.findOne({ _id: id, userId }, { familyId: 1 }).lean()
  if (!s) throw new AppError('NOT_FOUND', 'Session not found')
  await revokeFamily(s.familyId, 'logout')
}

export { revokeAllSessions }
