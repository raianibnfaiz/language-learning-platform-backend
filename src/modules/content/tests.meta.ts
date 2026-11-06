import { XP, type TestN } from '../../core/rules/constants.js'

export interface TestMeta {
  n: TestN
  title: string
  emoji: string
  hint: string
  xp: number
}

/** Mirrors `src/data/phrasebook/tests.ts` in the web app (copied in source-data/tests.ts). */
export const TESTS: readonly TestMeta[] = [
  {
    n: 1,
    title: 'Picture match',
    emoji: '🖼️',
    hint: 'Listen, then tap the matching picture.',
    xp: XP.TEST[1],
  },
  { n: 2, title: 'Sharp ears', emoji: '👂', hint: 'Listen, then pick the phrase you heard.', xp: XP.TEST[2] },
  { n: 3, title: 'Word builder', emoji: '🧩', hint: 'Put the pieces in the right order.', xp: XP.TEST[3] },
  { n: 4, title: 'Fill the gap', emoji: '✍️', hint: 'Type or spell the missing word.', xp: XP.TEST[4] },
]
