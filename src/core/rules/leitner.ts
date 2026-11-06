import { addDays } from '../time.js'
import { MASTERED_BOX, REVIEW_INTERVALS } from './constants.js'

export interface ReviewCard {
  box: number
  due: string
}

export function newCard(today: string): ReviewCard {
  return { box: 0, due: today }
}

/** Leitner answer: knewIt -> box+1 due today+interval[box+1]; else box 0 due today. box >= 6 -> remove */
export function answerReview(card: ReviewCard, knewIt: boolean, today: string): ReviewCard | null {
  if (!knewIt) return { box: 0, due: today }
  const box = card.box + 1
  if (box >= MASTERED_BOX) return null
  return { box, due: addDays(today, REVIEW_INTERVALS[box]!) }
}

export function isDue(card: ReviewCard, today: string): boolean {
  return card.due <= today
}
