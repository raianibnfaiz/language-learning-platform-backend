import {
  CareerLanguageModel,
  ContentMetaModel,
  LanguageModel,
  PhraseModel,
  SituationModel,
  type CareerLanguageDoc,
  type LanguageDoc,
  type LessonDoc,
  type PhraseDoc,
  type SituationDoc,
} from './content.model.js'

/**
 * In-memory, read-only snapshot of the seeded content. The content is small (≈1k docs), changes only
 * on seed, and is consulted by every learner write (phrase key / lesson / situation validation),
 * so it is loaded at boot and reloaded whenever `contentMeta.version` changes.
 */
export class ContentSnapshot {
  readonly languages: LanguageDoc[]
  readonly languagesById: Map<string, LanguageDoc>
  readonly situations: SituationDoc[]
  readonly situationsById: Map<string, SituationDoc>
  readonly phrasesByKey: Map<string, PhraseDoc>
  readonly phrasesByLangSituation: Map<string, PhraseDoc[]>
  readonly careerLanguages: CareerLanguageDoc[]
  readonly lessonsById: Map<string, { lesson: LessonDoc; careerId: string }>

  constructor(
    readonly version: number,
    readonly hash: string,
    languages: LanguageDoc[],
    situations: SituationDoc[],
    phrases: PhraseDoc[],
    careers: CareerLanguageDoc[],
  ) {
    this.languages = [...languages].sort((a, b) => a.sortKey - b.sortKey)
    this.languagesById = new Map(this.languages.map((l) => [l._id, l]))
    this.situations = [...situations].sort((a, b) => a.order - b.order)
    this.situationsById = new Map(this.situations.map((s) => [s._id, s]))
    this.phrasesByKey = new Map(phrases.map((p) => [p.key, p]))
    this.phrasesByLangSituation = new Map()
    for (const p of [...phrases].sort((a, b) => a.order - b.order)) {
      const k = `${p.langId}:${p.situationId}`
      const list = this.phrasesByLangSituation.get(k) ?? []
      list.push(p)
      this.phrasesByLangSituation.set(k, list)
    }
    this.careerLanguages = [...careers].sort((a, b) => a.rank - b.rank)
    this.lessonsById = new Map()
    for (const c of this.careerLanguages)
      for (const l of c.lessons) this.lessonsById.set(l.id, { lesson: l, careerId: c._id })
  }

  isAvailable(langId: string, situationId: string): boolean {
    return this.languagesById.get(langId)?.availableSituationIds.includes(situationId) ?? false
  }

  phrasesFor(langId: string, situationId: string): PhraseDoc[] {
    return this.phrasesByLangSituation.get(`${langId}:${situationId}`) ?? []
  }

  /** Available situations of a language, in situation order. */
  availableSituations(langId: string): SituationDoc[] {
    return this.situations.filter((s) => this.isAvailable(langId, s._id))
  }

  totalPhrasesFor(langId: string): number {
    return this.languagesById.get(langId)?.phraseCount ?? 0
  }
}

let current: ContentSnapshot = new ContentSnapshot(0, '', [], [], [], [])

export function content(): ContentSnapshot {
  return current
}

export async function loadContent(): Promise<ContentSnapshot> {
  const [meta, languages, situations, phrases, careers] = await Promise.all([
    ContentMetaModel.findById('content').lean(),
    LanguageModel.find({ isActive: true }).lean(),
    SituationModel.find().lean(),
    PhraseModel.find().lean(),
    CareerLanguageModel.find().lean(),
  ])
  current = new ContentSnapshot(
    meta?.version ?? 0,
    meta?.hash ?? '',
    languages as LanguageDoc[],
    situations as SituationDoc[],
    phrases as PhraseDoc[],
    careers as CareerLanguageDoc[],
  )
  return current
}

/** Reload when another instance (or a seed run) bumped the content version. */
export async function refreshContentIfChanged(): Promise<boolean> {
  const meta = await ContentMetaModel.findById('content', { version: 1 }).lean()
  if ((meta?.version ?? 0) !== current.version) {
    await loadContent()
    return true
  }
  return false
}
