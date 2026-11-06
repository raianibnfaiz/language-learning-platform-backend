import type { Server } from 'node:http'
import { createApp } from './app.js'
import { connectDb, disconnectDb } from './config/db.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { startJobs } from './jobs/scheduler.js'
import { loadContent } from './modules/content/content.store.js'

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection, exiting')
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException, exiting')
  process.exit(1)
})

await connectDb()
const content = await loadContent()
if (!content.phrasesByKey.size) logger.warn('content collections are empty: run `npm run seed`')
const stopJobs = env.JOBS_ENABLED ? startJobs() : () => undefined

const app = createApp()
const server: Server = app.listen(env.PORT, () =>
  logger.info({ port: env.PORT, base: env.API_BASE_PATH }, 'lingbloomtalk-api listening'),
)
server.keepAliveTimeout = 65_000

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'shutting down: no new connections, finishing in-flight requests')
  stopJobs()
  const force = setTimeout(() => {
    logger.error('forced shutdown after 15s')
    process.exit(1)
  }, 15_000)
  force.unref()
  server.close(async () => {
    await disconnectDb().catch(() => undefined)
    logger.info('bye')
    process.exit(0)
  })
  server.closeIdleConnections()
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
