export const XP = {
  FIRST_LISTEN: 2, // first time a phrase key is heard
  GOOD_SPEAK: 5, // mic match >= 70%
  TEST: { 1: 5, 2: 8, 3: 12, 4: 15 } as const, // per correct answer
  COMBO_BONUS: 5, // every 3rd correct answer in a row inside a test
  COMBO_EVERY: 3,
  REVIEW_RECALL: 5, // review "Got it"
  LESSON: 50, // ticking a career lesson (unticking = -50)
  PRACTICE_CORRECT: 10, // practice quiz correct answer
} as const

export type TestN = 1 | 2 | 3 | 4

export const DAILY_GOAL_XP = 50
export const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30] as const // days, by Leitner box
export const MASTERED_BOX = 6 // reaching it removes the card
export const RECENT_LIMIT = 6
export const TESTS_PER_SITUATION = 4
export const GOOD_SPEAK_THRESHOLD = 0.7
export const PRACTICE_MAX_TOTAL = 20
export const ACTIVITY_WINDOW_DAYS = 400
