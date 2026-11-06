import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { AppError } from '../errors.js'
import { isProd } from '../../config/env.js'
import { logger } from '../../config/logger.js'

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof ZodError) {
    return new AppError('VALIDATION_ERROR', 'Request validation failed', {
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    })
  }
  if (err instanceof jwt.TokenExpiredError) return new AppError('TOKEN_EXPIRED', 'Access token expired')
  if (err instanceof jwt.JsonWebTokenError) return new AppError('UNAUTHENTICATED', 'Invalid access token')
  if (err instanceof mongoose.Error.CastError) return new AppError('VALIDATION_ERROR', `Invalid ${err.path}`)
  if (err instanceof mongoose.Error.ValidationError)
    return new AppError('VALIDATION_ERROR', 'Invalid data', {
      details: Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    })
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: unknown; type?: unknown; status?: unknown }
    if (e.code === 11000) return new AppError('CONFLICT', 'Duplicate value')
    if (e.type === 'entity.too.large')
      return new AppError('VALIDATION_ERROR', 'Request body too large', { status: 413 })
    if (e.type === 'entity.parse.failed') return new AppError('VALIDATION_ERROR', 'Malformed JSON body')
    if (e.type === 'encoding.unsupported' || e.type === 'charset.unsupported')
      return new AppError('VALIDATION_ERROR', 'Unsupported body encoding')
  }
  return new AppError('INTERNAL', 'Something went wrong')
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appErr = toAppError(err)
  if (appErr.status >= 500 && appErr.code !== 'NOT_ENABLED') {
    logger.error({ err, requestId: req.id, route: req.originalUrl }, 'unhandled error')
  }
  if (res.headersSent) return
  const body: Record<string, unknown> = {
    code: appErr.code,
    message: appErr.code === 'INTERNAL' && isProd ? 'Something went wrong' : appErr.message,
    requestId: req.id,
  }
  if (appErr.details !== undefined) body.details = appErr.details
  res.status(appErr.status).json({ error: body })
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', `Route ${req.method} ${req.path} not found`))
}
