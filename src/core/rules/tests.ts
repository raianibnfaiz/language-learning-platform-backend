import { XP, type TestN } from './constants.js'

export function starsFor(correct: number, total: number): 0 | 1 | 2 | 3 {
  const pct = total ? correct / total : 0
  return pct >= 1 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0
}

/** Test n is unlocked when n === 1 or bestStars(n-1) >= 1 */
export function isTestUnlocked(n: number, stars: (n: number) => number): boolean {
  return n === 1 || stars(n - 1) >= 1
}

export function maxComboBonuses(correct: number): number {
  return Math.floor(correct / XP.COMBO_EVERY)
}

export function testXp(test: TestN, correct: number, comboBonuses: number): number {
  return correct * XP.TEST[test] + comboBonuses * XP.COMBO_BONUS
}

export function isTestN(n: number): n is TestN {
  return n === 1 || n === 2 || n === 3 || n === 4
}
