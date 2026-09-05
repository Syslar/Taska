// supabase/functions/termii-otp/index.ts
// POST https://<project>.supabase.co/functions/v1/termii-otp
//
// Termii Phone Number OTP verification for Taska:
//   1. "send_otp": Strictly verifies uniqueness in Supabase BEFORE any request to Termii.
//                  If number exists on ANY account, rejects immediately with 400.
//                  Otherwise sends 6-digit numeric OTP via Termii Token API (channel: "dnd").
//   2. "verify_otp": Verifies user-entered OTP with Termii & updates Profile table.
//   3. "check_status": Queries current phone verification status for user/profile.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Termii Credentials
const TERMII_API_KEY = Deno.env.get('TERMII_API_KEY') || 'tlv_f_udRBaDruqa0gmOD2BKdg550ejbvYfK-MK4ifYACYA';
const TERMII_BASE_URL = (Deno.env.get('TERMII_BASE_URL') || 'https://api.ng.termii.com').replace(/\/$/, '');
const TERMII_SENDER_ID = 'OE Alert'; // Approved active Sender ID on Termii account

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Helper: Normalize and validate Nigerian Phone Number into 234XXXXXXXXXX format
function formatNigerianPhone(rawPhone: string): { formatted: string; isValid: boolean; display: string; core10: string } {
  if (!rawPhone) return { formatted: '', isValid: false, display: '', core10: '' };

  // Remove spaces, hyphens, parentheses, plus
  let cleaned = String(rawPhone).trim().replace(/[\s\-\(\)\+]/g, '');

  if (cleaned.startsWith('0') && cleaned.length === 11) {
    // 08031234567 -> 2348031234567
    cleaned = '234' + cleaned.substring(1);
  } else if (cleaned.length === 10 && !cleaned.startsWith('234')) {
    // 8031234567 -> 2348031234567
    cleaned = '234' + cleaned;
  }

  // Must be 13 digits starting with 234 and a valid operator prefix (7, 8, 9)
  const isValid = /^234[789][01]\d{8}$/.test(cleaned);
  const core10 = isValid ? cleaned.slice(3) : '';
  const display = isValid ? `+234 ${cleaned.slice(3, 6)} ${cleaned.slice(6, 9)} ${cleaned.slice(9)}` : rawPhone;

  return { formatted: cleaned, isValid, display, core10 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return respond({ error: 'Invalid JSON payload' }, 400);
  }

  const action = body.action || 'send_otp';

  // ── ACTION: SEND OTP ────────────────────────────────────────────────────────
  if (action === 'send_otp') {
    const rawPhone = body.phone;
    if (!rawPhone) {
      return respond({ error: 'Phone number is required' }, 400);
    }

    const { formatted, isValid, display, core10 } = formatNigerianPhone(rawPhone);
    if (!isValid || !core10) {
      return respond({
        error: 'Invalid Nigerian phone number. Please enter a valid 11-digit mobile number (e.g. 0803 123 4567).',
      }, 400);
    }

    // 1. STRICT Server-side phone uniqueness check against Supabase
    // If this phone number is already registered to ANY profile, reject immediately!
    // Never allow request to proceed to Termii or deduct money.
    try {
      const { data: existingUser, error: checkErr } = await supabase
        .from('Profile')
        .select('id, userId, username, phone')
        .ilike('phone', `%${core10}`)
        .maybeSingle();

      if (!checkErr && existingUser) {
        console.warn(`[termii-otp] Blocked: phone ${display} is already registered to user ${existingUser.username}`);
        return respond({
          error: 'This phone number is already registered to an existing Taska account.',
        }, 400);
      }
    } catch (dbErr) {
      console.error('[termii-otp] Phone uniqueness pre-check error:', dbErr);
    }

    // 2. Dispatch OTP via Termii Token API
    try {
      const termiiPayload = {
        api_key: TERMII_API_KEY,
        message_type: 'NUMERIC',
        pin_type: 'NUMERIC',
        to: formatted,
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
        console.error('[termii-otp] Termii Send Error:', termiiData);
        return respond({
          error: termiiData.message || termiiData.error || 'Failed to send OTP SMS. Please try again in 60 seconds.',
          details: termiiData,
        }, 400);
      }

      console.log('[termii-otp] OTP sent successfully to:', display, 'pinId:', termiiData.pinId);

      return respond({
        success: true,
        pinId: termiiData.pinId,
        phone: formatted,
        phoneDisplay: display,
        message: `A 6-digit verification code was sent to ${display}`,
      });

    } catch (err: any) {
      console.error('[termii-otp] Send OTP exception:', err);
      return respond({ error: 'Failed to send verification SMS', details: err.message || err }, 500);
    }
  }

  // ── ACTION: VERIFY OTP ──────────────────────────────────────────────────────
  if (action === 'verify_otp') {
    const { pinId, pin, phone, userId, profileId } = body;

    if (!pinId || !pin) {
      return respond({ error: 'Both pinId and 6-digit verification PIN are required' }, 400);
    }

    const cleanPin = String(pin).trim();
    if (cleanPin.length !== 6) {
      return respond({ error: 'Please enter a valid 6-digit code' }, 400);
    }

    try {
      const verifyPayload = {
        api_key: TERMII_API_KEY,
        pin_id: pinId,
        pin: cleanPin,
      };

      const termiiRes = await fetch(`${TERMII_BASE_URL}/api/sms/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyPayload),
      });

      const verifyData = await termiiRes.json();

      const isVerified = (
        verifyData.verified === true ||
        verifyData.verified === 'true' ||
        (verifyData.status === 200 && verifyData.verified) ||
        (verifyData.pinId && verifyData.verified === true)
      );

      if (!isVerified) {
        console.warn('[termii-otp] Verification failed:', verifyData);
        return respond({
          success: false,
          verified: false,
          error: verifyData.message || 'Incorrect or expired verification code. Please check and try again.',
        }, 400);
      }

      const { formatted, display, core10 } = formatNigerianPhone(phone || verifyData.msisdn || '');

      // Double-check uniqueness right before updating Profile
      if (core10) {
        let doubleCheck = supabase
          .from('Profile')
          .select('id')
          .ilike('phone', `%${core10}`);

        if (profileId) {
          doubleCheck = doubleCheck.neq('id', profileId);
        } else if (userId) {
          doubleCheck = doubleCheck.neq('userId', userId);
        }

        const { data: alreadyTaken } = await doubleCheck.maybeSingle();
        if (alreadyTaken) {
          return respond({
            success: false,
            verified: false,
            error: 'This phone number has already been registered to another Taska account.',
          }, 400);
        }
      }

      // Update Supabase Profile upon successful verification
      let updatedProfile: any = null;

      if (userId || profileId) {
        const canonicalPhone = formatted ? ('+' + formatted) : null;
        const updatePayload: any = {
          isPhoneVerified: true,
          phoneVerifiedAt: new Date().toISOString(),
        };
        if (canonicalPhone) {
          updatePayload.phone = canonicalPhone;
        }

        let query = supabase.from('Profile').update(updatePayload);
        if (userId) {
          query = query.eq('userId', userId);
        } else if (profileId) {
          query = query.eq('id', profileId);
        }

        const { data: prof, error: updateErr } = await query.select().maybeSingle();
        if (updateErr) {
          console.error('[termii-otp] Error updating Profile:', updateErr);
        } else {
          updatedProfile = prof;
        }

        // Record in-app notification
        const targetClerkId = userId || updatedProfile?.userId;
        if (targetClerkId) {
          try {
            await supabase.from('Notification').insert({
              userId: targetClerkId,
              type: 'PHONE_VERIFIED',
              title: 'Phone Number Verified',
              body: `Your phone number (${display || canonicalPhone || 'Mobile'}) has been successfully verified on Taska.`,
              isRead: false,
              link: '/Settings/index.html',
              createdAt: new Date().toISOString(),
            });
          } catch (_) {}
        }
      }

      console.log('[termii-otp] Verification SUCCESS for phone:', formatted, 'User:', userId || profileId);

      return respond({
        success: true,
        verified: true,
        phone: formatted ? ('+' + formatted) : '',
        phoneDisplay: display,
        profile: updatedProfile,
        message: 'Phone number verified successfully!',
      });

    } catch (err: any) {
      console.error('[termii-otp] Verify OTP exception:', err);
      return respond({ error: 'Failed to verify code', details: err.message || err }, 500);
    }
  }

  // ── ACTION: CHECK STATUS ────────────────────────────────────────────────────
  if (action === 'check_status') {
    const { userId, profileId } = body;
    if (!userId && !profileId) {
      return respond({ error: 'userId or profileId is required' }, 400);
    }

    let query = supabase.from('Profile').select('id, userId, phone, isPhoneVerified, phoneVerifiedAt');
    if (userId) query = query.eq('userId', userId);
    else if (profileId) query = query.eq('id', profileId);

    const { data: profile } = await query.maybeSingle();

    return respond({
      success: true,
      isPhoneVerified: Boolean(profile?.isPhoneVerified),
      phone: profile?.phone || null,
      phoneVerifiedAt: profile?.phoneVerifiedAt || null,
    });
  }

  return respond({ error: `Unknown action "${action}"` }, 400);
});
