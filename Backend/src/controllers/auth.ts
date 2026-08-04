import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { supabase } from '../utils/supabase';
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

  // 1. Check Supabase Profile table
  const { data: existingProfile } = await supabase
    .from('Profile')
    .select('id')
    .ilike('username', username)
    .maybeSingle();

  let isTaken = !!existingProfile;

  // 2. Check Clerk API if not already taken in Supabase
  if (!isTaken && process.env.CLERK_SECRET_KEY) {
    try {
      const clerkRes = await fetch(`https://api.clerk.com/v1/users?username=${encodeURIComponent(username)}`, {
        headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` },
      });
      if (clerkRes.ok) {
        const clerkUsers = await clerkRes.json();
        if (Array.isArray(clerkUsers) && clerkUsers.length > 0) {
          isTaken = true;
        }
      }
    } catch (err) {
      logger.warn('Clerk API username check failed', { error: (err as Error).message });
    }
  }

  if (isTaken) {
    // Generate 4 suggestions
    const suggestions: string[] = [];
    for (let i = 0; i < 4; i++) {
      suggestions.push(`${username}${Math.floor(Math.random() * 1000)}`);
    }
    res.json({ available: false, message: '✗ Already taken', suggestions });
    return;
  }

  res.json({ available: true });
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
  const { data: existing } = await supabase
    .from('Profile')
    .select('*')
    .eq('userId', userId)
    .maybeSingle();

  if (existing) {
    res.status(200).json({ success: true, profile: existing });
    return;
  }

  // Check if username is taken (extra guard — frontend already checks live)
  if (username) {
    const cleanUsername = username.trim().toLowerCase();
    const { data: usernameTaken } = await supabase
      .from('Profile')
      .select('id')
      .ilike('username', cleanUsername)
      .maybeSingle();
      
    if (usernameTaken) {
      throw new AppError('That username is already taken. Please choose another.', 409);
    }
  }

  const { data: profile, error: profileErr } = await supabase
    .from('Profile')
    .insert({
      userId,
      email: email ?? '',
      firstName,
      lastName,
      phone,
      role,
      username: username?.trim().toLowerCase(),
    })
    .select()
    .single();

  if (profileErr || !profile) {
    logger.error('Failed to create profile', profileErr as any);
    throw new AppError('Failed to create user profile.', 500);
  }

  // Also create a Wallet record for the new user
  const { error: walletErr } = await supabase
    .from('Wallet')
    .insert({ profileId: profile.id });
    
  if (walletErr) {
    logger.error('Failed to create wallet', walletErr as any);
  }

  logger.info('New profile created via Clerk signup', { profileId: profile.id, role });

  res.status(201).json({ success: true, profile });
}