/**
 * Reads the four client content files in `source-data/` WITHOUT editing them and expands them into
 * database documents, using the same rules as the web app's `phrasesFor` / `words` helpers.
 */
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { wordPieces } from '../../core/text.js'
import {
  REGIONS,
  type CareerLanguageDoc,
  type LanguageDoc,
  type PhraseDoc,
  type SituationDoc,
} from '../../modules/content/content.model.js'

export const CORE_SITUATIONS = ['first-words', 'getting-by'] as const

type Mod = Record<string, unknown>
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export interface SourceModules {
  catalog: Mod
  phrases: Mod
  languages: Mod
}

export async function loadSourceModules(
  dir = path.resolve(process.cwd(), 'source-data'),
): Promise<SourceModules> {
  // The client files use extensionless TS imports ('./catalog'); tsx's loader resolves them,
  // so the files can be copied over unchanged (also works from the compiled dist/ build).
  const { register } = await import('tsx/esm/api')
  register()
  const load = async (name: string) => {
    const file = path.join(dir, `${name}.ts`)
    try {
      return (await import(pathToFileURL(file).href)) as Mod
    } catch (err) {
      throw new Error(
        `Could not import ${file}. Copy the client's ${name}.ts into source-data/ (unchanged).\n${String(err)}`,
        { cause: err },
      )
    }
  }
  return {
    catalog: await load('catalog'),
    phrases: await load('phrases'),
    languages: await load('languages'),
  }
}

/** Finds an export by preferred names first, then by shape, and explains what it saw when it fails. */
function pick<T>(mod: Mod, file: string, names: string[], shape: (v: unknown) => boolean, what: string): T {
  for (const n of names) if (n in mod && shape(mod[n])) return mod[n] as T
  const byShape = Object.entries(mod).filter(([, v]) => shape(v))
  if (byShape.length === 1) return byShape[0]![1] as T
  throw new Error(
    `${file}: could not find ${what} (tried ${names.join(', ')}; exports: ${Object.keys(mod).join(', ')})`,
  )
}

const arrOf = (key: string) => (v: unknown) => Array.isArray(v) && v.length > 0 && isObj(v[0]) && key in v[0]
const strMap = (v: unknown) =>
  isObj(v) && Object.values(v).every((x) => typeof x === 'string' || Array.isArray(x))
const nestedStrMap = (v: unknown) =>
  isObj(v) && Object.values(v).every((x) => isObj(x) && Object.values(x).every((y) => typeof y === 'string'))

interface CatalogEntry {
  id: string
  name: string
  nativeName: string
  flag: string
  speechCode: string
  region: string
  latin: boolean
  featured?: boolean
  community?: boolean
}
interface SituationEntry {
  id: string
  title: string
  emoji: string
  blurb?: string
  gradient?: string
  phrases: { id: string; english: string; picture: string }[]
}
type CareerEntry = Omit<CareerLanguageDoc, '_id' | 'lessons'> & {
  id: string
  lessons: Omit<CareerLanguageDoc['lessons'][number], 'order'>[]
}

/** `core[langId]` may be one '|'-joined string or one string per situation. */
function splitTexts(v: unknown): string[] {
  if (typeof v === 'string') return v.split('|').map((s) => s.trim())
  if (Array.isArray(v))
    return v.flatMap((x) => (typeof x === 'string' ? x.split('|').map((s) => s.trim()) : []))
  return []
}

export interface ContentData {
  languages: LanguageDoc[]
  situations: SituationDoc[]
  phrases: Omit<PhraseDoc, 'contentVersion'>[]
  careerLanguages: CareerLanguageDoc[]
}

export function buildContent(src: SourceModules): ContentData {
  const catalog = pick<CatalogEntry[]>(
    src.catalog,
    'catalog.ts',
    ['catalog', 'CATALOG', 'languages', 'LANGUAGES', 'allLanguages'],
    arrOf('speechCode'),
    'the language catalog array',
  )
  const situations = pick<SituationEntry[]>(
    src.phrases,
    'phrases.ts',
    ['situations', 'SITUATIONS'],
    (v) => arrOf('phrases')(v) && !arrOf('rank')(v),
    'the situations array',
  )
  const careers = pick<CareerEntry[]>(
    src.languages,
    'languages.ts',
    ['languages', 'LANGUAGES', 'careerLanguages', 'rankedLanguages'],
    arrOf('rank'),
    'the career languages array',
  )

  // Prefer the web app's own expansion (phrasesFor) when phrases.ts exports it: identical results by design.
  const webPhrasesFor = src.phrases.phrasesFor as
    | ((langId: string, situationId: string) => { id: string; text: string; romanization?: string }[])
    | undefined
  const webCoreIds = src.phrases.coreSituationIds as string[] | undefined
  const coreIds: readonly string[] = webCoreIds ?? CORE_SITUATIONS
  if (typeof webPhrasesFor === 'function')
    return finish(catalog, situations, careers, coreIds, (lang, sit) => {
      const list = webPhrasesFor(lang, sit)
      return list.length
        ? { texts: list.map((p) => p.text), roms: list.map((p) => p.romanization ?? '') }
        : null
    })

  const core = pick<Record<string, unknown>>(
    src.phrases,
    'phrases.ts',
    ['core', 'CORE', 'corePhrases'],
    strMap,
    'the core text map',
  )
  const coreRom = (['coreRomanization', 'CORE_ROMANIZATION', 'coreRoman']
    .map((n) => src.phrases[n])
    .find(strMap) ?? {}) as Record<string, unknown>
  const travel = pick<Record<string, Record<string, string>>>(
    src.phrases,
    'phrases.ts',
    ['travel', 'TRAVEL', 'travelPhrases'],
    nestedStrMap,
    'the travel text map',
  )
  const travelRom = (['travelRomanization', 'TRAVEL_ROMANIZATION', 'travelRoman']
    .map((n) => src.phrases[n])
    .find(nestedStrMap) ?? {}) as Record<string, Record<string, string>>
  const coreSitDefs = situations.filter((s) => coreIds.includes(s.id))
  return finish(catalog, situations, careers, coreIds, (lang, sit) => {
    const i = coreSitDefs.findIndex((s) => s.id === sit)
    if (i >= 0) {
      const offset = coreSitDefs.slice(0, i).reduce((n, s) => n + s.phrases.length, 0)
      const n = coreSitDefs[i]!.phrases.length
      const texts = splitTexts(core[lang])
      if (!texts.length) return null
      return {
        texts: texts.slice(offset, offset + n),
        roms: splitTexts(coreRom[lang]).slice(offset, offset + n),
      }
    }
    const t = travel[lang]?.[sit]
    return t ? { texts: splitTexts(t), roms: splitTexts(travelRom[lang]?.[sit]) } : null
  })
}

