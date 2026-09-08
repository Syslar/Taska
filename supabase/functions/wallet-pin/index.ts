// supabase/functions/wallet-pin/index.ts
// POST https://<project>.supabase.co/functions/v1/wallet-pin
//
// Manages wallet transaction PIN operations:
//   - status: check if PIN is configured, wallet is frozen, failed attempts
//   - setup: set initial 4-digit PIN (only allowed if pin_is_set is false)
//   - verify: verify 4-digit PIN for sensitive actions
//   - change: change 4-digit PIN (verifies current PIN, enforces rate limit of 3x per 24h, sends email alert)
//   - get_reset_channels: returns masked email/phone options strictly from user Profile
//   - send_reset_otp: sends 6-digit verification code to registered email (Resend) or phone (Termii SMS)
//   - verify_reset_otp: verifies 6-digit OTP and issues a 15-minute reset token
//   - reset_pin_with_token: atomically resets 4-digit PIN, resets failed attempts, unfreezes wallet

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@4.15.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FRONTEND_API_URL = Deno.env.get('FRONTEND_API_URL') || 'https://modest-sturgeon-45.clerk.accounts.dev';

// Termii SMS Credentials
const TERMII_API_KEY = Deno.env.get('TERMII_API_KEY') || 'tlv_f_udRBaDruqa0gmOD2BKdg550ejbvYfK-MK4ifYACYA';
const TERMII_BASE_URL = (Deno.env.get('TERMII_BASE_URL') || 'https://api.ng.termii.com').replace(/\/$/, '');
const TERMII_SENDER_ID = 'OE Alert';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const JWKS = createRemoteJWKSet(new URL(`${FRONTEND_API_URL}/.well-known/jwks.json`));

// Helper: Format & Validate Nigerian Phone
function formatNigerianPhone(rawPhone: string): { formatted: string; isValid: boolean; display: string; core10: string } {
  if (!rawPhone) return { formatted: '', isValid: false, display: '', core10: '' };
  let cleaned = String(rawPhone).trim().replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = '234' + cleaned.substring(1);
  } else if (cleaned.length === 10 && !cleaned.startsWith('234')) {
    cleaned = '234' + cleaned;
  }
  const isValid = /^234[789][01]\d{8}$/.test(cleaned);
  const core10 = isValid ? cleaned.slice(3) : '';
  const display = isValid ? `+234 ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}` : rawPhone;
  return { formatted: cleaned, isValid, display, core10 };
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '******';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

function maskPhone(core10: string): string {
  if (!core10 || core10.length < 10) return '+234 *** *** ****';
  return `+234 ${core10.slice(0, 3)} *** **${core10.slice(-2)}`;
}

async function computeSha256(text: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function authenticateCaller(req: Request, supabase: any, targetProfileId?: string) {
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

    if (targetProfileId) {
      const { data: profile, error } = await supabase
        .from('Profile')
        .select('id, userId, firstName, lastName, username, email, phone')
        .eq('id', targetProfileId)
        .maybeSingle();

      if (error || !profile) {
        return { error: 'Profile not found', status: 404 };
      }

      if (profile.userId !== clerkUserId) {
        return { error: 'Unauthorized: You do not own this profile', status: 403 };
      }

      return { ok: true, clerkUserId, profile };
    }

    // Lookup profile by clerkUserId
    const { data: profile, error } = await supabase
      .from('Profile')
      .select('id, userId, firstName, lastName, username, email, phone')
      .eq('userId', clerkUserId)
      .maybeSingle();

    if (error || !profile) {
      return { error: 'Profile not found for authenticated user', status: 404 };
    }

    return { ok: true, clerkUserId, profile };
  } catch (err: any) {
    console.error('[wallet-pin] Auth error:', err.message || err);
    return { error: 'Invalid or expired session token. Please log in again.', status: 401 };
  }
}

