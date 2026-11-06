import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { inject } from 'vitest'

// Must run before any src module is imported: src/config/env.ts validates process.env on import.
const uri = new URL(inject('mongoUri'))
uri.pathname = `/test_${randomUUID().slice(0, 8)}`
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: uri.toString(),
  JWT_ACCESS_SECRET: 'test-secret-that-is-definitely-longer-than-32-bytes',
  RATE_LIMIT_ENABLED: 'false',
  RATE_LIMIT_STORE: 'memory',
  JOBS_ENABLED: 'false',
  CORS_ORIGINS: 'http://localhost:5173',
  SOURCE_DATA_DIR: path.resolve('test/fixtures/source-data'),
  SEED_ASSERT_COUNTS: 'false',
  MIN_APP_VERSION_IOS: '1.2.0',
})
