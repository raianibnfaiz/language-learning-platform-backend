import mongoose from 'mongoose'
import { env, isProd } from './env.js'
import { logger } from './logger.js'

mongoose.set('strictQuery', true)
mongoose.set('sanitizeFilter', true)
// In production indexes are created by migrations (npm run migrate:up), never on boot.
mongoose.set('autoIndex', !isProd)

mongoose.connection.on('connected', () => logger.info('mongo connected'))
mongoose.connection.on('disconnected', () => logger.warn('mongo disconnected'))
mongoose.connection.on('error', (err: unknown) => logger.error({ err }, 'mongo error'))

export async function connectDb(uri = env.MONGODB_URI, { retries = 5, delayMs = 2000 } = {}): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 })
      return
    } catch (err) {
      if (attempt >= retries) throw err
      logger.warn({ err, attempt }, 'mongo connect failed, retrying')
      await new Promise((r) => setTimeout(r, delayMs * attempt))
    }
  }
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect()
}

export async function pingDb(): Promise<boolean> {
  try {
    const db = mongoose.connection.db
    if (!db || mongoose.connection.readyState !== 1) return false
    await db.admin().ping()
    return true
  } catch {
    return false
  }
}
