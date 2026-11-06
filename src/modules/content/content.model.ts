import { Schema, model } from 'mongoose'
import { toJsonPlugin } from '../../db/plugins.js'

export const REGIONS = [
  'Western Europe',
  'Northern Europe',
  'Central & Eastern Europe',
  'Regional languages',
  'Middle East & Africa',
  'South Asia',
  'East & Southeast Asia',
] as const
export type Region = (typeof REGIONS)[number]

export interface LanguageDoc {
  _id: string
  name: string
  nativeName: string
  flag: string
  speechCode: string
  region: Region
  latin: boolean
  featured: boolean
  community: boolean
  sortKey: number
  phraseCount: number
  availableSituationIds: string[]
  isActive: boolean
}

const languageSchema = new Schema<LanguageDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    nativeName: { type: String, required: true },
    flag: { type: String, required: true },
    speechCode: { type: String, required: true },
    region: { type: String, enum: REGIONS, required: true },
    latin: { type: Boolean, required: true },
    featured: { type: Boolean, default: false },
    community: { type: Boolean, default: false },
    sortKey: { type: Number, required: true },
    phraseCount: { type: Number, required: true },
    availableSituationIds: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'languages' },
)
languageSchema.index({ region: 1, sortKey: 1 })
languageSchema.index({ name: 'text', nativeName: 'text' })
languageSchema.plugin(toJsonPlugin)
export const LanguageModel = model<LanguageDoc>('Language', languageSchema)

export interface SituationPhraseDef {
  id: string
  english: string
  picture: string
  order: number
}
export interface SituationDoc {
  _id: string
  title: string
  emoji: string
  blurb: string
  gradient: string
  order: number
  kind: 'core' | 'travel'
  phrases: SituationPhraseDef[]
}
const situationSchema = new Schema<SituationDoc>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    emoji: { type: String, required: true },
    blurb: { type: String, default: '' },
    gradient: { type: String, default: '' },
    order: { type: Number, required: true },
    kind: { type: String, enum: ['core', 'travel'], required: true },
    phrases: [
      new Schema<SituationPhraseDef>(
        { id: String, english: String, picture: String, order: Number },
        { _id: false },
      ),
    ],
  },
  { timestamps: true, collection: 'situations' },
)
situationSchema.plugin(toJsonPlugin)
export const SituationModel = model<SituationDoc>('Situation', situationSchema)

export interface PhraseDoc {
  langId: string
  situationId: string
  phraseId: string
  key: string
  text: string
  romanization?: string
  meaning: string
  picture: string
  order: number
  wordPieces: string[]
  contentVersion: number
}
const phraseSchema = new Schema<PhraseDoc>(
  {
    langId: { type: String, required: true },
    situationId: { type: String, required: true },
    phraseId: { type: String, required: true },
    key: { type: String, required: true },
    text: { type: String, required: true },
    romanization: { type: String },
    meaning: { type: String, required: true },
    picture: { type: String, required: true },
    order: { type: Number, required: true },
    wordPieces: { type: [String], default: [] },
    contentVersion: { type: Number, required: true },
  },
  { timestamps: true, collection: 'phrases' },
)
phraseSchema.index({ key: 1 }, { unique: true })
phraseSchema.index({ langId: 1, situationId: 1, order: 1 })
phraseSchema.plugin(toJsonPlugin)
export const PhraseModel = model<PhraseDoc>('Phrase', phraseSchema)

export interface LessonDoc {
  id: string
  title: string
  description: string
  level: 'Beginner' | 'Intermediate' | 'Advanced'
  minutes: number
  order: number
}
export interface CareerPhrase {
  [k: string]: unknown
}
export interface CareerLanguageDoc {
  _id: string
  rank: number
  name: string
  nativeName: string
  flag: string
  speechCode: string
  speakers: string
  studyHours: string
  difficulty: 'Easy' | 'Moderate' | 'Hard'
  tagline: string
  whyValuable: string
  highlights: string[]
  scores: { gdpAccess: number; tradeUtility: number; diplomacy: number; wagePremium: number }
  gradient: string
  accentText: string
  accentBg: string
  lessons: LessonDoc[]
  phrases: CareerPhrase[]
}
const careerSchema = new Schema<CareerLanguageDoc>(
  {
    _id: { type: String, required: true },
    rank: { type: Number, required: true },
    name: String,
    nativeName: String,
    flag: String,
    speechCode: String,
    // speakers / studyHours are free-form in the source (number or label), kept verbatim.
    speakers: Schema.Types.Mixed,
    studyHours: Schema.Types.Mixed,
    difficulty: { type: String, enum: ['Easy', 'Moderate', 'Hard'] },
    tagline: String,
    whyValuable: String,
    highlights: [String],
    scores: { gdpAccess: Number, tradeUtility: Number, diplomacy: Number, wagePremium: Number },
    gradient: String,
    accentText: String,
    accentBg: String,
    lessons: [
      new Schema<LessonDoc>(
        {
          id: { type: String, required: true },
          title: String,
          description: String,
          level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'] },
          minutes: Number,
          order: Number,
        },
        { _id: false },
      ),
    ],
    phrases: [Schema.Types.Mixed],
  },
  { timestamps: true, collection: 'careerLanguages' },
)
careerSchema.index({ 'lessons.id': 1 }, { unique: true, sparse: true })
careerSchema.plugin(toJsonPlugin)
export const CareerLanguageModel = model<CareerLanguageDoc>('CareerLanguage', careerSchema)

export interface ContentMetaDoc {
  _id: string
  version: number
  hash: string
  updatedAt: Date
}
const contentMetaSchema = new Schema<ContentMetaDoc>(
  { _id: String, version: { type: Number, required: true }, hash: { type: String, required: true } },
  { timestamps: true, collection: 'contentMeta' },
)
export const ContentMetaModel = model<ContentMetaDoc>('ContentMeta', contentMetaSchema)
