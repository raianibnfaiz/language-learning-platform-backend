import { createHash } from 'node:crypto'
import type { Types } from 'mongoose'
import { env } from '../../config/env.js'
import { AppError } from '../../core/errors.js'
import { normalize } from '../../core/text.js'
import { trusted } from '../../db/plugins.js'
import { todayIn } from '../../core/time.js'
import { TranslationModel, TranslationUsageModel } from './translation.model.js'

/** (phase 2) Pluggable machine-translation provider. */
export interface TranslationProvider {
  readonly name: string
  supportedTargets(): Promise<string[]>
  translate(
    items: { id: string; text: string }[],
    opts: {
      sourceLang: string
      targetLang: string
      mode: 'sentence' | 'paragraph'
      preserveTerms?: string[] | undefined
    },
  ): Promise<string[]>
}

class NotConfiguredProvider implements TranslationProvider {
  constructor(readonly name: string) {}
  async supportedTargets(): Promise<string[]> {
    throw new AppError('NOT_ENABLED', `Translation provider "${this.name}" is not implemented yet`)
  }
  async translate(): Promise<string[]> {
    throw new AppError('NOT_ENABLED', `Translation provider "${this.name}" is not implemented yet`)
  }
}

export function getProvider(): TranslationProvider | null {
  if (env.TRANSLATION_PROVIDER === 'none') return null
  // deepl | google | llm adapters plug in here.
  return new NotConfiguredProvider(env.TRANSLATION_PROVIDER)
}

function requireProvider(): TranslationProvider {
  const p = getProvider()
  if (!p) throw new AppError('NOT_ENABLED', 'Translation is not enabled on this server')
  return p
}

export const MAX_CHARS_PER_REQUEST = 5000
export const sourceHash = (text: string) => createHash('sha256').update(normalize(text)).digest('hex')

export async function supportedLanguages() {
  return requireProvider().supportedTargets()
}

export async function translate(
  userId: Types.ObjectId,
  tz: string,
  input: {
    items: { id: string; text: string }[]
    sourceLang: string
    targetLang: string
    mode: 'sentence' | 'paragraph'
    preserveTerms?: string[] | undefined
  },
) {
  const provider = requireProvider()
  const chars = input.items.reduce((n, i) => n + i.text.length, 0)
  if (chars > MAX_CHARS_PER_REQUEST)
    throw new AppError('VALIDATION_ERROR', `max ${MAX_CHARS_PER_REQUEST} characters per request`, {
      status: 422,
    })

  const hashes = input.items.map((i) => sourceHash(i.text))
  const cached = await TranslationModel.find({
    sourceHash: trusted({ $in: hashes }),
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
  }).lean()
  const byHash = new Map(cached.map((c) => [c.sourceHash, c.text]))
  const missing = input.items.filter((_, i) => !byHash.has(hashes[i]!))
  const missingChars = missing.reduce((n, i) => n + i.text.length, 0)

  if (missing.length) {
    const day = todayIn(tz)
    const usage = await TranslationUsageModel.findOneAndUpdate(
      { userId, day },
      { $inc: { chars: missingChars } },
      { upsert: true, new: true, lean: true },
    )
    if ((usage?.chars ?? 0) > env.TRANSLATION_DAILY_CHAR_LIMIT) {
      await TranslationUsageModel.updateOne({ userId, day }, { $inc: { chars: -missingChars } })
      throw new AppError('RATE_LIMITED', 'Daily translation quota reached')
    }
    const out = await provider.translate(missing, input)
    await Promise.all(
      missing.map((m, i) =>
        TranslationModel.updateOne(
          { sourceHash: sourceHash(m.text), sourceLang: input.sourceLang, targetLang: input.targetLang },
          { $setOnInsert: { text: out[i] ?? '', provider: provider.name } },
          { upsert: true },
        ),
      ),
    )
    missing.forEach((m, i) => byHash.set(sourceHash(m.text), out[i] ?? ''))
  }
  return input.items.map((item, i) => ({ id: item.id, text: byHash.get(hashes[i]!) ?? '' }))
}
