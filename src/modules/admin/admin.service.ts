import { Types } from 'mongoose'
import { AppError, notFound } from '../../core/errors.js'
import { decodeCursor, paginate } from '../../core/http.js'
import { trusted } from '../../db/plugins.js'
import { seedFromSource } from '../../db/seed/seed.js'
import { revokeAllSessions, audit, type RequestMeta } from '../auth/auth.service.js'
import { loadContent } from '../content/content.store.js'
import { SyncOpModel } from '../sync/sync.model.js'
import { UserModel } from '../users/user.model.js'

export async function reseed(dryRun: boolean) {
  const report = await seedFromSource({ dryRun })
  if (!dryRun && report.changed) await loadContent()
  return report
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Admin list: never includes notes or any learner content. */
export async function listUsers(q: string | undefined, limit: number, cursor: string | undefined) {
  const filter: Record<string, unknown> = {}
  if (q) {
    const re = new RegExp(escapeRe(q), 'i')
    filter.$or = [{ email: trusted({ $regex: re }) }, { displayName: trusted({ $regex: re }) }]
  }
  const after = decodeCursor(cursor)
  if (after && Types.ObjectId.isValid(after)) filter._id = trusted({ $lt: new Types.ObjectId(after) })
  const users = await UserModel.find(filter, {
    email: 1,
    displayName: 1,
    role: 1,
    status: 1,
    emailVerifiedAt: 1,
    lastLoginAt: 1,
    createdAt: 1,
    deletedAt: 1,
    timezone: 1,
  })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .lean()
  const page = paginate(users, limit, (u) => String(u._id))
  return {
    items: page.items.map((u) => ({
      id: String(u._id),
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      status: u.status,
      emailVerified: !!u.emailVerifiedAt,
      lastLoginAt: u.lastLoginAt ?? null,
      createdAt: u.createdAt,
      deletedAt: u.deletedAt ?? null,
      timezone: u.timezone,
    })),
    nextCursor: page.nextCursor,
  }
}

export async function updateUser(
  adminId: string,
  id: string,
  patch: { status?: 'active' | 'disabled' | undefined; role?: 'learner' | 'admin' | undefined },
  meta: RequestMeta,
) {
  if (!Types.ObjectId.isValid(id)) throw notFound('User')
  if (id === adminId && patch.status === 'disabled')
    throw new AppError('CONFLICT', 'You cannot disable your own account')
  const $set: Record<string, unknown> = {}
  if (patch.status) $set.status = patch.status
  if (patch.role) $set.role = patch.role
  const user = await UserModel.findByIdAndUpdate(
    id,
    { $set, ...(patch.status === 'disabled' ? { $inc: { tokenVersion: 1 } } : {}) },
    { new: true, lean: true },
  )
  if (!user) throw notFound('User')
  if (patch.status === 'disabled') await revokeAllSessions(user._id, 'admin')
  await audit('admin_user_update', user._id, meta, { by: adminId, ...patch })
  return { id: String(user._id), email: user.email, status: user.status, role: user.role }
}

export async function stats(days: number) {
  const since = new Date(Date.now() - days * 86400_000)
  const [opsPerDay, activeToday, usersTotal, deleted] = await Promise.all([
    SyncOpModel.aggregate([
      { $match: { appliedAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$appliedAt' } },
          ops: { $sum: 1 },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          users: { $addToSet: '$userId' },
        },
      },
      { $project: { _id: 0, day: '$_id', ops: 1, rejected: 1, activeUsers: { $size: '$users' } } },
      { $sort: { day: 1 } },
    ]),
    UserModel.countDocuments({ lastLoginAt: trusted({ $gte: new Date(Date.now() - 86400_000) }) }),
    UserModel.countDocuments({ deletedAt: trusted({ $exists: false }) }),
    UserModel.countDocuments({ deletedAt: trusted({ $exists: true }) }),
  ])
  const today = opsPerDay[opsPerDay.length - 1] as { activeUsers?: number } | undefined
  const rejectedByReason = await SyncOpModel.aggregate([
    { $match: { appliedAt: { $gte: since }, status: 'rejected' } },
    { $group: { _id: '$reason', count: { $sum: 1 } } },
    { $project: { _id: 0, reason: '$_id', count: 1 } },
    { $sort: { count: -1 } },
  ])
  return {
    users: { total: usersTotal, pendingDeletion: deleted, loggedInLast24h: activeToday },
    dau: today?.activeUsers ?? 0,
    opsPerDay,
    syncErrors: rejectedByReason,
  }
}
