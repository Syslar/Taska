import { formatNigerianPhone } from '../utils/phone';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

// ─── In-Memory PIN Store ──────────────────────────────────────────────────────
// Stores { pinId → { phone, expiresAt } } for the duration of OTP verification.
// NOTE: This is an MVP solution only. Migrate to Redis when scaling.
// TTL is 10 minutes (matches Termii's pin_time_to_live setting).

interface PinEntry {
  phone: string;
  expiresAt: number; // Unix timestamp ms
}

const pinStore = new Map<string, PinEntry>();

// Clean up expired entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of pinStore.entries()) {
    if (entry.expiresAt < now) pinStore.delete(id);
  }
}, 5 * 60 * 1000);

// ─── Verified Phone Store ─────────────────────────────────────────────────────
// After a phone OTP is verified via Termii, we record it here so /auth/register
// can confirm the phone was recently verified without requiring a Supabase token.
// TTL is 15 minutes — enough time to complete registration.

const verifiedPhones = new Map<string, number>(); // phone → expiresAt

setInterval(() => {
  const now = Date.now();
  for (const [phone, expiresAt] of verifiedPhones.entries()) {
    if (expiresAt < now) verifiedPhones.delete(phone);
  }
}, 5 * 60 * 1000);

export function markPhoneVerified(phone: string): void {
  const formatted = formatNigerianPhone(phone);
  verifiedPhones.set(formatted, Date.now() + 15 * 60 * 1000);
}

export function isPhoneVerified(phone: string): boolean {
  const formatted = formatNigerianPhone(phone);
  const expiresAt = verifiedPhones.get(formatted);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    verifiedPhones.delete(formatted);
    return false;
  }
  return true;
}

// ─── sendOtp ──────────────────────────────────────────────────────────────────

/**
 * Send a 6-digit numeric OTP to a Nigerian phone number via Termii (DND channel).
 * Returns the pinId needed to verify the OTP later.
 */
export async function sendOtp(phone: string): Promise<{ pinId: string }> {
  const formatted = formatNigerianPhone(phone);

  const response = await fetch('https://api.ng.termii.com/api/sms/otp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key:          process.env.TERMII_API_KEY,
      message_type:     'NUMERIC',
      to:               formatted,
      from:             process.env.TERMII_SENDER_ID,
      channel:          'dnd', // DND bypass — required for Nigerian numbers
      pin_attempts:     3,
      pin_time_to_live: 10,   // minutes
      pin_length:       6,
      pin_placeholder:  '< 1234 >',
      message_text:     'Your Taska verification code is < 1234 >. Valid for 10 minutes. Do not share this code.',
      pin_type:         'NUMERIC',
    }),
  });

  if (!response.ok) {
    logger.error('Termii OTP send failed', { status: response.status });
    throw new AppError('Failed to send OTP. Please try again.', 500);
  }

  const data = (await response.json()) as { pinId?: string; message?: string };

  if (!data.pinId) {
    logger.error('Termii did not return pinId', { data });
    throw new AppError('Failed to send OTP. Please try again.', 500);
  }

  // Store the pinId → phone mapping with 10-minute TTL
  pinStore.set(data.pinId, {
    phone: formatted,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  logger.info('OTP sent via Termii', { phone: formatted });

  return { pinId: data.pinId };
}

// ─── verifyOtp ────────────────────────────────────────────────────────────────

/**
 * Verify an OTP using the pinId returned from sendOtp and the user-entered pin.
 * Returns true if valid, false if invalid or expired.
 */
export async function verifyOtp(pinId: string, pin: string): Promise<boolean> {
  const entry = pinStore.get(pinId);

  if (!entry) {
    // pinId not found — either expired from store or never existed
    return false;
  }

  if (entry.expiresAt < Date.now()) {
    pinStore.delete(pinId);
    return false;
  }

  const response = await fetch('https://api.ng.termii.com/api/sms/otp/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.TERMII_API_KEY,
      pin_id:  pinId,
      pin,
    }),
  });

  if (!response.ok) {
    logger.error('Termii OTP verify failed', { status: response.status });
    return false;
  }

  const data = (await response.json()) as { verified?: string | boolean; message?: string };

  const verified = data.verified === true || data.verified === 'true';

  if (verified) {
    // Remove pinId from store — one-time use
    pinStore.delete(pinId);
    logger.info('OTP verified via Termii', { phone: entry.phone });
  }

  return verified;
}
