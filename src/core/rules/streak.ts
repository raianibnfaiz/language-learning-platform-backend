import { addDays } from '../time.js'

/**
 * Consecutive days with XP > 0 counting back from the user's local today.
 * If today has no XP yet, start from yesterday (today never breaks a streak).
 */
export function streak(activityDays: Set<string>, today: string): number {
  let day = activityDays.has(today) ? today : addDays(today, -1)
  let count = 0
  while (activityDays.has(day)) {
    count++
    day = addDays(day, -1)
  }
  return count
}

/** Convenience: build the set of active days from an activity map. */
export function activeDays(activity: Record<string, number>): Set<string> {
  return new Set(
    Object.entries(activity)
      .filter(([, xp]) => xp > 0)
      .map(([d]) => d),
  )
}
