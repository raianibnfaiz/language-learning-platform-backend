import { AppError, notFound } from '../../core/errors.js'
import { normalize } from '../../core/text.js'
import { content } from './content.store.js'
import type { CareerLanguageDoc, LanguageDoc, PhraseDoc, SituationDoc } from './content.model.js'
import { TESTS } from './tests.meta.js'

export function etag(): string {
  const c = content()
  return `"c${c.version}-${c.hash.slice(0, 16)}"`
}

export function contentVersion() {
  const c = content()
  return { version: c.version, hash: c.hash }
}

export function languageDto(l: LanguageDoc) {
  return {
    id: l._id,
    name: l.name,
    nativeName: l.nativeName,
    flag: l.flag,
    speechCode: l.speechCode,
    region: l.region,
    latin: l.latin,
    featured: l.featured,
    community: l.community,
    phraseCount: l.phraseCount,
  }
}

export function situationDto(s: SituationDoc) {
  return {
    id: s._id,
    title: s.title,
    emoji: s.emoji,
    blurb: s.blurb,
    gradient: s.gradient,
    kind: s.kind,
    phrases: s.phrases.map((p) => ({ id: p.id, english: p.english, picture: p.picture })),
  }
}

/** LearnPhrase = { id, text, romanization?, meaning, picture } (+ wordPieces for the Word builder test). */
export function learnPhraseDto(p: PhraseDoc) {
  return {
    id: p.phraseId,
    key: p.key,
    text: p.text,
    ...(p.romanization ? { romanization: p.romanization } : {}),
    meaning: p.meaning,
    picture: p.picture,
    wordPieces: p.wordPieces,
  }
}

export function overallScore(scores: CareerLanguageDoc['scores']): number {
  return Math.round((scores.gdpAccess + scores.tradeUtility + scores.diplomacy + scores.wagePremium) / 4)
}

function careerSummaryDto(c: CareerLanguageDoc) {
  const {
    _id,
    lessons,
    phrases: _phrases,
    ...rest
  } = c as CareerLanguageDoc & { createdAt?: unknown; updatedAt?: unknown }
  delete (rest as Record<string, unknown>).createdAt
  delete (rest as Record<string, unknown>).updatedAt
  delete (rest as Record<string, unknown>).__v
  return { id: _id, ...rest, overallScore: overallScore(c.scores), lessonCount: lessons.length }
}

function careerDetailDto(c: CareerLanguageDoc) {
  return {
    ...careerSummaryDto(c),
    lessons: [...c.lessons]
      .sort((a, b) => a.order - b.order)
      .map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        level: l.level,
        minutes: l.minutes,
      })),
    phrases: c.phrases,
  }
}

export function listLanguages(filter: { region?: string; featured?: boolean; q?: string }) {
  const q = filter.q ? normalize(filter.q) : ''
  return content()
    .languages.filter((l) => !filter.region || l.region === filter.region)
    .filter((l) => filter.featured === undefined || l.featured === filter.featured)
    .filter(
      (l) => !q || normalize(l.name).includes(q) || normalize(l.nativeName).includes(q) || l._id.includes(q),
    )
    .map(languageDto)
}

export function getLanguage(langId: string) {
  const c = content()
  const lang = c.languagesById.get(langId)
  if (!lang) throw notFound('Language')
  return {
    ...languageDto(lang),
    situations: c.situations.map((s) => {
      const available = c.isAvailable(langId, s._id)
      return {
        id: s._id,
        title: s.title,
        emoji: s.emoji,
        blurb: s.blurb,
        gradient: s.gradient,
        kind: s.kind,
        available,
        phraseCount: available ? c.phrasesFor(langId, s._id).length : 0,
      }
    }),
  }
}

export function getPhrases(langId: string, situationId: string) {
  const c = content()
  if (!c.languagesById.has(langId)) throw notFound('Language')
  if (!c.situationsById.has(situationId)) throw notFound('Situation')
  if (!c.isAvailable(langId, situationId))
    throw new AppError('SITUATION_UNAVAILABLE', 'This situation is coming soon for this language', {
      status: 404,
    })
  return c.phrasesFor(langId, situationId).map(learnPhraseDto)
}

export const listSituations = () => content().situations.map(situationDto)
export const listTests = () => TESTS

export const listCareerLanguages = () => content().careerLanguages.map(careerSummaryDto)
export function getCareerLanguage(id: string) {
  const c = content().careerLanguages.find((x) => x._id === id)
  if (!c) throw notFound('Career language')
  return careerDetailDto(c)
}

export function stats() {
  const c = content()
  let situations = 0
  for (const l of c.languages) situations += l.availableSituationIds.length
  return {
    languages: c.languages.length,
    phrases: c.phrasesByKey.size,
    situations,
    topics: c.situations.length,
  }
}

export function search(q: string, limit = 50) {
  const needle = normalize(q)
  const c = content()
  const phrases = []
  for (const p of c.phrasesByKey.values()) {
    if (
      normalize(p.text).includes(needle) ||
      normalize(p.meaning).includes(needle) ||
      (p.romanization && normalize(p.romanization).includes(needle))
    ) {
      phrases.push({ ...learnPhraseDto(p), langId: p.langId, situationId: p.situationId })
      if (phrases.length >= limit) break
    }
  }
  const lessons = []
  for (const [id, { lesson, careerId }] of c.lessonsById) {
    if (normalize(lesson.title).includes(needle) || normalize(lesson.description).includes(needle)) {
      lessons.push({
        id,
        careerLanguageId: careerId,
        title: lesson.title,
        description: lesson.description,
        level: lesson.level,
        minutes: lesson.minutes,
      })
      if (lessons.length >= limit) break
    }
  }
  return { phrases, lessons }
}

export function bundle() {
  const c = content()
  return {
    version: c.version,
    hash: c.hash,
    languages: c.languages.map(languageDto),
    situations: c.situations.map(situationDto),
    phrases: Object.fromEntries(
      c.languages.map((l) => [
        l._id,
        Object.fromEntries(
          c.availableSituations(l._id).map((s) => [s._id, c.phrasesFor(l._id, s._id).map(learnPhraseDto)]),
        ),
      ]),
    ),
    careerLanguages: c.careerLanguages.map(careerDetailDto),
    tests: TESTS,
    stats: stats(),
  }
}
