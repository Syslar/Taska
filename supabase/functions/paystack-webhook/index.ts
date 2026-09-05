// supabase/functions/paystack-webhook/index.ts
// POST https://<project>.supabase.co/functions/v1/paystack-webhook
//
// Receives ALL Paystack events. Verifies HMAC-SHA512 signature first.
// Dispatches to the correct handler. Fully idempotent.
//
// Register this URL in Paystack Dashboard → Settings → API → Webhooks

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'node:crypto';

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(rawBody: string, signature: string): boolean {
  const hash = createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  return hash === signature;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signature = req.headers.get('x-paystack-signature') ?? '';
  const rawBody = await req.text();

  // 1. MUST verify signature before processing anything
  if (!signature || !verifySignature(rawBody, signature)) {
    console.error('[webhook] Invalid signature — rejecting');
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const eventType: string = payload.event;
  const data = payload.data;
  const eventId = data?.reference || data?.transfer_code || `${eventType}-${Date.now()}`;

  // 2. Idempotency: check if already processed
  const { data: existing } = await supabase
    .from('paystack_events')
    .select('processed')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing?.processed === true) {
    console.log('[webhook] Already processed:', eventId);
    return new Response('OK', { status: 200 });
  }

  // 3. Record event (before processing — prevents race on duplicate delivery)
  await supabase.from('paystack_events').upsert({
    event_id: eventId,
    event_type: eventType,
    payload,
    processed: false,
  }, { onConflict: 'event_id', ignoreDuplicates: true });

  // 4. Dispatch
  try {
    switch (eventType) {
      case 'charge.success':
        await handleChargeSuccess(supabase, data);
        break;

      case 'transfer.success': {
        await supabase.rpc('finalize_withdrawal', {
          p_paystack_reference: data.reference,
          p_transfer_code: data.transfer_code,
          p_outcome: 'success',
        });
        console.log('[webhook] transfer.success finalized:', data.reference);

        // Fetch withdrawal record to notify user
        const { data: wRecord } = await supabase
          .from('withdrawals')
          .select('profileId, requestedAmountKobo, payoutKobo, bankName, accountNumber')
          .eq('paystackReference', data.reference)
          .maybeSingle();

        if (wRecord) {
          await dispatchNotification(supabase, {
            type: 'WITHDRAWAL_SUCCESS',
            profileId: wRecord.profileId,
            data: {
              amountKobo: wRecord.requestedAmountKobo || wRecord.payoutKobo,
              reference: data.reference,
              bankName: wRecord.bankName,
              accountNumber: wRecord.accountNumber,
            },
          });
        }
        break;
      }

      case 'transfer.failed': {
        await supabase.rpc('finalize_withdrawal', {
          p_paystack_reference: data.reference,
          p_transfer_code: data.transfer_code || '',
          p_outcome: 'failed',
          p_failure_reason: data.reason || 'Transfer failed',
        });
        console.log('[webhook] transfer.failed — funds unlocked:', data.reference);

        const { data: wRecord } = await supabase
          .from('withdrawals')
          .select('profileId, requestedAmountKobo, payoutKobo')
          .eq('paystackReference', data.reference)
          .maybeSingle();

        if (wRecord) {
          await dispatchNotification(supabase, {
            type: 'WITHDRAWAL_FAILED',
            profileId: wRecord.profileId,
            data: {
              amountKobo: wRecord.requestedAmountKobo || wRecord.payoutKobo,
              reference: data.reference,
              failureReason: data.reason || 'Transfer failed by bank network',
            },
          });
        }
        break;
      }

      case 'transfer.reversed': {
        await supabase.rpc('finalize_withdrawal', {
          p_paystack_reference: data.reference,
          p_transfer_code: data.transfer_code || '',
          p_outcome: 'reversed',
          p_failure_reason: 'Transfer reversed by Paystack',
        });
        console.log('[webhook] transfer.reversed — funds unlocked:', data.reference);

        const { data: wRecord } = await supabase
          .from('withdrawals')
          .select('profileId, requestedAmountKobo, payoutKobo')
          .eq('paystackReference', data.reference)
          .maybeSingle();

        if (wRecord) {
          await dispatchNotification(supabase, {
            type: 'WITHDRAWAL_FAILED',
            profileId: wRecord.profileId,
            data: {
              amountKobo: wRecord.requestedAmountKobo || wRecord.payoutKobo,
              reference: data.reference,
              failureReason: 'Transfer reversed by bank network',
            },
          });
        }
        break;
      }

      default:
        console.log('[webhook] Unhandled event type:', eventType);
    }

    // 5. Mark event processed
    await supabase.from('paystack_events')
      .update({ processed: true, processedAt: new Date().toISOString() })
      .eq('event_id', eventId);

  } catch (err) {
    console.error('[webhook] Handler error for', eventType, ':', err);
    // Return 200 even on error — prevents Paystack from retrying indefinitely
  }

  return new Response('OK', { status: 200 });
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
    console.log('[webhook] Dispatched notification result:', json);
  } catch (err: any) {
    console.error('[webhook] Error dispatching notification:', err.message || err);
  }
}

async function handleChargeSuccess(supabase: any, data: any) {
  const reference = data.reference;
  const amountKobo: number = data.requested_amount || (data.fees ? data.amount - data.fees : data.amount);
  const channel: string = data.channel;

  let profileId: string | null = null;

  if (data.metadata?.profile_id) {
    profileId = data.metadata.profile_id;
  }

  if (!profileId && Array.isArray(data.metadata?.custom_fields)) {
    const field = data.metadata.custom_fields.find((f: any) => f.variable_name === 'profile_id');
    if (field?.value) profileId = field.value;
  }

  if (!profileId && data.customer?.email) {
    const { data: profile } = await supabase
      .from('Profile')
      .select('id')
      .eq('email', data.customer.email)
      .maybeSingle();
    if (profile) profileId = profile.id;
  }

  if (!profileId) {
    console.error('[webhook] charge.success: Cannot identify user for reference', reference);
    return;
  }

  const { data: feeSetting } = await supabase
    .from('platform_settings')
    .select('value')
    .eq('key', 'deposit_fee_percentage')
    .maybeSingle();

  const commissionRate = Number(feeSetting?.value ?? 0);

  const { data: result, error } = await supabase.rpc('process_deposit', {
    p_profile_id: profileId,
    p_paystack_reference: reference,
    p_paystack_transaction_id: Number(data.id),
    p_gross_amount_kobo: amountKobo,
    p_channel: channel || 'card',
    p_commission_rate: commissionRate,
  });

  if (error) {
    console.error('[webhook] process_deposit RPC error:', error);
  } else {
    console.log('[webhook] Deposit processed successfully:', result);

    // Send Deposit Confirmation Email via Resend
    await dispatchNotification(supabase, {
      type: 'DEPOSIT_SUCCESS',
      profileId,
      data: {
        amountKobo,
        channel: channel || 'card',
        reference,
      },
    });
  }
}
