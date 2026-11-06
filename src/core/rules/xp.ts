/** XP never goes below 0, total or per day. */
export function clampXp(current: number, delta: number): number {
  return Math.max(0, current + delta)
}
