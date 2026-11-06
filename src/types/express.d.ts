import 'express-serve-static-core'

declare module 'express-serve-static-core' {
  interface Request {
    id: string
    user?: { id: string; role: 'learner' | 'admin'; sessionId: string; tokenVersion: number; iat?: number }
    client: {
      kind: 'web' | 'ios' | 'android'
      appVersion: string | undefined
      deviceId: string | undefined
      timezone: string | undefined
    }
  }
}
