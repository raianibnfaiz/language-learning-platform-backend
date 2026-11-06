/** Level curve: 100 XP for level 2, then +50 more per level (100, 150, 200, …). */
export function levelFor(xp: number): { level: number; into: number; need: number } {
  let level = 1
  let need = 100
  let left = xp
  while (left >= need) {
    left -= need
    level++
    need += 50
  }
  return { level, into: left, need }
}
