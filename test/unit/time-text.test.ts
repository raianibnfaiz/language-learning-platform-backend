import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayInTz,
  diffDays,
  isLocalDayAcceptable,
  isValidDay,
  isValidTimezone,
  todayIn,
} from '../../src/core/time.js'
import { graphemeLength, normalize, wordPieces } from '../../src/core/text.js'
import { compareSemver } from '../../src/core/middleware/clientInfo.js'

describe('time', () => {
  it('validates days and timezones', () => {
    expect(['2026-02-28', '2028-02-29'].map(isValidDay)).toEqual([true, true])
    expect(['2026-02-29', '2026-13-01', '26-01-01', 'yesterday'].map(isValidDay)).toEqual([
      false,
      false,
      false,
      false,
    ])
    expect(['Asia/Dhaka', 'Europe/Berlin', 'UTC'].map(isValidTimezone)).toEqual([true, true, true])
    expect(isValidTimezone('Mars/Olympus')).toBe(false)
  })

  it('computes local days per timezone', () => {
    const at = new Date('2026-11-05T20:30:00Z')
    expect(dayInTz(at, 'Asia/Dhaka')).toBe('2026-11-06')
    expect(dayInTz(at, 'America/Los_Angeles')).toBe('2026-11-05')
    expect(todayIn('UTC', at)).toBe('2026-11-05')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(diffDays('2026-11-06', '2026-10-07')).toBe(30)
  })

  it('accepts today ±1, and older days only for offline ops up to 30 days', () => {
    const now = new Date('2026-11-06T12:00:00Z')
    const fresh = new Date('2026-11-06T11:59:00Z')
    const offline = new Date('2026-11-01T12:00:00Z')
    expect(isLocalDayAcceptable('2026-11-06', 'UTC', fresh, now)).toBe(true)
    expect(isLocalDayAcceptable('2026-11-07', 'UTC', fresh, now)).toBe(true)
    expect(isLocalDayAcceptable('2026-11-05', 'UTC', fresh, now)).toBe(true)
    expect(isLocalDayAcceptable('2026-11-08', 'UTC', fresh, now)).toBe(false)
    expect(isLocalDayAcceptable('2026-11-01', 'UTC', fresh, now)).toBe(false)
    expect(isLocalDayAcceptable('2026-11-01', 'UTC', offline, now)).toBe(true)
    expect(isLocalDayAcceptable('2026-10-07', 'UTC', offline, now)).toBe(true)
    expect(isLocalDayAcceptable('2026-10-06', 'UTC', offline, now)).toBe(false)
    expect(isLocalDayAcceptable('not-a-day', 'UTC', offline, now)).toBe(false)
    // travellers: Kiribati is already on the 7th
    expect(isLocalDayAcceptable('2026-11-08', 'Pacific/Kiritimati', fresh, now)).toBe(true)
  })
})

describe('text', () => {
  it('normalises accents and case like the clients', () => {
    expect(normalize('  ¿Dónde ESTÁ?  ')).toBe('¿donde esta?')
    expect(normalize('Ça va')).toBe('ca va')
  })
  it('counts graphemes, not code units', () => {
    expect(graphemeLength('👨‍👩‍👧')).toBe(1)
    expect(graphemeLength('নমস্কার')).toBeLessThan('নমস্কার'.length)
  })
  it('segments scripts without spaces, splits the rest on whitespace', () => {
    expect(wordPieces('¿Dónde está el baño?', 'es-ES')).toEqual(['Dónde', 'está', 'el', 'baño'])
    expect(wordPieces("I don't understand", 'en-GB')).toEqual(['I', "don't", 'understand'])
    expect(wordPieces('トイレはどこですか', 'ja-JP').join('')).toBe('トイレはどこですか')
    expect(wordPieces('トイレはどこですか', 'ja-JP').length).toBeGreaterThan(1)
    expect(wordPieces('我不明白', 'zh-CN').length).toBeGreaterThan(1)
  })
  it('compares semver', () => {
    expect(compareSemver('1.2.0', '1.10.0')).toBe(-1)
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })
})
