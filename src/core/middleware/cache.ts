import type { NextFunction, Request, Response } from 'express'

export function noStore(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store')
  next()
}

export const PUBLIC_CACHE = 'public, max-age=300, stale-while-revalidate=86400'

/** Sets ETag + public caching; returns true (and sends 304) when the client's copy is current. */
export function handleConditional(req: Request, res: Response, etag: string): boolean {
  res.setHeader('ETag', etag)
  res.setHeader('Cache-Control', PUBLIC_CACHE)
  const inm = req.get('if-none-match')
  if (inm && inm.split(',').some((t) => t.trim() === etag || t.trim() === '*')) {
    res.status(304).end()
    return true
  }
  return false
}
