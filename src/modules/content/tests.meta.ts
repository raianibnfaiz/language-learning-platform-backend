import { XP, type TestN } from '../../core/rules/constants.js'

export interface TestMeta {
  n: TestN
  title: string
  emoji: string
  hint: string
  xp: number
}

/**
 * Mirrors `src/data/phrasebook/tests.ts` in the web app. Titles and XP come from the spec;
 * TODO(content): copy the exact emoji + hint strings from the web app's tests.ts when available.
 */
export const TESTS: readonly TestMeta[] = [
  { n: 1, title: 'Picture match', emoji: '🖼️', hint: 'Match each phrase to its picture', xp: XP.TEST[1] },
  { n: 2, title: 'Sharp ears', emoji: '👂', hint: 'Listen and pick what you heard', xp: XP.TEST[2] },
  { n: 3, title: 'Word builder', emoji: '🧩', hint: 'Put the words in the right order', xp: XP.TEST[3] },
  { n: 4, title: 'Fill the gap', emoji: '✍️', hint: 'Type the missing word', xp: XP.TEST[4] },
]
