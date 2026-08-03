import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ─── POST /auth/register ──────────────────────────────────────────────────────

/**
 * Create a Profile record in our DB after Clerk authentication.
 * Called immediately after a successful signup on the frontend with the user's role + details.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array()[0].msg as string, 422);
  }

  const { firstName, lastName, phone, email, role } = req.body as {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    role: 'POSTER' | 'TASKER';
  };

  // req.user.id is populated by the authenticate middleware (from Clerk req.auth.userId)
  const userId = req.user?.id;

  if (!userId) {
    throw new AppError('Not authenticated.', 401);
  }

  // Check if profile already exists (idempotent)
  const existing = await prisma.profile.findUnique({
    where: { userId },
  });

  if (existing) {
    res.status(200).json({ success: true, profile: existing });
    return;
  }

  const profile = await prisma.profile.create({
    data: {
      userId,
      email: email ?? '',
      firstName,
      lastName,
      phone,
      role,
    },
  });

  // Also create a Wallet record for the new user
  await prisma.wallet.create({
    data: { profileId: profile.id },
  });

  logger.info('New profile created via Clerk signup', { profileId: profile.id, role });

  res.status(201).json({ success: true, profile });
}