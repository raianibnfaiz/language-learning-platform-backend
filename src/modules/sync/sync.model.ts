import { Schema, model, type Types } from 'mongoose'

export type OpStatus = 'applied' | 'rejected' | 'duplicate'

export interface SyncOpDoc {
  userId: Types.ObjectId
  opId: string
  deviceId: string
  type: string
  payload: unknown
  occurredAt: Date
  localDay: string
  status: OpStatus
  reason?: string
  xpDelta: number
  result?: unknown
  appliedAt: Date
}
const syncOpSchema = new Schema<SyncOpDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    opId: { type: String, required: true },
    deviceId: { type: String, required: true },
    type: { type: String, required: true },
    payload: Schema.Types.Mixed,
    occurredAt: { type: Date, required: true },
    localDay: { type: String, required: true },
    status: { type: String, enum: ['applied', 'rejected', 'duplicate'], required: true },
    reason: String,
    xpDelta: { type: Number, default: 0 },
    result: Schema.Types.Mixed,
    appliedAt: { type: Date, default: () => new Date() },
  },
  { collection: 'syncOps' },
)
syncOpSchema.index({ userId: 1, opId: 1 }, { unique: true })
syncOpSchema.index({ appliedAt: 1 }, { expireAfterSeconds: 90 * 86400 })
syncOpSchema.index({ status: 1, appliedAt: 1 })
export const SyncOpModel = model<SyncOpDoc>('SyncOp', syncOpSchema)

export interface ImportRecordDoc {
  userId: Types.ObjectId
  deviceId: string
  strategy: 'merge' | 'replace-server'
  result: unknown
  createdAt: Date
}
const importSchema = new Schema<ImportRecordDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    deviceId: { type: String, required: true },
    strategy: { type: String, required: true },
    result: Schema.Types.Mixed,
  },
  { timestamps: true, collection: 'stateImports' },
)
importSchema.index({ userId: 1, deviceId: 1 }, { unique: true })
export const ImportRecordModel = model<ImportRecordDoc>('ImportRecord', importSchema)
