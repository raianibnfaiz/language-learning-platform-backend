import { Schema, model, type Types } from 'mongoose'

export interface PhraseStateDoc {
  userId: Types.ObjectId
  key: string
  langId: string
  heardAt?: Date
  favorite: boolean
  favoriteUpdatedAt?: Date
  note?: string
  noteUpdatedAt?: Date
  review?: { box: number; due: string }
  reviewUpdatedAt?: Date
  version: number
}
const phraseStateSchema = new Schema<PhraseStateDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    key: { type: String, required: true },
    langId: { type: String, required: true },
    heardAt: Date,
    favorite: { type: Boolean, default: false },
    favoriteUpdatedAt: Date,
    note: { type: String, maxlength: 4000 },
    noteUpdatedAt: Date,
    review: { type: new Schema({ box: { type: Number, min: 0, max: 5 }, due: String }, { _id: false }) },
    reviewUpdatedAt: Date,
    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'phraseStates' },
)
phraseStateSchema.index({ userId: 1, key: 1 }, { unique: true })
phraseStateSchema.index({ userId: 1, langId: 1 })
phraseStateSchema.index({ userId: 1, 'review.due': 1 })
phraseStateSchema.index({ userId: 1, version: 1 })
export const PhraseStateModel = model<PhraseStateDoc>('PhraseState', phraseStateSchema)

export interface TestScoreDoc {
  userId: Types.ObjectId
  langId: string
  situationId: string
  test: number
  bestStars: number
  attempts: number
  lastPlayedAt: Date
  version: number
}
const testScoreSchema = new Schema<TestScoreDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    langId: { type: String, required: true },
    situationId: { type: String, required: true },
    test: { type: Number, required: true, min: 1, max: 4 },
    bestStars: { type: Number, default: 0, min: 0, max: 3 },
    attempts: { type: Number, default: 0 },
    lastPlayedAt: Date,
    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'testScores' },
)
testScoreSchema.index({ userId: 1, langId: 1, situationId: 1, test: 1 }, { unique: true })
testScoreSchema.index({ userId: 1, version: 1 })
export const TestScoreModel = model<TestScoreDoc>('TestScore', testScoreSchema)

export interface FavoriteWordDoc {
  userId: Types.ObjectId
  langId: string
  word: string
  changedAt: Date
  version: number
  createdAt: Date
}
const favoriteWordSchema = new Schema<FavoriteWordDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    langId: { type: String, required: true },
    word: { type: String, required: true },
    changedAt: { type: Date, required: true },
    version: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'favoriteWords' },
)
favoriteWordSchema.index({ userId: 1, langId: 1, word: 1 }, { unique: true })
favoriteWordSchema.index({ userId: 1, version: 1 })
export const FavoriteWordModel = model<FavoriteWordDoc>('FavoriteWord', favoriteWordSchema)

/**
 * Records removals (a phraseState or favourite word that was deleted) so that
 * (a) delta sync can tell clients about them and (b) last-writer-wins still works after the doc is gone.
 */
export interface TombstoneDoc {
  userId: Types.ObjectId
  kind: 'phrase' | 'word'
  key: string
  changedAt: Date
  version: number
}
const tombstoneSchema = new Schema<TombstoneDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: ['phrase', 'word'], required: true },
    key: { type: String, required: true },
    changedAt: { type: Date, required: true },
    version: { type: Number, required: true },
  },
  { timestamps: true, collection: 'stateTombstones' },
)
tombstoneSchema.index({ userId: 1, kind: 1, key: 1 }, { unique: true })
tombstoneSchema.index({ userId: 1, version: 1 })
tombstoneSchema.index({ createdAt: 1 })
export const TombstoneModel = model<TombstoneDoc>('Tombstone', tombstoneSchema)
