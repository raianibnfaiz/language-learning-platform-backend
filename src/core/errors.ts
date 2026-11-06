export const ErrorCodes = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_REVOKED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  INVALID_CREDENTIALS: 401,
  ACCOUNT_LOCKED: 403,
  TEST_LOCKED: 422,
  SITUATION_UNAVAILABLE: 422,
  UNKNOWN_PHRASE: 422,
  UNKNOWN_LESSON: 422,
  DAY_OUT_OF_RANGE: 422,
  RATE_LIMITED: 429,
  UPGRADE_REQUIRED: 426,
  NOT_ENABLED: 501,
  INTERNAL: 500,
} as const

export type ErrorCode = keyof typeof ErrorCodes

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details: unknown

  constructor(code: ErrorCode, message?: string, opts: { status?: number; details?: unknown } = {}) {
    super(message ?? code)
    this.name = 'AppError'
    this.code = code
    this.status = opts.status ?? ErrorCodes[code]
    this.details = opts.details
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`)
/** A request that is well-formed but breaks a game rule (impossible score, etc.). */
export const ruleViolation = (message: string, details?: unknown) =>
  new AppError('VALIDATION_ERROR', message, { status: 422, details })
