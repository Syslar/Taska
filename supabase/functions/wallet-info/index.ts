// supabase/functions/wallet-info/index.ts
// GET https://<project>.supabase.co/functions/v1/wallet-info?profileId=<id>
//
// Returns authoritative wallet balances, fee configuration, and recent transactions for an authenticated user.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@4.15.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FRONTEND_API_URL = Deno.env.get('FRONTEND_API_URL') || 'https://modest-sturgeon-45.clerk.accounts.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const JWKS = createRemoteJWKSet(new URL(`${FRONTEND_API_URL}/.well-known/jwks.json`));

async function authenticateCaller(req: Request, supabase: any, targetProfileId: string) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Authentication required: missing Bearer token', status: 401 };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Empty token', status: 401 };

  try {
    const { payload } = await jwtVerify(token, JWKS);
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return { error: 'Invalid token subject', status: 401 };
    }

    const { data: profile, error } = await supabase
      .from('Profile')
      .select('id, userId')
      .eq('id', targetProfileId)
      .maybeSingle();

    if (error || !profile) {
      return { error: 'Profile not found', status: 404 };
    }

    if (profile.userId !== clerkUserId) {
      return { error: 'Unauthorized: Cannot access another user\'s wallet data', status: 403 };
    }

    return { ok: true, clerkUserId, profile };
  } catch (err: any) {
    console.error('[wallet-info] Auth error:', err.message || err);
    return { error: 'Invalid or expired session token. Please log in again.', status: 401 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const url = new URL(req.url);
  const profileId = url.searchParams.get('profileId');

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (!profileId) return respond({ error: 'profileId required' }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Enforce JWT Authentication & Profile Ownership
  const authResult = await authenticateCaller(req, supabase, profileId);
  if (authResult.error) {
    return respond({ error: authResult.error }, authResult.status || 401);
  }

  try {
    // 1. Fetch wallet
    let { data: wallet, error: walletErr } = await supabase
      .from('Wallet')
      .select('id, available_balance, locked_balance, currency, wallet_status, lifetimeEarned, lifetimeWithdrawn, escrowBalance, updatedAt')
      .eq('profileId', profileId)
      .maybeSingle();

    if (walletErr) return respond({ error: 'Failed to fetch wallet' }, 500);

    // Auto-create wallet row if user doesn't have one yet
    if (!wallet) {
      const { data: newWallet } = await supabase
        .from('Wallet')
        .insert({
          profileId,
          balance: 0,
          available_balance: 0,
          locked_balance: 0,
          escrowBalance: 0,
          lifetimeEarned: 0,
          lifetimeWithdrawn: 0,
          currency: 'NGN',
          wallet_status: 'active',
        })
        .select()
        .single();
      wallet = newWallet;
    }

    // 2. Fetch platform fee settings
    const { data: settings } = await supabase
      .from('platform_settings')
      .select('key, value');

    const depositFeeRate = Number(settings?.find((s: any) => s.key === 'deposit_fee_percentage')?.value ?? 0);
    const withdrawalFeeRate = Number(settings?.find((s: any) => s.key === 'withdrawal_fee_percentage')?.value ?? 0);
    const taskCommissionRate = Number(settings?.find((s: any) => s.key === 'task_commission_percentage')?.value ?? 10);

    // 3. Fetch recent deposits (last 25)
    const { data: deposits } = await supabase
      .from('deposits')
      .select('id, gross_amount, commission_amount, net_amount, commission_rate, channel, status, paystack_reference, createdAt')
      .eq('profileId', profileId)
      .order('createdAt', { ascending: false })
      .limit(25);

    // 4. Fetch recent withdrawals (last 25)
    const { data: withdrawals } = await supabase
      .from('withdrawals')
      .select('id, requested_amount, commission_amount, payout_amount, bank_name, account_number, status, paystack_reference, completedAt, createdAt, failure_reason')
      .eq('profileId', profileId)
      .order('createdAt', { ascending: false })
      .limit(25);

    const normalizeAmount = (kobo: number) => (kobo || 0) / 100;

    const walletNaira = wallet ? {
      available_balance: (wallet.available_balance ?? 0) / 100,
      locked_balance: (wallet.locked_balance ?? 0) / 100,
      currency: wallet.currency || 'NGN',
      status: wallet.wallet_status || 'active',
      lifetime_earned: wallet.lifetimeEarned || 0,
      lifetime_withdrawn: wallet.lifetimeWithdrawn || 0,
      escrow_balance: wallet.escrowBalance || 0,
      updated_at: wallet.updatedAt,
    } : null;

    return respond({
      success: true,
      wallet: walletNaira,
      settings: {
        deposit_fee_percentage: depositFeeRate,
        withdrawal_fee_percentage: withdrawalFeeRate,
        task_commission_percentage: taskCommissionRate,
      },
      deposits: (deposits || []).map((d: any) => ({
        ...d,
        gross_amount_naira: normalizeAmount(d.gross_amount),
        commission_naira: normalizeAmount(d.commission_amount),
        net_amount_naira: normalizeAmount(d.net_amount),
      })),
      withdrawals: (withdrawals || []).map((w: any) => ({
        ...w,
        requested_naira: normalizeAmount(w.requested_amount),
        commission_naira: normalizeAmount(w.commission_amount),
        payout_naira: normalizeAmount(w.payout_amount),
      })),
    });

  } catch (err) {
    console.error('[wallet-info] Error:', err);
    return respond({ error: 'Internal server error' }, 500);
  }
});
