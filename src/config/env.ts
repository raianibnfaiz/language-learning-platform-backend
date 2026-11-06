import { z } from 'zod'

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())))

const semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'must be MAJOR.MINOR.PATCH')

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_BASE_PATH: z.string().startsWith('/').default('/api/v1'),
    MONGODB_URI: z.string().min(1),

    JWT_ACCESS_SECRET: z.string().optional(),
    JWT_PRIVATE_KEY: z.string().optional(),
    JWT_PUBLIC_KEY: z.string().optional(),
    JWT_ALGORITHM: z.enum(['RS256', 'EdDSA']).default('RS256'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_ISSUER: z.string().default('lingbloomtalk-api'),
    JWT_AUDIENCE: z.string().default('lingbloomtalk-clients'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    COOKIE_DOMAIN: z.string().optional(),
    COOKIE_SECURE: bool.default(false),
    COOKIE_SAMESITE: z.enum(['strict', 'lax']).default('strict'),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
    TRUST_PROXY: z.string().default('0'),

    APP_WEB_URL: z.string().url().default('http://localhost:5173'),
    SMTP_URL: z.string().optional(),
    EMAIL_FROM: z.string().default('LingBloomTalk <no-reply@example.com>'),

    MIN_APP_VERSION_IOS: semver.default('1.0.0'),
    MIN_APP_VERSION_ANDROID: semver.default('1.0.0'),
    MIN_APP_VERSION_WEB: semver.default('0.0.0'),

    MAX_DAILY_XP: z.coerce.number().int().positive().default(2000),

    TRANSLATION_PROVIDER: z.enum(['none', 'deepl', 'google', 'llm']).default('none'),
    TRANSLATION_API_KEY: z.string().optional(),
    TRANSLATION_DAILY_CHAR_LIMIT: z.coerce.number().int().positive().default(20000),
    HELP_BOT_MODE: z.enum(['off', 'intents', 'llm']).default('off'),

    RATE_LIMIT_ENABLED: bool.default(true),
    RATE_LIMIT_STORE: z.enum(['memory', 'mongo']).default('mongo'),
    JOBS_ENABLED: bool.default(true),
    DOCS_ENABLED: bool.optional(),
    SOURCE_DATA_DIR: z.string().default('source-data'),
    SEED_ASSERT_COUNTS: bool.default(true),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  })
  .superRefine((e, ctx) => {
    if (e.JWT_PRIVATE_KEY) {
      if (!e.JWT_PUBLIC_KEY)
        ctx.addIssue({ code: 'custom', path: ['JWT_PUBLIC_KEY'], message: 'required with JWT_PRIVATE_KEY' })
    } else if (!e.JWT_ACCESS_SECRET || Buffer.byteLength(e.JWT_ACCESS_SECRET) < 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'must be set and at least 32 bytes (or provide JWT_PRIVATE_KEY/JWT_PUBLIC_KEY)',
      })
    }
  })

export type Env = z.infer<typeof EnvSchema>

function emptyToUndefined(src: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(src)) if (v !== undefined && v !== '') out[k] = v
  return out
}

export function parseEnv(src: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(emptyToUndefined(src))
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    // Fail fast on boot with a readable message (never print values: they may be secrets).
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  return result.data
}

export const env: Env = parseEnv(process.env)

export const isProd = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
