import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { supabase } from '../utils/supabase';
import { AppError } from '../utils/errors';

// ─── GET /profiles/me ─────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  const { data: profile } = await supabase
    .from('Profile')
    .select('*, Wallet(*)')
    .eq('userId', req.user.id)
    .single();

  if (!profile) {
    throw new AppError('Profile not found. Please complete registration.', 404);
  }

  // Format response to match Prisma's output style for frontend compatibility
  const formattedProfile = {
    ...profile,
    wallet: profile.Wallet && profile.Wallet.length > 0 ? profile.Wallet[0] : null
  };
  delete formattedProfile.Wallet;

  res.json({ success: true, profile: formattedProfile });
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
  
  const updates: any = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (location !== undefined) updates.location = location;
  if (bio !== undefined) updates.bio = bio;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

  const { data: profile, error } = await supabase
    .from('Profile')
    .update(updates)
    .eq('userId', req.user.id)
    .select()
    .single();
    
  if (error || !profile) {
    throw new AppError('Failed to update profile', 500);
  }

  res.json({ success: true, profile });
}

// ─── GET /profiles/:id ────────────────────────────────────────────────────────

export async function getProfile(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const { data: profile } = await supabase
    .from('Profile')
    .select('id, firstName, lastName, avatarUrl, location, bio, role, kycStatus, isVerified, averageRating, totalReviews, createdAt')
    .eq('id', id)
    .maybeSingle();

  if (!profile) {
    throw new AppError('Profile not found', 404);
  }

  res.json({ success: true, profile });
}