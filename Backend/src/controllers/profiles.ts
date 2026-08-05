import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { supabase } from '../utils/supabase';
import { AppError } from '../utils/errors';
import { ensureProfile } from '../utils/ensureProfile';

// ─── GET /profiles/me ─────────────────────────────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  // Auto-provision profile if it doesn't exist
  const result = await ensureProfile(req.user.id);
  if (!result) {
    throw new AppError('Could not load or create your profile.', 500);
  }

  res.json({ success: true, profile: result.profile });
}

// ─── PUT /profiles/me ─────────────────────────────────────────────────────────

export async function updateMe(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError('Not authenticated', 401);

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError(errors.array()[0].msg as string, 422);
  }

  // Only allow updating safe fields — userId, role, kycStatus etc. are immutable here
  const { firstName, lastName, location, bio, avatarUrl, phone } = req.body as {
    firstName?: string;
    lastName?: string;
    location?: string;
    bio?: string;
    avatarUrl?: string;
    phone?: string;
  };
  
  const updates: any = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (location !== undefined) updates.location = location;
  if (bio !== undefined) updates.bio = bio;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  if (phone !== undefined) updates.phone = phone;

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

// ─── DELETE /profiles/me ──────────────────────────────────────────────────────

export async function deleteMe(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Not authenticated', 401);

  // 1. Get profile and wallet IDs
  const { data: profile } = await supabase
    .from('Profile')
    .select('id')
    .eq('userId', userId)
    .maybeSingle();

  if (profile) {
    const { data: wallet } = await supabase
      .from('Wallet')
      .select('id')
      .eq('profileId', profile.id)
      .maybeSingle();

    // 2. Cascade delete from Supabase child tables to avoid constraint violations
    if (wallet) {
      await supabase.from('WalletTransaction').delete().eq('walletId', wallet.id);
      await supabase.from('Payment').delete().eq('walletId', wallet.id);
      await supabase.from('Withdrawal').delete().eq('walletId', wallet.id);
      await supabase.from('Wallet').delete().eq('id', wallet.id);
    }

    // Delete tasks and applications
    const { data: tasks } = await supabase
      .from('Task')
      .select('id')
      .eq('posterId', profile.id);

    if (tasks && tasks.length > 0) {
      const taskIds = tasks.map(t => t.id);
      await supabase.from('Application').delete().in('taskId', taskIds);
      await supabase.from('Task').delete().in('id', taskIds);
    }

    await supabase.from('Application').delete().eq('taskerId', profile.id);
    await supabase.from('Review').delete().or(`reviewerId.eq.${profile.id},revieweeId.eq.${profile.id}`);
    await supabase.from('Message').delete().or(`senderId.eq.${profile.id},recipientId.eq.${profile.id}`);
    await supabase.from('Notification').delete().eq('profileId', profile.id);

    // Delete main profile row
    await supabase.from('Profile').delete().eq('id', profile.id);
  }

  // 3. Delete user account from Clerk Backend API
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (clerkSecretKey) {
    try {
      const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${clerkSecretKey}` },
      });
      if (!clerkRes.ok) {
        console.error('Failed to delete user in Clerk', clerkRes.status);
      }
    } catch (err) {
      console.error('Clerk delete request failed', err);
    }
  }

  res.json({ success: true, message: 'Account deleted successfully.' });
}