type Expand = (langId: string, situationId: string) => { texts: string[]; roms: string[] } | null

function finish(
  catalog: CatalogEntry[],
  situations: SituationEntry[],
  careers: CareerEntry[],
  coreIds: readonly string[],
  expand: Expand,
): ContentData {
  const sitDocs: SituationDoc[] = situations.map((s, i) => ({
    _id: s.id,
    title: s.title,
    emoji: s.emoji,
    blurb: s.blurb ?? '',
    gradient: s.gradient ?? '',
    order: i,
    kind: coreIds.includes(s.id) ? 'core' : 'travel',
    phrases: s.phrases.map((p, j) => ({ id: p.id, english: p.english, picture: p.picture, order: j })),
  }))
  const errors: string[] = []
  const phrases: ContentData['phrases'] = []
  const available = new Map<string, string[]>()

  for (const lang of catalog) {
    const avail: string[] = []
    const add = (sit: SituationDoc, texts: string[], roms: string[]) => {
      if (texts.length !== sit.phrases.length) {
        errors.push(`${lang.id}/${sit._id}: ${texts.length} texts for ${sit.phrases.length} phrases`)
        return
      }
      avail.push(sit._id)
      sit.phrases.forEach((def, j) => {
        const text = texts[j]!
        const rom = roms[j]
        phrases.push({
          langId: lang.id,
          situationId: sit._id,
          phraseId: def.id,
          key: `${lang.id}:${def.id}`,
          text,
          ...(rom ? { romanization: rom } : {}),
          meaning: def.english,
          picture: def.picture,
          order: j,
          wordPieces: wordPieces(text, lang.speechCode),
        })
      })
    }
    for (const sit of sitDocs) {
      const got = expand(lang.id, sit._id)
      if (got) add(sit, got.texts, got.roms)
      else if (sit.kind === 'core') errors.push(`${lang.id}: missing ${sit._id} phrases`)
    }
    available.set(lang.id, avail)
  }
  if (errors.length) throw new Error(`Content does not line up:\n  ${errors.join('\n  ')}`)

  const sorted = [...catalog].sort(
    (a, b) => Number(!!b.featured) - Number(!!a.featured) || a.name.localeCompare(b.name, 'en'),
  )
  const languages: LanguageDoc[] = catalog.map((l) => {
    if (!(REGIONS as readonly string[]).includes(l.region))
      throw new Error(`catalog.ts: ${l.id} has unknown region "${l.region}"`)
    return {
      _id: l.id,
      name: l.name,
      nativeName: l.nativeName,
      flag: l.flag,
      speechCode: l.speechCode,
      region: l.region as LanguageDoc['region'],
      latin: !!l.latin,
      featured: !!l.featured,
      community: !!l.community,
      sortKey: sorted.findIndex((x) => x.id === l.id),
      phraseCount: phrases.filter((p) => p.langId === l.id).length,
      availableSituationIds: available.get(l.id) ?? [],
      isActive: true,
    }
  })

  const careerLanguages: CareerLanguageDoc[] = careers.map((c) => {
    const { id, lessons, ...rest } = c
    return { ...rest, _id: id, lessons: lessons.map((l, i) => ({ ...l, order: i })) } as CareerLanguageDoc
  })
  return { languages, situations: sitDocs, phrases, careerLanguages }
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`
  if (isObj(v))
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(v[k])}`)
      .join(',')}}`
  return JSON.stringify(v) ?? 'null'
}
export const contentHash = (d: ContentData) => createHash('sha256').update(stable(d)).digest('hex')
export const docHash = (d: unknown) => createHash('sha1').update(stable(d)).digest('hex')
