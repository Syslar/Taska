// supabase/functions/wallet-withdraw/index.ts
// POST https://<project>.supabase.co/functions/v1/wallet-withdraw
//
// Initiates a bank withdrawal for an authenticated user:
//   1. Verify caller identity via JWT (Clerk JWKS / Auth claims)
//   2. Validate profile ownership
//   3. Resolve bank account & create/reuse Paystack recipient
//   4. Call initiate_withdrawal Postgres RPC (locks funds atomically)
//   5. Call Paystack Transfer API
//   6. Finalize withdrawal status

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@4.15.5';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FRONTEND_API_URL = Deno.env.get('FRONTEND_API_URL') || 'https://modest-sturgeon-45.clerk.accounts.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const paystackHeaders = {
  'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
  'Content-Type': 'application/json',
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
      return { error: 'Unauthorized: Cannot withdraw funds from another user\'s profile', status: 403 };
    }

    return { ok: true, clerkUserId, profile };
  } catch (err: any) {
    console.error('[wallet-withdraw] Auth error:', err.message || err);
    return { error: 'Invalid or expired session token. Please log in again.', status: 401 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await req.json(); } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { profileId, requestedAmountNaira, bankCode, accountNumber, accountName, bankName } = body;

  if (!profileId || !requestedAmountNaira || !bankCode || !accountNumber) {
    return respond({ error: 'profileId, requestedAmountNaira, bankCode, accountNumber required' }, 400);
  }

  // Enforce JWT Authentication & Profile Ownership
  const authResult = await authenticateCaller(req, supabase, profileId);
  if (authResult.error) {
    return respond({ error: authResult.error }, authResult.status || 401);
  }

  const requestedAmountKobo = Math.round(Number(requestedAmountNaira) * 100);
  if (requestedAmountKobo < 100000) {
    return respond({ error: 'Minimum withdrawal is ₦1,000' }, 400);
  }

  const isTestMode = PAYSTACK_SECRET_KEY.startsWith('sk_test_');

  // Read commission rate from platform_settings
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['withdrawal_fee_percentage']);

  const commissionRate = Number(settings?.find((s: any) => s.key === 'withdrawal_fee_percentage')?.value ?? 0);
  const commissionKobo = Math.floor(requestedAmountKobo * commissionRate / 100);
  const payoutKobo = requestedAmountKobo - commissionKobo;

  const payoutNaira = (payoutKobo / 100).toFixed(2);
  const reference = `TK-WTH-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

  try {
    // 1. Check for existing active recipient
    const { data: existingRecipient } = await supabase
      .from('paystack_recipients')
      .select('*')
      .eq('profileId', profileId)
      .eq('account_number', accountNumber.replace(/\D/g, ''))
      .eq('is_active', true)
      .maybeSingle();

    let recipientCode = existingRecipient?.recipient_code;

    // 2. Create Transfer Recipient if none exists
    if (!recipientCode) {
      const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: paystackHeaders,
        body: JSON.stringify({
          type: 'nuban',
          name: accountName || 'Taska User',
          account_number: accountNumber.replace(/\D/g, ''),
          bank_code: bankCode,
          currency: 'NGN',
        }),
      });
      const recipientData = await recipientRes.json();

      if (recipientData.status && recipientData.data?.recipient_code) {
        recipientCode = recipientData.data.recipient_code;
      } else if (isTestMode) {
        recipientCode = `RCP_TEST_${Date.now()}`;
      } else {
        console.error('[wallet-withdraw] Recipient creation failed:', recipientData);
        return respond({ error: recipientData.message || 'Failed to create transfer recipient' }, 400);
      }

      await supabase.from('paystack_recipients').insert({
        profileId,
        recipient_code: recipientCode,
        bank_code: bankCode,
        account_number: accountNumber.replace(/\D/g, ''),
        account_name: accountName,
        bank_name: bankName || '',
        is_active: true,
      });
    }

    // 3. Lock funds atomically via Postgres RPC
    const { data: initiateResult, error: initiateError } = await supabase.rpc('initiate_withdrawal', {
      p_profile_id: profileId,
      p_requested_amount_kobo: requestedAmountKobo,
      p_bank_code: bankCode,
      p_account_number: accountNumber.replace(/\D/g, ''),
      p_account_name: accountName || '',
      p_bank_name: bankName || '',
      p_recipient_code: recipientCode,
      p_paystack_reference: reference,
      p_commission_rate: commissionRate,
    });

    if (initiateError) {
      const msg = initiateError.message || '';
      if (msg.includes('INSUFFICIENT_BALANCE')) return respond({ error: 'Insufficient wallet balance' }, 400);
      if (msg.includes('WALLET_NOT_FOUND')) return respond({ error: 'Wallet not found' }, 400);
      console.error('[wallet-withdraw] initiate_withdrawal RPC error:', initiateError);
      return respond({ error: 'Failed to initiate withdrawal' }, 500);
    }

    const { withdrawal_id } = initiateResult;

    // 4. Initiate Paystack Transfer
    let transferCode = `TRF_SIM_${Date.now()}`;
    let isSuccessful = isTestMode;

    if (!isTestMode || !recipientCode.startsWith('RCP_TEST_')) {
      const transferRes = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: paystackHeaders,
        body: JSON.stringify({
          source: 'balance',
          amount: payoutKobo,
          recipient: recipientCode,
          reason: `Taska payout - ${reference}`,
          reference,
          currency: 'NGN',
        }),
      });
      const transferData = await transferRes.json();

      if (transferData.status) {
        transferCode = transferData.data?.transfer_code || transferCode;
        isSuccessful = true;
      } else if (!isTestMode) {
        console.error('[wallet-withdraw] Transfer initiation failed:', transferData);
        await supabase.rpc('finalize_withdrawal', {
          p_paystack_reference: reference,
          p_transfer_code: '',
          p_outcome: 'failed',
          p_failure_reason: transferData.message || 'Paystack transfer initiation failed',
        });
        return respond({ error: transferData.message || 'Bank transfer failed' }, 400);
      }
    }

    // 5. Finalize withdrawal
    if (isSuccessful) {
      await supabase.rpc('finalize_withdrawal', {
        p_paystack_reference: reference,
        p_transfer_code: transferCode,
        p_outcome: 'success',
      });
    }

    const msg = commissionKobo > 0
      ? `₦${payoutNaira} sent to your ${bankName || 'bank'} account! ₦${(commissionKobo / 100).toFixed(2)} (${commissionRate}%) Taska commission retained.`
      : `₦${payoutNaira} successfully sent to your ${bankName || 'bank'} account! (0% fee)`;

    return respond({
      success: true,
      status: 'successful',
      withdrawal_id,
      reference,
      transfer_code: transferCode,
      requested_naira: requestedAmountNaira,
      commission_naira: (commissionKobo / 100).toFixed(2),
      payout_naira: payoutNaira,
      message: msg,
    });

  } catch (err) {
    console.error('[wallet-withdraw] Unhandled error:', err);
    return respond({ error: 'Internal server error' }, 500);
  }
});
