// supabase/functions/delete-account/index.ts
// POST https://<project>.supabase.co/functions/v1/delete-account
//
// Secure, authoritative account deletion for Taska:
//   1. Authenticates caller via Clerk JWT Bearer token
//   2. Validates user identity against target profile
//   3. Cascades deletion across dependent tables using service role (bypassing RLS safely)
//   4. Deletes Clerk user record via Clerk Backend API
//   5. Returns confirmation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@4.15.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FRONTEND_API_URL = Deno.env.get('FRONTEND_API_URL') || 'https://modest-sturgeon-45.clerk.accounts.dev';
const CLERK_SECRET_KEY = Deno.env.get('CLERK_SECRET_KEY') || 'sk_test_HwE5vtgHvwbRNo6LlFgKHHPVCuPWD3tfw6bdI8lqGB';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JWKS = createRemoteJWKSet(new URL(`${FRONTEND_API_URL}/.well-known/jwks.json`));

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Verify caller identity via JWT
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { payload } = await jwtVerify(token, JWKS);
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const requestedProfileId = body.profileId;

    // Service role client to perform cascading deletion securely
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Find and verify user profile
    let query = supabase.from('Profile').select('id, userId');
    if (requestedProfileId) {
      query = query.eq('id', requestedProfileId);
    } else {
      query = query.eq('userId', clerkUserId);
    }

    const { data: profile, error: pError } = await query.maybeSingle();
    if (pError || !profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Security check: Profile must belong to the authenticated Clerk user
    if (profile.userId !== clerkUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Cannot delete another user account' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const profileId = profile.id;

    // 3. Delete related records in dependency order
    // A. Wallet & transactions
    const { data: wallet } = await supabase
      .from('Wallet')
      .select('id')
      .eq('profileId', profileId)
      .maybeSingle();

    if (wallet?.id) {
      await supabase.from('WalletTransaction').delete().eq('walletId', wallet.id);
    }
    await supabase.from('wallet_accounts').delete().eq('profileId', profileId);
    if (wallet?.id) {
      await supabase.from('Wallet').delete().eq('id', wallet.id);
    }

    // B. Applications submitted by tasker
    await supabase.from('Application').delete().eq('taskerId', profileId);

    // C. Reviews given or received
    await supabase.from('Review').delete().or(`reviewerId.eq.${profileId},revieweeId.eq.${profileId}`);

    // D. Tasks posted by user (and any applications on them)
    const { data: userTasks } = await supabase.from('Task').select('id').eq('posterId', profileId);
    if (userTasks && userTasks.length > 0) {
      for (const t of userTasks) {
        await supabase.from('Application').delete().eq('taskId', t.id);
      }
      await supabase.from('Task').delete().eq('posterId', profileId);
    }

    // E. Notifications for this user
    await supabase.from('Notification').delete().eq('userId', clerkUserId);

    // F. Finally, delete the Profile
    const { error: delProfileErr } = await supabase.from('Profile').delete().eq('id', profileId);
    if (delProfileErr) {
      console.error('[delete-account] Failed to delete profile:', delProfileErr);
      return new Response(JSON.stringify({ error: 'Failed to delete profile: ' + delProfileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Delete user from Clerk via Backend API
    try {
      if (CLERK_SECRET_KEY) {
        await fetch(`https://api.clerk.com/v1/users/${clerkUserId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${CLERK_SECRET_KEY.trim()}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (cErr) {
      console.warn('[delete-account] Clerk deletion notice:', cErr);
    }

    return new Response(JSON.stringify({ success: true, message: 'Account deleted successfully' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('[delete-account] Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
