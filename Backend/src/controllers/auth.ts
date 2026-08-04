import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ─── GET /auth/check-username ─────────────────────────────────────────────────

/**
 * Public endpoint — returns whether a username is available.
 * Query: ?username=<value>
 */
export async function checkUsername(req: Request, res: Response): Promise<void> {
  const raw = (req.query.username as string | undefined) ?? '';
  const username = raw.trim().toLowerCase();

  if (!username || username.length < 3) {
    res.status(400).json({ available: false, message: 'Username must be at least 3 characters.' });
    return;
  }

  if (!/^[a-z0-9_]+$/.test(username)) {
    res.status(400).json({ available: false, message: 'Only letters, numbers and underscores allowed.' });
    return;
  }

  const existing = await prisma.profile.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true },
  });

  res.json({ available: !existing });
}

/**
 * Create a Profile record in our DB after Clerk authentication.
 * Called immediately after a successful signup on the frontend with the user's role + details.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array()[0].msg as string, 422);
  }

  const { firstName, lastName, phone, email, role, username } = req.body as {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    role: 'POSTER' | 'TASKER';
    username: string;
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

  // Check if username is taken (extra guard — frontend already checks live)
  const usernameTaken = await prisma.profile.findFirst({
    where: { username: { equals: username?.trim().toLowerCase(), mode: 'insensitive' } },
    select: { id: true },
  });
  if (usernameTaken) {
    throw new AppError('That username is already taken. Please choose another.', 409);
  }

  const profile = await prisma.profile.create({
    data: {
      userId,
      email: email ?? '',
      firstName,
      lastName,
      phone,
      role,
      username: username?.trim().toLowerCase(),
    },
  });

  // Also create a Wallet record for the new user
  await prisma.wallet.create({
    data: { profileId: profile.id },
  });

  logger.info('New profile created via Clerk signup', { profileId: profile.id, role });

  res.status(201).json({ success: true, profile });
}