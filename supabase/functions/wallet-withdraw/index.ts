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

  const { profileId, requestedAmountNaira, bankCode, accountNumber, accountName, bankName, transactionPin } = body;

  if (!profileId || !requestedAmountNaira || !bankCode || !accountNumber) {
    return respond({ error: 'profileId, requestedAmountNaira, bankCode, accountNumber required' }, 400);
  }

  // Enforce JWT Authentication & Profile Ownership
  const authResult = await authenticateCaller(req, supabase, profileId);
  if (authResult.error) {
    return respond({ error: authResult.error }, authResult.status || 401);
  }

  // Enforce Transaction PIN Authentication
  if (!transactionPin) {
    return respond({ error: 'Transaction PIN is required to authorize withdrawal', code: 'PIN_REQUIRED' }, 403);
  }

  const rawPin = String(transactionPin).trim();
  if (!/^\d{4}$/.test(rawPin)) {
    return respond({ error: 'Transaction PIN must be exactly 4 numeric digits', code: 'INVALID_PIN_FORMAT' }, 400);
  }

  const { data: pinCheck, error: pinErr } = await supabase.rpc('check_wallet_pin', {
    p_profile_id: profileId,
    p_raw_pin: rawPin,
  });

  if (pinErr) {
    console.error('[wallet-withdraw] check_wallet_pin error:', pinErr);
    return respond({ error: 'Unable to verify transaction PIN' }, 500);
  }

  if (pinCheck?.status !== 'OK') {
    if (pinCheck?.status === 'WALLET_FROZEN') {
      dispatchNotification(supabase, {
        type: 'WALLET_FROZEN',
        profileId,
        data: {},
      });
      return respond({
        error: pinCheck.message || 'Wallet has been frozen due to 3 incorrect PIN attempts. Contact support@taska.com.ng to appeal.',
        code: 'WALLET_FROZEN',
        is_frozen: true,
        attempts_remaining: 0,
      }, 403);
    }

    if (pinCheck?.status === 'PIN_NOT_SET') {
      return respond({
        error: 'Please configure your 4-digit transaction PIN before withdrawing funds.',
        code: 'PIN_NOT_SET',
      }, 403);
    }

    return respond({
      error: pinCheck?.message || 'Incorrect transaction PIN',
      code: pinCheck?.status || 'WRONG_PIN',
      attempts_remaining: pinCheck?.attempts_remaining,
    }, 403);
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
      } else {
        console.error('[wallet-withdraw] Recipient creation failed:', recipientData);
        return respond({ error: recipientData.message || 'Failed to create transfer recipient. Please verify bank and account number.' }, 400);
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

    // 4. Initiate Paystack Transfer (Source: Balance)
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

    if (!transferData.status) {
      console.error('[wallet-withdraw] Transfer initiation failed:', transferData);
      await supabase.rpc('finalize_withdrawal', {
        p_paystack_reference: reference,
        p_transfer_code: '',
        p_outcome: 'failed',
        p_failure_reason: transferData.message || 'Paystack transfer initiation failed',
      });
      return respond({ error: transferData.message || 'Bank transfer failed. Please check Paystack balance.' }, 400);
    }

    const transferCode = transferData.data?.transfer_code || `TRF_${Date.now()}`;
    const paystackStatus = transferData.data?.status; // 'success' | 'pending' | 'otp' | 'failed'

    // Handle Paystack Transfer OTP requirement
    if (paystackStatus === 'otp') {
      console.warn('[wallet-withdraw] Paystack transfer paused because Transfer OTP is enabled:', transferData);
      // Unlock funds back to user's wallet so their money is not stuck
      await supabase.rpc('finalize_withdrawal', {
        p_paystack_reference: reference,
        p_transfer_code: transferCode,
        p_outcome: 'failed',
        p_failure_reason: 'Paystack Transfer OTP is enabled on your Paystack account. Please disable "Confirm transfers before sending" in Paystack Settings > Preferences to allow automated payouts.',
      });

      // Send Refund Notification (In-App + Email)
      dispatchNotification(supabase, {
        type: 'WITHDRAWAL_FAILED',
        profileId,
        data: {
          amountNaira: requestedAmountNaira,
          failureReason: 'Paystack Transfer OTP is active on the account. Payout paused and full amount refunded to your wallet.',
          reference,
        },
      });

      return respond({
        error: 'Paystack Transfer OTP is enabled on your Paystack dashboard. To allow automated withdrawals, please go to Paystack Dashboard > Settings > Preferences > Transfers and uncheck "Confirm transfers before sending". Your funds have been refunded to your wallet balance.',
      }, 400);
    }

    let outcomeStatus = paystackStatus === 'success' ? 'success' : 'processing';

    // 5. Finalize or track withdrawal
    if (outcomeStatus === 'success') {
      await supabase.rpc('finalize_withdrawal', {
        p_paystack_reference: reference,
        p_transfer_code: transferCode,
        p_outcome: 'success',
      });

      // Send Success Notification via Resend
      dispatchNotification(supabase, {
        type: 'WITHDRAWAL_SUCCESS',
        profileId,
        data: {
          amountNaira: requestedAmountNaira,
          payoutNaira,
          bankName,
          accountNumber,
          reference,
        },
      });
    } else {
      // Kept in processing state until Paystack webhook confirms transfer.success
      await supabase
        .from('withdrawals')
        .update({
          paystack_transfer_code: transferCode,
          updatedAt: new Date().toISOString(),
        })
        .eq('paystack_reference', reference);

      // Send Initiated / Processing Notification
      dispatchNotification(supabase, {
        type: 'WITHDRAWAL_INITIATED',
        profileId,
        data: {
          amountNaira: requestedAmountNaira,
          payoutNaira,
          bankName,
          accountNumber,
          reference,
        },
      });
    }

    const isConfirmed = outcomeStatus === 'success';
    const msg = isConfirmed
      ? `₦${payoutNaira} successfully sent to your ${bankName || 'bank'} account!`
      : `Withdrawal initiated! ₦${payoutNaira} is pending processing with your bank. You will be notified once confirmed.`;

    return respond({
      success: true,
      status: isConfirmed ? 'successful' : 'pending',
      withdrawal_id,
      reference,
      transfer_code: transferCode,
      requested_naira: requestedAmountNaira,
      commission_naira: (commissionKobo / 100).toFixed(2),
      payout_naira: payoutNaira,
      message: msg,
    });

  } catch (err: any) {
    console.error('[wallet-withdraw] Unhandled error:', err);
    if (reference) {
      try {
        await supabase.rpc('finalize_withdrawal', {
          p_paystack_reference: reference,
          p_transfer_code: '',
          p_outcome: 'failed',
          p_failure_reason: err?.message || 'Server error during transfer processing',
        });
      } catch (unlockErr) {
        console.error('[wallet-withdraw] Failed to auto-unlock funds in catch block:', unlockErr);
      }
    }
    return respond({ error: err?.message || 'Internal server error. Wallet balance was not affected.' }, 500);
  }
});

async function dispatchNotification(supabase: any, payload: any) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    console.log('[wallet-withdraw] Dispatched notification result:', json);
  } catch (err: any) {
    console.error('[wallet-withdraw] Error dispatching notification:', err.message || err);
  }
}

