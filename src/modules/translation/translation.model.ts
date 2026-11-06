import { Schema, model } from 'mongoose'

/** (phase 2) Cache of translated lesson/phrase/explanation text. */
export interface TranslationDoc {
  sourceHash: string
  sourceLang: string
  targetLang: string
  text: string
  provider: string
  createdAt: Date
}
const schema = new Schema<TranslationDoc>(
  {
    sourceHash: { type: String, required: true },
    sourceLang: { type: String, required: true },
    targetLang: { type: String, required: true },
    text: { type: String, required: true },
    provider: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'translations' },
)
schema.index({ sourceHash: 1, sourceLang: 1, targetLang: 1 }, { unique: true })
export const TranslationModel = model<TranslationDoc>('Translation', schema)

export interface TranslationUsageDoc {
  userId: Schema.Types.ObjectId
  day: string
  chars: number
}
const usage = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    day: { type: String, required: true },
    chars: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'translationUsage' },
)
usage.index({ userId: 1, day: 1 }, { unique: true })
export const TranslationUsageModel = model('TranslationUsage', usage)