async function dispatchNotification(payload: any) {
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
    console.log('[wallet-pin] Dispatched notification result:', json);
  } catch (err: any) {
    console.error('[wallet-pin] Error dispatching notification:', err.message || err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: any = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      return respond({ error: 'Invalid JSON body' }, 400);
    }
  }

  // Action can come from body or query param
  const url = new URL(req.url);
  const action = body.action || url.searchParams.get('action');
  const targetProfileId = body.profileId || url.searchParams.get('profileId');

  if (!action) {
    return respond({ error: 'action is required' }, 400);
  }

  // Enforce JWT Auth
  const auth = await authenticateCaller(req, supabase, targetProfileId);
  if (auth.error) {
    return respond({ error: auth.error }, auth.status || 401);
  }

  const profile = auth.profile;
  const profileId = profile.id;

  try {
    // ── 1. STATUS ──────────────────────────────────────────────────────────
    if (action === 'status') {
      const { data, error } = await supabase.rpc('get_wallet_pin_status', {
        p_profile_id: profileId,
      });

      if (error) {
        console.error('[wallet-pin] get_wallet_pin_status error:', error);
        return respond({ error: 'Failed to retrieve PIN status' }, 500);
      }

      return respond({
        success: true,
        pin_is_set: Boolean(data?.pin_is_set),
        is_set: Boolean(data?.pin_is_set),
        is_frozen: Boolean(data?.is_frozen),
        failed_attempts: Number(data?.failed_attempts || 0),
      });
    }

    // ── 2. SETUP (Initial PIN creation) ────────────────────────────────────
    if (action === 'setup') {
      const pin = String(body.pin || '').trim();

      if (!/^\d{4}$/.test(pin)) {
        return respond({ error: 'PIN must be exactly 4 numeric digits (0000-9999)', code: 'INVALID_PIN_FORMAT' }, 400);
      }

      const { data, error } = await supabase.rpc('set_wallet_pin', {
        p_profile_id: profileId,
        p_raw_pin: pin,
      });

      if (error) {
        console.error('[wallet-pin] set_wallet_pin error:', error);
        return respond({ error: error.message || 'Failed to setup PIN' }, 500);
      }

      if (data?.status === 'PIN_ALREADY_SET') {
        return respond({ error: 'Transaction PIN has already been configured. Use change PIN instead.', code: 'PIN_ALREADY_SET' }, 400);
      }

      if (data?.status !== 'success') {
        return respond({ error: data?.message || 'Failed to setup PIN' }, 400);
      }

      return respond({ success: true, message: 'Transaction PIN successfully set' });
    }

    // ── 3. VERIFY (Verify PIN without money movement) ──────────────────────
    if (action === 'verify') {
      const pin = String(body.pin || '').trim();

      if (!/^\d{4}$/.test(pin)) {
        return respond({ error: 'PIN must be exactly 4 numeric digits', code: 'INVALID_PIN_FORMAT' }, 400);
      }

      const { data, error } = await supabase.rpc('check_wallet_pin', {
        p_profile_id: profileId,
        p_raw_pin: pin,
      });

      if (error) {
        console.error('[wallet-pin] check_wallet_pin error:', error);
        return respond({ error: 'Failed to verify PIN' }, 500);
      }

      if (data?.status === 'OK') {
        return respond({ success: true, message: 'PIN verified successfully' });
      }

      if (data?.status === 'WALLET_FROZEN') {
        dispatchNotification({
          type: 'WALLET_FROZEN',
          profileId,
          data: {},
        });

        return respond({
          error: data.message || 'Wallet has been frozen due to 5 incorrect attempts. Please contact support@taska.com.ng to submit an appeal.',
          code: 'WALLET_FROZEN',
          is_frozen: true,
          attempts_remaining: 0,
        }, 403);
      }

      if (data?.status === 'WRONG_PIN') {
        return respond({
          error: data.message || 'Incorrect PIN',
          code: 'WRONG_PIN',
          attempts_remaining: data.attempts_remaining,
        }, 403);
      }

      return respond({ error: data?.message || 'PIN verification failed', code: data?.status || 'ERROR' }, 400);
    }

    // ── 4. CHANGE (Change existing PIN using current PIN) ──────────────────
    if (action === 'change') {
      const currentPin = String(body.currentPin || '').trim();
      const newPin = String(body.newPin || '').trim();

      if (!/^\d{4}$/.test(currentPin)) {
        return respond({ error: 'Current PIN must be 4 digits', code: 'INVALID_CURRENT_PIN' }, 400);
      }

      if (!/^\d{4}$/.test(newPin)) {
        return respond({ error: 'New PIN must be 4 digits', code: 'INVALID_NEW_PIN' }, 400);
      }

      if (currentPin === newPin) {
        return respond({ error: 'New PIN must be different from current PIN', code: 'SAME_PIN' }, 400);
      }

      const { data, error } = await supabase.rpc('change_wallet_pin', {
        p_profile_id: profileId,
        p_current_raw_pin: currentPin,
        p_new_raw_pin: newPin,
      });

      if (error) {
        console.error('[wallet-pin] change_wallet_pin error:', error);
        return respond({ error: error.message || 'Failed to change PIN' }, 500);
      }

      if (data?.status === 'RATE_LIMITED') {
        return respond({
          error: data.message || 'You can only change your transaction PIN 3 times in 24 hours. Please try again later.',
          code: 'RATE_LIMITED',
        }, 429);
      }

      if (data?.status === 'WALLET_FROZEN') {
        dispatchNotification({
          type: 'WALLET_FROZEN',
          profileId,
          data: {},
        });

        return respond({
          error: data.message || 'Wallet has been frozen due to 5 incorrect attempts. Please contact support@taska.com.ng to submit an appeal.',
          code: 'WALLET_FROZEN',
          is_frozen: true,
          attempts_remaining: 0,
        }, 403);
      }

      if (data?.status === 'WRONG_PIN') {
        return respond({
          error: data.message || 'Current PIN is incorrect',
          code: 'WRONG_PIN',
          attempts_remaining: data.attempts_remaining,
        }, 403);
      }

      if (data?.status === 'success') {
        dispatchNotification({
          type: 'TRANSACTION_PIN_CHANGED',
          profileId,
          data: {},
        });

        return respond({
          success: true,
          message: 'Transaction PIN changed successfully',
        });
      }

      return respond({ error: data?.message || 'Failed to change PIN', code: data?.status || 'ERROR' }, 400);
    }

    // ── 5. GET RESET CHANNELS (Strict server-side contact lookup) ──────────
    if (action === 'get_reset_channels') {
      // Check if wallet is frozen: frozen wallets CANNOT reset their PIN!
      const { data: wallet } = await supabase
        .from('Wallet')
        .select('is_frozen')
        .eq('profileId', profileId)
        .maybeSingle();

      if (wallet?.is_frozen) {
        return respond({
          error: 'Your wallet has been frozen due to 5 incorrect attempts. You cannot reset your PIN. Please contact support@taska.com.ng to submit an appeal.',
          code: 'WALLET_FROZEN',
          is_frozen: true,
        }, 403);
      }

      const email = profile.email || '';
      const emailMasked = maskEmail(email);

      let hasPhone = false;
      let phoneMasked: string | null = null;

      if (profile.phone) {
        const phoneObj = formatNigerianPhone(profile.phone);
        if (phoneObj.isValid && phoneObj.core10) {
          hasPhone = true;
          phoneMasked = maskPhone(phoneObj.core10);
        }
      }

      const channels = ['email'];
      if (hasPhone) {
        channels.push('sms');
      }

      return respond({
        success: true,
        hasEmail: Boolean(email),
        emailMasked,
        hasPhone,
        phoneMasked,
        channels,
      });
    }

    // ── 6. SEND RESET OTP ──────────────────────────────────────────────────
    if (action === 'send_reset_otp') {
      // Check if wallet is frozen: frozen wallets CANNOT request reset OTP!
      const { data: wallet } = await supabase
        .from('Wallet')
        .select('is_frozen')
        .eq('profileId', profileId)
        .maybeSingle();

      if (wallet?.is_frozen) {
        return respond({
          error: 'Your wallet has been frozen due to 5 incorrect attempts. You cannot reset your PIN. Please contact support@taska.com.ng to submit an appeal.',
          code: 'WALLET_FROZEN',
          is_frozen: true,
        }, 403);
      }

      // User can choose channel: 'email' | 'sms'
      // We strictly ignore any phone or email passed in the request body!
      const channel = String(body.channel || 'email').toLowerCase();
      if (!['email', 'sms'].includes(channel)) {
        return respond({ error: 'Channel must be either email or sms' }, 400);
      }

      // Rate limit: 60-second cooldown between requests
      const sixtySecAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recentResets } = await supabase
        .from('wallet_pin_resets')
        .select('id, created_at')
        .eq('profile_id', profileId)
        .gte('created_at', sixtySecAgo);

      if (recentResets && recentResets.length > 0) {
        return respond({
          error: 'Please wait 60 seconds before requesting another code.',
          code: 'COOLDOWN_ACTIVE',
        }, 429);
      }

      // Rate limit: max 5 requests per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: hourCount } = await supabase
        .from('wallet_pin_resets')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .gte('created_at', oneHourAgo);

      if ((hourCount || 0) >= 5) {
        return respond({
          error: 'Too many PIN reset attempts. Please try again in an hour.',
          code: 'RATE_LIMITED',
        }, 429);
      }

      // Clean up previous unverified reset attempts for this user
      await supabase
        .from('wallet_pin_resets')
        .delete()
        .eq('profile_id', profileId)
        .eq('verified', false);

      // Handle SMS
      if (channel === 'sms') {
        if (!profile.phone) {
          return respond({
            error: 'No phone number registered to your account. Please use email verification.',
            code: 'NO_PHONE',
          }, 400);
        }

        const phoneObj = formatNigerianPhone(profile.phone);
        if (!phoneObj.isValid || !phoneObj.core10) {
          return respond({
            error: 'The phone number registered on your account is invalid. Please use email verification.',
            code: 'INVALID_PHONE',
          }, 400);
        }

        const termiiPayload = {
          api_key: TERMII_API_KEY,
          message_type: 'NUMERIC',
          pin_type: 'NUMERIC',
          to: phoneObj.formatted,
          from: TERMII_SENDER_ID,
          channel: 'dnd',
          pin_attempts: 3,
          pin_time_to_live: 10,
          pin_length: 6,
          pin_placeholder: '< 123456 >',
          message_text: 'Your Taska verification code is < 123456 >. Valid for 10 minutes. Do not share this code.',
        };

        const termiiRes = await fetch(`${TERMII_BASE_URL}/api/sms/otp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(termiiPayload),
        });

        const termiiData = await termiiRes.json();

        if (!termiiRes.ok || termiiData.error || !termiiData.pinId) {
          console.error('[wallet-pin] Termii Send Error:', termiiData);
          return respond({
            error: termiiData.message || termiiData.error || 'Failed to send SMS code. Please try email verification.',
          }, 400);
        }

        const phoneMasked = maskPhone(phoneObj.core10);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await supabase.from('wallet_pin_resets').insert({
          profile_id: profileId,
          channel: 'sms',
          destination_masked: phoneMasked,
          termii_pin_id: termiiData.pinId,
          expires_at: expiresAt,
        });

        return respond({
          success: true,
          channel: 'sms',
          destinationMasked: phoneMasked,
          message: `A 6-digit verification code was sent via SMS to ${phoneMasked}`,
        });
      }

      // Handle Email
      if (channel === 'email') {
        if (!profile.email) {
          return respond({ error: 'No email found on your account', code: 'NO_EMAIL' }, 400);
        }

        const emailMasked = maskEmail(profile.email);
        const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
        const otpHash = await computeSha256(otp + ':' + SUPABASE_SERVICE_ROLE_KEY);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        await supabase.from('wallet_pin_resets').insert({
          profile_id: profileId,
          channel: 'email',
          destination_masked: emailMasked,
          otp_hash: otpHash,
          expires_at: expiresAt,
        });

        // Dispatch Email with branded template
        await dispatchNotification({
          type: 'TRANSACTION_PIN_RESET_OTP',
          profileId,
          toEmail: profile.email,
          recipientName: profile.firstName || profile.username,
          data: {
            otp,
          },
        });

        return respond({
          success: true,
          channel: 'email',
          destinationMasked: emailMasked,
          message: `A 6-digit verification code was sent to ${emailMasked}`,
        });
      }
    }

    // ── 7. VERIFY RESET OTP ────────────────────────────────────────────────
    if (action === 'verify_reset_otp') {
      const otp = String(body.otp || '').trim();

      if (!/^\d{6}$/.test(otp)) {
        return respond({ error: 'Please enter a valid 6-digit verification code', code: 'INVALID_OTP_FORMAT' }, 400);
      }

      const { data: record, error: findErr } = await supabase
        .from('wallet_pin_resets')
        .select('*')
        .eq('profile_id', profileId)
        .eq('verified', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findErr || !record) {
        return respond({
          error: 'Verification code has expired or is invalid. Please request a new code.',
          code: 'EXPIRED_OR_INVALID',
        }, 400);
      }

      if (record.attempts >= 5) {
        return respond({
          error: 'Too many incorrect attempts. Please request a new verification code.',
          code: 'TOO_MANY_ATTEMPTS',
        }, 429);
      }

      let isVerified = false;

      if (record.channel === 'sms') {
        const termiiRes = await fetch(`${TERMII_BASE_URL}/api/sms/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: TERMII_API_KEY,
            pin_id: record.termii_pin_id,
            pin: otp,
          }),
        });
        const verifyData = await termiiRes.json();
        isVerified = Boolean(
          verifyData.verified === true ||
          verifyData.verified === 'true' ||
          (verifyData.status === 200 && verifyData.verified)
        );
      } else if (record.channel === 'email') {
        const expectedHash = await computeSha256(otp + ':' + SUPABASE_SERVICE_ROLE_KEY);
        isVerified = (expectedHash === record.otp_hash);
      }

      if (!isVerified) {
        await supabase
          .from('wallet_pin_resets')
          .update({ attempts: record.attempts + 1 })
          .eq('id', record.id);

        const remaining = Math.max(0, 5 - (record.attempts + 1));
        return respond({
          error: 'Incorrect verification code. Please check and try again.',
          attempts_remaining: remaining,
        }, 400);
      }

      // Generate secure 15-minute reset token
      const resetToken = crypto.randomUUID() + '-' + crypto.randomUUID();
      const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      await supabase
        .from('wallet_pin_resets')
        .update({
          verified: true,
          reset_token: resetToken,
          token_expires_at: tokenExpiresAt,
        })
        .eq('id', record.id);

      return respond({
        success: true,
        resetToken,
        message: 'Code verified successfully. Please enter your new 4-digit Transaction PIN.',
      });
    }

    // ── 8. RESET PIN WITH TOKEN ────────────────────────────────────────────
    if (action === 'reset_pin_with_token') {
      const resetToken = String(body.resetToken || '').trim();
      const newPin = String(body.newPin || '').trim();

      if (!resetToken) {
        return respond({ error: 'Reset token is required', code: 'MISSING_TOKEN' }, 400);
      }

      if (!/^\d{4}$/.test(newPin)) {
        return respond({ error: 'New PIN must be exactly 4 numeric digits', code: 'INVALID_NEW_PIN' }, 400);
      }

      const { data, error } = await supabase.rpc('reset_wallet_pin_with_otp', {
        p_profile_id: profileId,
        p_reset_token: resetToken,
        p_new_raw_pin: newPin,
      });

      if (error) {
        console.error('[wallet-pin] reset_wallet_pin_with_otp error:', error);
        return respond({ error: error.message || 'Failed to reset PIN' }, 500);
      }

      if (data?.status !== 'success') {
        return respond({ error: data?.message || 'Failed to reset PIN', code: data?.status || 'ERROR' }, 400);
      }

      // Dispatch security alert
      dispatchNotification({
        type: 'TRANSACTION_PIN_CHANGED',
        profileId,
        data: {},
      });

      return respond({
        success: true,
        message: 'Transaction PIN has been successfully reset! Wallet access is fully restored.',
      });
    }

    return respond({ error: `Invalid action: ${action}` }, 400);
  } catch (err: any) {
    console.error('[wallet-pin] Unhandled error:', err);
    return respond({ error: 'Internal server error' }, 500);
  }
});
