import { Schema, model, type Types } from 'mongoose'

export interface LearnerStateDoc {
  _id: Types.ObjectId
  userId: Types.ObjectId
  xp: number
  completedLessons: string[]
  bookmarks: string[]
  /** last visited language ids, newest first, max 6 (derived from recentVisits) */
  recent: string[]
  recentVisits: { langId: string; at: Date }[]
  /** LWW timestamps for lesson completion / bookmark toggles (lessonId -> occurredAt) */
  lessonChangedAt: Map<string, Date>
  bookmarkChangedAt: Map<string, Date>
  /** increments on every applied batch; clients use it for delta sync */
  stateVersion: number
  /** deltas from versions below this are not available (reset, replace import, compaction) */
  deltaFloor: number
  updatedAt: Date
}
const learnerStateSchema = new Schema<LearnerStateDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, unique: true },
    xp: { type: Number, default: 0, min: 0 },
    completedLessons: { type: [String], default: [] },
    bookmarks: { type: [String], default: [] },
    recent: { type: [String], default: [] },
    recentVisits: [new Schema({ langId: String, at: Date }, { _id: false })],
    lessonChangedAt: { type: Map, of: Date, default: {} },
    bookmarkChangedAt: { type: Map, of: Date, default: {} },
    stateVersion: { type: Number, default: 0 },
    deltaFloor: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'learnerStates' },
)
export const LearnerStateModel = model<LearnerStateDoc>('LearnerState', learnerStateSchema)

export interface DailyActivityDoc {
  userId: Types.ObjectId
  day: string
  xp: number
  version: number
}
const dailyActivitySchema = new Schema<DailyActivityDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    day: { type: String, required: true },
    xp: { type: Number, default: 0, min: 0 },
    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'dailyActivity' },
)
dailyActivitySchema.index({ userId: 1, day: 1 }, { unique: true })
dailyActivitySchema.index({ userId: 1, version: 1 })
export const DailyActivityModel = model<DailyActivityDoc>('DailyActivity', dailyActivitySchema)
