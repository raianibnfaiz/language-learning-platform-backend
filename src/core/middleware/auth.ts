import type { NextFunction, Request, Response } from 'express'
import { Types } from 'mongoose'
import { AppError } from '../errors.js'
import { verifyAccessToken } from '../../modules/auth/tokens.js'
import { UserModel } from '../../modules/users/user.model.js'
import { SessionModel } from '../../modules/auth/session.model.js'

/**
 * Verifies the Bearer access token, then checks the user (active, not deleted, tokenVersion) and
 * that the session family was not revoked (logout, reuse detection, device removal).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.get('authorization')
  if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHENTICATED', 'Missing access token')
  const claims = verifyAccessToken(header.slice(7).trim())
  if (!Types.ObjectId.isValid(claims.sub) || !Types.ObjectId.isValid(claims.sid))
    throw new AppError('UNAUTHENTICATED', 'Invalid access token')

  const [user, session] = await Promise.all([
    UserModel.findById(claims.sub, { status: 1, tokenVersion: 1, deletedAt: 1, role: 1 }).lean(),
    SessionModel.findById(claims.sid, { revokedReason: 1, userId: 1 }).lean(),
  ])
  if (!user || user.deletedAt || user.status !== 'active')
    throw new AppError('UNAUTHENTICATED', 'Account unavailable')
  if (user.tokenVersion !== claims.tv) throw new AppError('TOKEN_REVOKED', 'Session was revoked')
  if (
    !session ||
    !session.userId.equals(user._id) ||
    (session.revokedReason && session.revokedReason !== 'rotated')
  )
    throw new AppError('TOKEN_REVOKED', 'Session was revoked')

  req.user = {
    id: claims.sub,
    role: user.role,
    sessionId: claims.sid,
    tokenVersion: claims.tv,
    ...(claims.iat ? { iat: claims.iat } : {}),
  }
  next()
}

export function requireRole(role: 'admin') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) throw new AppError('FORBIDDEN', 'Admin only')
    next()
  }
}

export function userId(req: Request): Types.ObjectId {
  if (!req.user) throw new AppError('UNAUTHENTICATED')
  return new Types.ObjectId(req.user.id)
}
