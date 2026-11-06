import path from 'node:path'
import { env } from '../../config/env.js'
import type { Model } from 'mongoose'
import { trusted } from '../plugins.js'
import {
  CareerLanguageModel,
  ContentMetaModel,
  LanguageModel,
  PhraseModel,
  SituationModel,
} from '../../modules/content/content.model.js'
import {
  buildContent,
  contentHash,
  docHash,
  loadSourceModules,
  type ContentData,
  type SourceModules,
} from './source.js'

export const EXPECTED_COUNTS = {
  languages: 54,
  situations: 7,
  phrases: 773,
  careerLanguages: 5,
  lessons: 30,
} as const
export type Counts = { [K in keyof typeof EXPECTED_COUNTS]: number }

export interface CollectionDiff {
  added: string[]
  updated: string[]
  removed: string[]
}
export interface SeedReport {
  dryRun: boolean
  changed: boolean
  previousVersion: number
  version: number
  hash: string
  counts: Counts
  diff: Record<'languages' | 'situations' | 'phrases' | 'careerLanguages', CollectionDiff>
}

export function countsOf(d: ContentData): Counts {
  return {
    languages: d.languages.length,
    situations: d.situations.length,
    phrases: d.phrases.length,
    careerLanguages: d.careerLanguages.length,
    lessons: d.careerLanguages.reduce((n, c) => n + c.lessons.length, 0),
  }
}

export function assertCounts(counts: Counts, expected: Counts = EXPECTED_COUNTS): void {
  const bad = (Object.keys(expected) as (keyof Counts)[]).filter((k) => counts[k] !== expected[k])
  if (bad.length)
    throw new Error(
      `Seed assertion failed: ${bad.map((k) => `${k} = ${counts[k]} (expected ${expected[k]})`).join(', ')}`,
    )
}

type Row = { id: string; doc: Record<string, unknown> }

async function diffAndApply(
  model: Model<never>,
  idField: '_id' | 'key',
  rows: Row[],
  dryRun: boolean,
  extra: (doc: Record<string, unknown>) => Record<string, unknown> = (d) => d,
): Promise<CollectionDiff> {
  const strip = (d: Record<string, unknown>) => {
    const { _id: _i, __v, createdAt: _c, updatedAt: _u, contentVersion: _cv, ...rest } = d
    return idField === '_id' ? { _id: d._id, ...rest } : rest
  }
  const existing = (await model.find({} as never).lean()) as unknown as Record<string, unknown>[]
  const byId = new Map(existing.map((d) => [String(d[idField]), docHash(strip(d))]))
  const diff: CollectionDiff = { added: [], updated: [], removed: [] }
  const ids = new Set(rows.map((r) => r.id))
  const ops: unknown[] = []
  for (const r of rows) {
    const h = byId.get(r.id)
    if (h === undefined) diff.added.push(r.id)
    else if (h !== docHash(strip(r.doc))) diff.updated.push(r.id)
    else continue
    ops.push({ replaceOne: { filter: { [idField]: r.id }, replacement: extra(r.doc), upsert: true } })
  }
  for (const id of byId.keys()) if (!ids.has(id)) diff.removed.push(id)
  if (!dryRun) {
    if (ops.length) await model.bulkWrite(ops as never)
    if (diff.removed.length) await model.deleteMany({ [idField]: trusted({ $in: diff.removed }) } as never)
  }
  return diff
}

/**
 * Upserts by id, removes stale docs, and bumps contentMeta.version only when the content hash changed.
 * `dryRun` computes the diff without writing (used by POST /admin/content/reseed).
 */
export async function seedContent(
  data: ContentData,
  opts: { dryRun?: boolean; expected?: Counts | false } = {},
): Promise<SeedReport> {
  const dryRun = opts.dryRun ?? false
  const counts = countsOf(data)
  if (opts.expected !== false) assertCounts(counts, opts.expected ?? EXPECTED_COUNTS)
  const hash = contentHash(data)
  const meta = await ContentMetaModel.findById('content').lean()
  const previousVersion = meta?.version ?? 0
  const changed = meta?.hash !== hash
  const version = changed ? previousVersion + 1 : previousVersion

  const diff = {
    languages: await diffAndApply(
      LanguageModel as never,
      '_id',
      data.languages.map((d) => ({ id: d._id, doc: { ...d } })),
      dryRun,
    ),
    situations: await diffAndApply(
      SituationModel as never,
      '_id',
      data.situations.map((d) => ({ id: d._id, doc: { ...d } })),
      dryRun,
    ),
    phrases: await diffAndApply(
      PhraseModel as never,
      'key',
      data.phrases.map((d) => ({ id: d.key, doc: { ...d } })),
      dryRun,
      (d) => ({ ...d, contentVersion: version }),
    ),
    careerLanguages: await diffAndApply(
      CareerLanguageModel as never,
      '_id',
      data.careerLanguages.map((d) => ({ id: d._id, doc: { ...d } })),
      dryRun,
    ),
  }
  if (!dryRun && changed)
    await ContentMetaModel.updateOne({ _id: 'content' }, { $set: { version, hash } }, { upsert: true })
  return { dryRun, changed, previousVersion, version, hash, counts, diff }
}

export async function seedFromSource(
  opts: { dir?: string; dryRun?: boolean; expected?: Counts | false; modules?: SourceModules } = {},
) {
  const modules = opts.modules ?? (await loadSourceModules(path.resolve(opts.dir ?? env.SOURCE_DATA_DIR)))
  const expected = opts.expected ?? (env.SEED_ASSERT_COUNTS ? EXPECTED_COUNTS : false)
  return seedContent(buildContent(modules), {
    ...(opts.dryRun !== undefined ? { dryRun: opts.dryRun } : {}),
    expected,
  })
}

export function summarizeReport(r: SeedReport): string {
  const lines = [
    `${r.dryRun ? '[dry run] ' : ''}content ${r.changed ? `v${r.previousVersion} -> v${r.version}` : `unchanged (v${r.version})`}  hash ${r.hash.slice(0, 12)}`,
    `counts: ${Object.entries(r.counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}`,
  ]
  for (const [name, d] of Object.entries(r.diff))
    lines.push(`${name}: +${d.added.length} ~${d.updated.length} -${d.removed.length}`)
  return lines.join('\n')
}
