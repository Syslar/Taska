import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';

/**
 * authorize — Role-check middleware factory. Call after `authenticate`.
 * Loads the user's Profile from the database and checks the role.
 * Caches the profile on req.profile for downstream use.
 *
 * Usage:
 *   router.post('/tasks', authenticate, authorize('POSTER'), asyncHandler(createTask));
 *   router.post('/tasks/:id/apply', authenticate, authorize('TASKER'), asyncHandler(apply));
 */
export function authorize(...allowedRoles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(new AppError('Not authenticated', 401));
    }

    const profile = await prisma.profile.findUnique({
      where: { userId: req.user.id },
    });

    if (!profile) {
      return next(new AppError('Profile not found. Complete registration first.', 403));
    }

    if (!allowedRoles.includes(profile.role)) {
      return next(
        new AppError(
          `Access denied. Required role: ${allowedRoles.join(' or ')}`,
          403
        )
      );
    }

    // Attach profile to request for use in controllers (avoids a second DB call)
    req.profile = profile;
    next();
  };
}
