import { Schema, model, type Types } from 'mongoose'
import { toJsonPlugin } from '../../db/plugins.js'

export type Theme = 'system' | 'light' | 'dark'
export interface UserDoc {
  _id: Types.ObjectId
  email: string
  emailVerifiedAt?: Date
  passwordHash?: string
  providers: { provider: 'google' | 'apple'; providerUserId: string }[]
  displayName: string
  role: 'learner' | 'admin'
  timezone: string
  nativeLanguage?: string
  preferences: { theme: Theme; haptics: boolean; dailyGoalXp: number }
  preferencesUpdatedAt?: Date
  status: 'active' | 'disabled'
  tokenVersion: number
  failedLoginCount: number
  lockedUntil?: Date
  lastLoginAt?: Date
  importedAt?: Date
  deletedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    emailVerifiedAt: Date,
    passwordHash: String,
    providers: [
      new Schema(
        { provider: { type: String, enum: ['google', 'apple'] }, providerUserId: String },
        { _id: false },
      ),
    ],
    displayName: { type: String, required: true },
    role: { type: String, enum: ['learner', 'admin'], default: 'learner' },
    timezone: { type: String, default: 'UTC' },
    nativeLanguage: String,
    preferences: {
      theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
      haptics: { type: Boolean, default: true },
      dailyGoalXp: { type: Number, default: 50 },
    },
    preferencesUpdatedAt: Date,
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    tokenVersion: { type: Number, default: 0 },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
    importedAt: Date,
    deletedAt: Date,
  },
  { timestamps: true, collection: 'users' },
)
userSchema.index({ email: 1 }, { unique: true })
userSchema.index(
  { 'providers.provider': 1, 'providers.providerUserId': 1 },
  { unique: true, partialFilterExpression: { 'providers.provider': { $exists: true } } },
)
userSchema.index({ deletedAt: 1 }, { sparse: true })
userSchema.plugin(toJsonPlugin)
export const UserModel = model<UserDoc>('User', userSchema)

export interface DeviceDoc {
  userId: Types.ObjectId
  deviceId: string
  client: 'web' | 'ios' | 'android'
  appVersion?: string
  voices: Map<string, string>
  lastSyncAt?: Date
  pushToken?: string
}
const deviceSchema = new Schema<DeviceDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    deviceId: { type: String, required: true },
    client: { type: String, enum: ['web', 'ios', 'android'], required: true },
    appVersion: String,
    voices: { type: Map, of: String, default: {} },
    lastSyncAt: Date,
    pushToken: String,
  },
  { timestamps: true, collection: 'devices' },
)
deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true })
deviceSchema.plugin(toJsonPlugin)
export const DeviceModel = model<DeviceDoc>('Device', deviceSchema)

export interface EmailTokenDoc {
  userId: Types.ObjectId
  purpose: 'verify' | 'reset'
  tokenHash: string
  expiresAt: Date
  usedAt?: Date
}
const emailTokenSchema = new Schema<EmailTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    purpose: { type: String, enum: ['verify', 'reset'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
  },
  { timestamps: true, collection: 'emailTokens' },
)
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export const EmailTokenModel = model<EmailTokenDoc>('EmailToken', emailTokenSchema)

export type AuditEvent =
  | 'login'
  | 'login_failed'
  | 'account_locked'
  | 'password_change'
  | 'password_reset'
  | 'refresh_reuse_detected'
  | 'logout_all'
  | 'account_deletion'
  | 'account_purged'
  | 'daily_xp_cap_exceeded'
  | 'admin_user_update'
export interface AuditLogDoc {
  userId?: Types.ObjectId
  event: AuditEvent
  ip?: string
  userAgent?: string
  details?: Record<string, unknown>
  createdAt: Date
}
const auditSchema = new Schema<AuditLogDoc>(
  {
    userId: { type: Schema.Types.ObjectId, index: true },
    event: { type: String, required: true },
    ip: String,
    userAgent: String,
    details: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'auditLogs' },
)
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 86400 })
export const AuditLogModel = model<AuditLogDoc>('AuditLog', auditSchema)
