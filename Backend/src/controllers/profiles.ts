import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';

// ─── GET /profiles/me ─────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  const profile = await prisma.profile.findUnique({
    where: { userId: req.user.id },
    include: { wallet: true },
  });

  if (!profile) {
    throw new AppError('Profile not found. Please complete registration.', 404);
  }

  res.json({ success: true, profile });
}

// ─── PUT /profiles/me ─────────────────────────────────────────────────────────

export async function updateMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array()[0].msg as string, 422);
  }

  // Only allow updating safe fields — userId, role, kycStatus etc. are immutable here
  const { firstName, lastName, location, bio, avatarUrl } = req.body as {
    firstName?: string;
    lastName?: string;
    location?: string;
    bio?: string;
    avatarUrl?: string;
  };

  const profile = await prisma.profile.update({
    where: { userId: req.user.id },
    data: {
      ...(firstName  !== undefined && { firstName }),
      ...(lastName   !== undefined && { lastName }),
      ...(location   !== undefined && { location }),
      ...(bio        !== undefined && { bio }),
      ...(avatarUrl  !== undefined && { avatarUrl }),
    },
  });

  res.json({ success: true, profile });
}

// ─── GET /profiles/:id ────────────────────────────────────────────────────────

export async function getProfile(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const profile = await prisma.profile.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      location: true,
      bio: true,
      role: true,
      kycStatus: true,
      isVerified: true,
      averageRating: true,
      totalReviews: true,
      createdAt: true,
      // Exclude: email, phone, userId, wallet — private fields
    },
  });

  if (!profile) {
    throw new AppError('Profile not found', 404);
  }

  res.json({ success: true, profile });
}