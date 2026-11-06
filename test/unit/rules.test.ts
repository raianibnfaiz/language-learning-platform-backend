import { describe, expect, it } from 'vitest'
import {
  DAILY_GOAL_XP,
  MASTERED_BOX,
  RECENT_LIMIT,
  REVIEW_INTERVALS,
  TESTS_PER_SITUATION,
  XP,
  activeDays,
  answerReview,
  clampXp,
  isDue,
  isTestN,
  isTestUnlocked,
  levelFor,
  maxComboBonuses,
  newCard,
  starsFor,
  streak,
  testXp,
} from '../../src/core/rules/index.js'
import { dayInTz } from '../../src/core/time.js'

describe('constants match the clients', () => {
  it('XP table', () => {
    expect(XP).toEqual({
      FIRST_LISTEN: 2,
      GOOD_SPEAK: 5,
      TEST: { 1: 5, 2: 8, 3: 12, 4: 15 },
      COMBO_BONUS: 5,
      COMBO_EVERY: 3,
      REVIEW_RECALL: 5,
      LESSON: 50,
      PRACTICE_CORRECT: 10,
    })
    expect([DAILY_GOAL_XP, MASTERED_BOX, RECENT_LIMIT, TESTS_PER_SITUATION]).toEqual([50, 6, 6, 4])
    expect(REVIEW_INTERVALS).toEqual([0, 1, 3, 7, 14, 30])
  })
})

describe('levelFor (100, 150, 200, …)', () => {
  it.each([
    [0, 1, 0, 100],
    [99, 1, 99, 100],
    [100, 2, 0, 150],
    [249, 2, 149, 150],
    [250, 3, 0, 200],
    [450, 4, 0, 250],
    [1290, 6, 290, 350],
    [1000, 6, 0, 350],
  ])('xp %i -> level %i (%i/%i)', (xp, level, into, need) => {
    expect(levelFor(xp)).toEqual({ level, into, need })
  })
})

describe('starsFor', () => {
  it.each([
    [6, 6, 3],
    [5, 6, 2],
    [7, 10, 2],
    [4, 6, 1],
    [3, 6, 1],
    [5, 10, 1],
    [2, 6, 0],
    [0, 6, 0],
    [0, 0, 0],
    [4, 5, 2],
    [3, 5, 1],
    [2, 5, 0],
  ])('%i/%i -> %i stars', (c, t, s) => expect(starsFor(c, t)).toBe(s))
})

describe('tests', () => {
  it('unlock: test 1 always, n needs >= 1 star on n-1', () => {
    const stars = { 1: 1, 2: 0, 3: 3 } as Record<number, number>
    const get = (n: number) => stars[n] ?? 0
    expect([1, 2, 3, 4].map((n) => isTestUnlocked(n, get))).toEqual([true, true, false, true])
  })
  it('xp and combos', () => {
    expect(testXp(1, 6, 2)).toBe(40)
    expect(testXp(4, 5, 1)).toBe(80)
    expect([0, 2, 3, 5, 6].map(maxComboBonuses)).toEqual([0, 0, 1, 1, 2])
    expect([0, 1, 4, 5].map(isTestN)).toEqual([false, true, true, false])
  })
})

describe('Leitner', () => {
  const today = '2026-11-06'
  it.each([
    [0, true, { box: 1, due: '2026-11-07' }],
    [1, true, { box: 2, due: '2026-11-09' }],
    [2, true, { box: 3, due: '2026-11-13' }],
    [3, true, { box: 4, due: '2026-11-20' }],
    [4, true, { box: 5, due: '2026-12-06' }],
    [5, true, null],
    [3, false, { box: 0, due: today }],
  ])('box %i, knewIt=%s', (box, knewIt, out) =>
    expect(answerReview({ box, due: today }, knewIt, today)).toEqual(out),
  )
  it('new cards are due today', () => {
    expect(newCard(today)).toEqual({ box: 0, due: today })
    expect(isDue({ box: 2, due: '2026-11-06' }, today)).toBe(true)
    expect(isDue({ box: 2, due: '2026-11-07' }, today)).toBe(false)
  })
})

describe('streak', () => {
  const s = (days: string[], today: string) => streak(new Set(days), today)
  it.each([
    ['no activity', [], '2026-11-06', 0],
    ['today only', ['2026-11-06'], '2026-11-06', 1],
    ['no XP today yet: counts from yesterday', ['2026-11-04', '2026-11-05'], '2026-11-06', 2],
    ['gap yesterday breaks it', ['2026-11-04', '2026-11-06'], '2026-11-06', 1],
    ['gap yesterday and none today', ['2026-11-03', '2026-11-04'], '2026-11-06', 0],
    ['month boundary', ['2026-10-30', '2026-10-31', '2026-11-01'], '2026-11-01', 3],
    ['year boundary', ['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01', 3],
    ['leap day', ['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01', 3],
  ])('%s', (_name, days, today, expected) => expect(s(days, today)).toBe(expected))

  it('DST change days in Europe/Berlin count as one calendar day each', () => {
    // 2026-03-29 has 23 hours and 2026-10-25 has 25 hours in Berlin
    const spring = ['2026-03-28T22:30:00Z', '2026-03-29T21:30:00Z', '2026-03-30T06:00:00Z'].map((t) =>
      dayInTz(new Date(t), 'Europe/Berlin'),
    )
    expect(spring).toEqual(['2026-03-28', '2026-03-29', '2026-03-30'])
    expect(s(spring, '2026-03-30')).toBe(3)
    const autumn = ['2026-10-24T21:59:00Z', '2026-10-25T22:30:00Z'].map((t) =>
      dayInTz(new Date(t), 'Europe/Berlin'),
    )
    expect(autumn).toEqual(['2026-10-24', '2026-10-25'])
    expect(s(autumn, dayInTz(new Date('2026-10-26T08:00:00Z'), 'Europe/Berlin'))).toBe(2)
  })

  it('activeDays keeps days with XP > 0', () => {
    expect([...activeDays({ '2026-11-01': 0, '2026-11-02': 5 })]).toEqual(['2026-11-02'])
  })
})

describe('xp clamp', () => {
  it('never below 0', () => {
    expect(clampXp(30, -50)).toBe(0)
    expect(clampXp(30, 20)).toBe(50)
  })
})
