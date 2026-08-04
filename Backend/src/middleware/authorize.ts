import { Request, Response, NextFunction } from 'express';
import { supabase } from '../utils/supabase';
import { AppError } from '../utils/errors';

export type UserRole = 'POSTER' | 'TASKER' | 'ADMIN';

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

    const { data: profile } = await supabase
      .from('Profile')
      .select('*')
      .eq('userId', req.user.id)
      .single();

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
