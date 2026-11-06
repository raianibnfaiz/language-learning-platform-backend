/** Local testing only: creates demo@lingbloomtalk.local / lingbloom-demo-pass with sample progress. */
import type { Types } from 'mongoose'
import { connectDb, disconnectDb } from '../../config/db.js'
import { env } from '../../config/env.js'
import { addDays, todayIn } from '../../core/time.js'
import { hashPassword } from '../../modules/auth/passwords.js'
import { loadContent } from '../../modules/content/content.store.js'
import { UserModel } from '../../modules/users/user.model.js'
import { LearnerStateModel } from '../../modules/progress/progress.model.js'
import { applyBatch } from '../../modules/sync/sync.service.js'

if (env.NODE_ENV === 'production') {
  console.error('seed:dev-user is for local testing only')
  process.exit(1)
}

const EMAIL = 'demo@lingbloomtalk.local'
const PASSWORD = 'lingbloom-demo-pass'

await connectDb()
const content = await loadContent()
if (!content.phrasesByKey.size) {
  console.error('No content in the database: run `npm run seed` first.')
  process.exit(1)
}
let user = await UserModel.findOne({ email: EMAIL })
if (!user) {
  user = await UserModel.create({
    email: EMAIL,
    passwordHash: await hashPassword(PASSWORD),
    displayName: 'Demo Learner',
    timezone: 'UTC',
    emailVerifiedAt: new Date(),
  })
  await LearnerStateModel.create({ userId: user._id })
}
const uid = user._id as Types.ObjectId
const today = todayIn('UTC')
const langId = content.phrasesByKey.has('spanish:hello') ? 'spanish' : content.languages[0]!._id
const firstWords = content.phrasesFor(langId, 'first-words')
const old = (daysAgo: number) => new Date(Date.now() - daysAgo * 86400_000 - 2 * 3600_000).toISOString()
const ops = [
  ...firstWords.map((p, i) => ({
    opId: `dev-heard-${i}-00000000`,
    type: 'phrase.heard',
    occurredAt: old(2),
    localDay: addDays(today, -2),
    payload: { key: p.key },
  })),
  {
    opId: 'dev-visit-000000000',
    type: 'language.visit',
    occurredAt: old(1),
    localDay: addDays(today, -1),
    payload: { langId },
  },
  {
    opId: 'dev-test-0000000000',
    type: 'test.recorded',
    occurredAt: old(1),
    localDay: addDays(today, -1),
    payload: {
      langId,
      situationId: 'first-words',
      test: 1,
      correct: firstWords.length - 1,
      total: firstWords.length,
      missed: [firstWords[0]!.key],
      comboBonuses: 1,
    },
  },
  {
    opId: 'dev-lesson-00000000',
    type: 'lesson.complete',
    occurredAt: new Date().toISOString(),
    localDay: today,
    payload: { lessonId: [...content.lessonsById.keys()][0], value: true },
  },
]
const { results } = await applyBatch(uid, { deviceId: 'dev-seed-device', timezone: 'UTC', ops })
console.log(`demo user: ${EMAIL} / ${PASSWORD}`)
console.log(`ops: ${results.map((r) => r.status).join(', ')}`)
await disconnectDb()
