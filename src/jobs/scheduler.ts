import cron from 'node-cron'
import { logger } from '../config/logger.js'
import { trusted } from '../db/plugins.js'
import { refreshContentIfChanged } from '../modules/content/content.store.js'
import { LearnerStateModel } from '../modules/progress/progress.model.js'
import { TombstoneModel } from '../modules/phrasebook/phrasebook.model.js'
import { purgeDeletedAccounts } from '../modules/users/users.service.js'

const TOMBSTONE_RETENTION_DAYS = 90

/**
 * Drops tombstones older than 90 days. Clients whose `since` is older than the dropped tombstones can no
 * longer get a correct delta, so the user's deltaFloor moves past them (they get a full snapshot instead).
 */
export async function compactTombstones(now = new Date()) {
  const cutoff = new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * 86400_000)
  const groups = await TombstoneModel.aggregate<{ _id: unknown; maxVersion: number }>([
    { $match: { createdAt: { $lt: cutoff } } },
    { $group: { _id: '$userId', maxVersion: { $max: '$version' } } },
  ])
  for (const g of groups) {
    await LearnerStateModel.updateOne({ userId: g._id }, { $max: { deltaFloor: g.maxVersion + 1 } })
  }
  const { deletedCount } = await TombstoneModel.deleteMany({ createdAt: trusted({ $lt: cutoff }) })
  return deletedCount
}

export function startJobs(): () => void {
  const run = (name: string, fn: () => Promise<unknown>) => async () => {
    try {
      const result = await fn()
      logger.info({ job: name, result }, 'job finished')
    } catch (err) {
      logger.error({ err, job: name }, 'job failed')
    }
  }
  const tasks = [
    cron.schedule(
      '17 3 * * *',
      run('purge-deleted-accounts', () => purgeDeletedAccounts()),
    ),
    cron.schedule(
      '42 4 * * 0',
      run('compact-tombstones', () => compactTombstones()),
    ),
    // other instances (or a seed run) may bump the content version
    cron.schedule('* * * * *', async () => {
      await refreshContentIfChanged().catch((err: unknown) => logger.warn({ err }, 'content refresh failed'))
    }),
  ]
  return () => tasks.forEach((t) => void t.stop())
}
