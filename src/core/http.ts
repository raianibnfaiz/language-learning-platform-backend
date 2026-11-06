import type { Response } from 'express'

export interface Envelope<T, M = Record<string, unknown>> {
  data: T
  meta?: M
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  res.status(200).json(meta ? { data, meta } : { data })
}

export function created<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  res.status(201).json(meta ? { data, meta } : { data })
}

export function accepted<T>(res: Response, data: T): void {
  res.status(202).json({ data })
}

export function noContent(res: Response): void {
  res.status(204).end()
}

/** Opaque cursor helpers for cursor pagination (`?limit=50&cursor=…`). */
export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}
export function decodeCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined
  try {
    return Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    return undefined
  }
}

export function paginate<T>(items: T[], limit: number, cursorOf: (item: T) => string) {
  const hasMore = items.length > limit
  const page = hasMore ? items.slice(0, limit) : items
  const last = page[page.length - 1]
  return { items: page, nextCursor: hasMore && last !== undefined ? encodeCursor(cursorOf(last)) : null }
}
