/** Lowercase, strip accents and punctuation: identical to the web app's `normalize` (src/lib/text.ts). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
export function graphemeLength(s: string): number {
  let n = 0
  for (const _ of graphemes.segment(s)) n++
  return n
}

/**
 * Word pieces for the Word builder test: identical to the web app's `words()` helper —
 * Intl.Segmenter word segmentation with the language's speech code (handles Chinese, Thai…),
 * keeping only word-like segments.
 */
export function wordPieces(text: string, speechCode: string): string[] {
  const segs = Array.from(new Intl.Segmenter(speechCode, { granularity: 'word' }).segment(text))
  return segs.filter((s) => s.isWordLike).map((s) => s.segment)
}
