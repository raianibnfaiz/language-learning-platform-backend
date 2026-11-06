import { Schema, model, type Types } from 'mongoose'

export type ClientKind = 'web' | 'ios' | 'android'
export type RevokeReason = 'rotated' | 'logout' | 'reuse' | 'password' | 'admin' | 'deleted'

export interface SessionDoc {
  _id: Types.ObjectId
  userId: Types.ObjectId
  familyId: string
  tokenHash: string
  deviceId?: string
  client: ClientKind
  userAgent?: string
  ip?: string
  expiresAt: Date
  revokedAt?: Date
  revokedReason?: RevokeReason
  replacedBy?: Types.ObjectId
  lastUsedAt: Date
  createdAt: Date
}
const sessionSchema = new Schema<SessionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    deviceId: String,
    client: { type: String, enum: ['web', 'ios', 'android'], required: true },
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
    replacedBy: Schema.Types.ObjectId,
    lastUsedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true, collection: 'sessions' },
)
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const SessionModel = model<SessionDoc>('Session', sessionSchema)
