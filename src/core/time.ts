/** Local-calendar-day helpers. A "day" is always a 'YYYY-MM-DD' string in the learner's IANA timezone. */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

let zoneSet: Set<string> | undefined
export function isValidTimezone(tz: string): boolean {
  zoneSet ??= new Set(Intl.supportedValuesOf('timeZone'))
  if (zoneSet.has(tz) || tz === 'UTC') return true
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false
  const d = new Date(`${day}T00:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day
}

const formatters = new Map<string, Intl.DateTimeFormat>()
/** The calendar day of `at` in timezone `tz`. */
export function dayInTz(at: Date, tz: string): string {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    formatters.set(tz, f)
  }
  return f.format(at)
}

export function todayIn(tz: string, now: Date = new Date()): string {
  return dayInTz(now, tz)
}

/** Pure calendar arithmetic on 'YYYY-MM-DD' (no timezone involved, so DST can never shift it). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`)
  return new Date(d.getTime() + n * MS_PER_DAY).toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  return Math.round(
    (new Date(`${a}T00:00:00.000Z`).getTime() - new Date(`${b}T00:00:00.000Z`).getTime()) / MS_PER_DAY,
  )
}

export const OFFLINE_THRESHOLD_MS = 60 * 60 * 1000
export const MAX_BACKDATE_DAYS = 30

/**
 * §4: accept a localDay within today ±1 in the learner's timezone; older days only for ops created
 * offline (occurredAt more than 1 hour ago), up to 30 days back.
 */
export function isLocalDayAcceptable(
  localDay: string,
  tz: string,
  occurredAt: Date,
  now: Date = new Date(),
): boolean {
  if (!isValidDay(localDay)) return false
  const today = todayIn(tz, now)
  const delta = diffDays(localDay, today)
  if (delta > 1) return false
  if (delta >= -1) return true
  const offline = now.getTime() - occurredAt.getTime() > OFFLINE_THRESHOLD_MS
  return offline && delta >= -MAX_BACKDATE_DAYS
}
