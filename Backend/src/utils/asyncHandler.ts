import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * asyncHandler — Wraps an async route handler to forward errors to Express's
 * next(err) instead of requiring try/catch in every controller.
 *
 * Usage:
 *   router.get('/me', asyncHandler(profileController.getMe));
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
