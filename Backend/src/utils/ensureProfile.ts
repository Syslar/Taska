import { supabase } from './supabase';
import { logger } from './logger';

/**
 * ensureProfile — "Just-in-time provisioning"
 *
 * Given a Clerk userId, looks up the Profile in Supabase.
 * If none exists, fetches the user's details from the Clerk Backend API
 * and creates a Profile + Wallet automatically.
 *
 * This handles all edge cases:
 *   - Signup completed in Clerk but backend register failed
 *   - Orphaned Clerk accounts from broken flows
 *   - Users who somehow bypassed the register endpoint
 */
export async function ensureProfile(clerkUserId: string) {
  // 1. Try to find existing profile
  const { data: existing } = await supabase
    .from('Profile')
    .select('*, Wallet(*)')
    .eq('userId', clerkUserId)
    .maybeSingle();

  if (existing) {
    // Format wallet
    const wallet = existing.Wallet && existing.Wallet.length > 0 ? existing.Wallet[0] : null;
    const profile = { ...existing };
    delete profile.Wallet;
    return { profile, wallet };
  }

  // 2. Profile doesn't exist — fetch user details from Clerk Backend API
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    logger.error('CLERK_SECRET_KEY not set — cannot auto-provision profile');
    return null;
  }

  let clerkUser: any;
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
      headers: { Authorization: `Bearer ${clerkSecretKey}` },
    });
    if (!res.ok) {
      logger.error('Failed to fetch Clerk user', { status: res.status, clerkUserId });
      return null;
    }
    clerkUser = await res.json();
  } catch (err) {
    logger.error('Clerk API request failed', { error: (err as Error).message });
    return null;
  }

  // 3. Build the profile from Clerk user data
  const firstName = clerkUser.first_name || 'User';
  const lastName = clerkUser.last_name || '';
  const email = clerkUser.email_addresses?.[0]?.email_address || '';
  const phone = clerkUser.phone_numbers?.[0]?.phone_number || '';
  const username = clerkUser.username || `user_${Date.now()}`;

  const { data: profile, error: profileErr } = await supabase
    .from('Profile')
    .insert({
      userId: clerkUserId,
      firstName,
      lastName,
      email,
      phone,
      username,
      role: 'POSTER', // Default role — user can change later
    })
    .select()
    .single();

  if (profileErr || !profile) {
    logger.error('Failed to auto-create profile', { error: profileErr });
    return null;
  }

  // 4. Create a wallet for the new profile
  const { data: wallet, error: walletErr } = await supabase
    .from('Wallet')
    .insert({ profileId: profile.id })
    .select()
    .single();

  if (walletErr) {
    logger.error('Failed to auto-create wallet', { error: walletErr });
  }

  logger.info('Auto-provisioned profile from Clerk', { profileId: profile.id, clerkUserId });

  return { profile, wallet: wallet || null };
}
