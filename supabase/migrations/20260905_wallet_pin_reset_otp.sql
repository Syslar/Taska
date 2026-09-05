-- Migration: Self-Service Transaction PIN Reset via OTP (Email & Phone)
-- Date: 2026-09-05

-- Step 1: Create isolated wallet_pin_resets table
CREATE TABLE IF NOT EXISTS public.wallet_pin_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public."Profile"(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  destination_masked TEXT NOT NULL,
  otp_hash TEXT,
  termii_pin_id TEXT,
  attempts INT NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  reset_token TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 2: Enable RLS and revoke all client access (accessible only via service role and security definer RPCs)
ALTER TABLE public.wallet_pin_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_pin_resets FROM anon, authenticated;

-- Step 3: Index for fast lookup by profile and token
CREATE INDEX IF NOT EXISTS idx_wallet_pin_resets_profile_id ON public.wallet_pin_resets(profile_id);
CREATE INDEX IF NOT EXISTS idx_wallet_pin_resets_token ON public.wallet_pin_resets(reset_token);

-- Step 4: RPC to atomically reset PIN with a verified token
CREATE OR REPLACE FUNCTION public.reset_wallet_pin_with_otp(
  p_profile_id UUID,
  p_reset_token TEXT,
  p_new_raw_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reset RECORD;
  v_wallet RECORD;
  v_salt TEXT;
  v_new_hash TEXT;
BEGIN
  -- 1. Validate PIN format: exactly 4 numeric digits
  IF p_new_raw_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('status', 'INVALID_PIN_FORMAT', 'message', 'PIN must be exactly 4 numeric digits');
  END IF;

  -- 2. Verify token validity in wallet_pin_resets
  SELECT * INTO v_reset
  FROM public.wallet_pin_resets
  WHERE profile_id = p_profile_id
    AND reset_token = p_reset_token
    AND verified = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'INVALID_TOKEN', 'message', 'Invalid or unrecognized reset session');
  END IF;

  IF v_reset.token_expires_at < now() THEN
    DELETE FROM public.wallet_pin_resets WHERE id = v_reset.id;
    RETURN jsonb_build_object('status', 'TOKEN_EXPIRED', 'message', 'Reset session has expired. Please request a new verification code.');
  END IF;

  -- 3. Lock Wallet and STRICTLY ensure wallet is NOT frozen!
  SELECT * INTO v_wallet
  FROM public."Wallet"
  WHERE "profileId" = p_profile_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'WALLET_NOT_FOUND', 'message', 'User wallet not found');
  END IF;

  IF v_wallet.is_frozen THEN
    RETURN jsonb_build_object(
      'status', 'WALLET_FROZEN',
      'message', 'Your wallet has been frozen. You cannot reset your PIN. Please contact support@taska.com.ng to submit an appeal.'
    );
  END IF;

  -- 4. Hash new PIN with bcrypt (cost 10)
  v_salt := gen_salt('bf', 10);
  v_new_hash := crypt(p_new_raw_pin, v_salt);

  -- 5. Update or insert into wallet_security
  INSERT INTO public.wallet_security (
    wallet_id,
    profile_id,
    pin_hash,
    failed_pin_attempts,
    pin_last_changed_at,
    updated_at
  )
  VALUES (
    v_wallet.id,
    p_profile_id,
    v_new_hash,
    0,
    ARRAY[now()]::TIMESTAMPTZ[],
    now()
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET
    pin_hash = EXCLUDED.pin_hash,
    failed_pin_attempts = 0,
    pin_last_changed_at = array_append(
      ARRAY(
        SELECT t FROM unnest(wallet_security.pin_last_changed_at) AS t
        WHERE t > now() - INTERVAL '24 hours'
      ),
      now()
    ),
    updated_at = now();

  -- 6. Mark PIN as set
  UPDATE public."Wallet"
  SET pin_is_set = TRUE
  WHERE id = v_wallet.id;

  -- 7. Invalidate the reset token to prevent any replay
  DELETE FROM public.wallet_pin_resets WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'message', 'Transaction PIN has been successfully reset and wallet access restored'
  );
END;
$$;
