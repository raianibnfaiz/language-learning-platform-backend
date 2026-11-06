import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildContent, contentHash, loadSourceModules } from '../../src/db/seed/source.js'
import { assertCounts, countsOf } from '../../src/db/seed/seed.js'

const dir = path.resolve('test/fixtures/source-data')

describe('seed source expansion', () => {
  it('expands core + travel texts into one document per phrase', async () => {
    const data = buildContent(await loadSourceModules(dir))
    expect(countsOf(data)).toEqual({
      languages: 3,
      situations: 7,
      phrases: 86,
      careerLanguages: 2,
      lessons: 12,
    })
    const ja = data.phrases.find((p) => p.key === 'japanese:toilet')!
    expect(ja).toMatchObject({
      situationId: 'getting-by',
      text: 'トイレはどこですか',
      romanization: 'toire wa doko desu ka',
      meaning: 'Where is the toilet?',
      picture: '🚻',
      order: 3,
    })
    expect(data.languages.find((l) => l._id === 'japanese')).toMatchObject({
      phraseCount: 12,
      availableSituationIds: ['first-words', 'getting-by'],
      sortKey: 2,
    })
    expect(data.languages.find((l) => l._id === 'english')).toMatchObject({ sortKey: 0, phraseCount: 37 })
    expect(data.situations.map((s) => s.kind)).toEqual([
      'core',
      'core',
      'travel',
      'travel',
      'travel',
      'travel',
      'travel',
    ])
    expect(data.careerLanguages[0]!.lessons[5]).toMatchObject({ id: 'en-6', order: 5 })
    expect(contentHash(data)).toBe(contentHash(buildContent(await loadSourceModules(dir))))
  })

  it('fails loudly when texts do not line up or counts are wrong', async () => {
    const mods = await loadSourceModules(dir)
    const broken = {
      ...mods,
      phrases: { ...mods.phrases, core: { ...(mods.phrases.core as object), spanish: 'Hola|Adiós' } },
    }
    expect(() => buildContent(broken)).toThrow(/spanish\/first-words: 2 texts for 6 phrases/)
    expect(() => assertCounts(countsOf(buildContent(mods)))).toThrow(/languages = 3 \(expected 54\)/)
    await expect(loadSourceModules('/nonexistent')).rejects.toThrow(/Copy the client's catalog.ts/)
  })
})
