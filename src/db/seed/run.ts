import { connectDb, disconnectDb } from '../../config/db.js'
import { seedFromSource, summarizeReport } from './seed.js'

const dryRun = process.argv.includes('--dry-run')
const dirArg = process.argv.find((a) => a.startsWith('--dir='))?.slice(6)

try {
  await connectDb()
  const report = await seedFromSource({ dryRun, ...(dirArg ? { dir: dirArg } : {}) })
  console.log(summarizeReport(report))
  await disconnectDb()
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  await disconnectDb().catch(() => undefined)
  process.exit(1)
}
