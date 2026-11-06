import { Schema, model } from 'mongoose'

const schema = new Schema(
  { _id: String, hits: { type: Number, default: 0 }, resetAt: { type: Date, required: true } },
  { collection: 'rateLimits', versionKey: false },
)
schema.index({ resetAt: 1 }, { expireAfterSeconds: 0 })
export const RateLimitModel = model('RateLimit', schema)
