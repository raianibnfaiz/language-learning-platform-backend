/** Accent-insensitive search normalisation (same as the clients' `normalize`). */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
export function graphemeLength(s: string): number {
  let n = 0
  for (const _ of graphemes.segment(s)) n++
  return n
}

/** Scripts written without spaces between words. */
const NO_SPACE_LANGS = new Set(['zh', 'ja', 'th', 'km', 'my'])

const EDGE_PUNCT = /^[^\p{L}\p{M}\p{N}'-]+|[^\p{L}\p{M}\p{N}'-]+$/gu

/**
 * Word pieces for the Word builder test: Intl.Segmenter for scripts without spaces,
 * whitespace splitting otherwise (punctuation trimmed from each piece).
 */
export function wordPieces(text: string, speechCode: string): string[] {
  const lang = speechCode.split('-')[0]?.toLowerCase() ?? ''
  if (NO_SPACE_LANGS.has(lang)) {
    const seg = new Intl.Segmenter(speechCode, { granularity: 'word' })
    return [...seg.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment)
  }
  return text
    .split(/\s+/u)
    .map((w) => w.replace(EDGE_PUNCT, ''))
    .filter((w) => w.length > 0)
}
