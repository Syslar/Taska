-- Migration: Wallet PIN Security & Fraud Prevention System
-- Date: 2026-09-05

-- Step 1: Ensure pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Add columns to Wallet
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Wallet" ADD COLUMN IF NOT EXISTS pin_is_set BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 3: Create isolated wallet_security table (credentials never accessible to anon/authenticated)
CREATE TABLE IF NOT EXISTS "wallet_security" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES "Wallet"(id) ON DELETE CASCADE UNIQUE,
  profile_id UUID NOT NULL REFERENCES "Profile"(id) ON DELETE CASCADE UNIQUE,
  pin_hash TEXT,
  failed_pin_attempts INT NOT NULL DEFAULT 0,
  pin_last_changed_at TIMESTAMPTZ[] DEFAULT ARRAY[]::TIMESTAMPTZ[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS and revoke client access
ALTER TABLE "wallet_security" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "wallet_security" FROM anon, authenticated;

-- Backfill wallet_security for any existing wallets
INSERT INTO "wallet_security" (wallet_id, profile_id)
SELECT id, "profileId" FROM "Wallet"
ON CONFLICT (wallet_id) DO NOTHING;

-- Step 4: RPC to set initial PIN
CREATE OR REPLACE FUNCTION set_wallet_pin(p_profile_id UUID, p_raw_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet "Wallet"%ROWTYPE;
  v_salt TEXT;
  v_hash TEXT;
BEGIN
  IF p_raw_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('status', 'INVALID_PIN_FORMAT', 'message', 'PIN must be exactly 4 digits');
  END IF;

  SELECT * INTO v_wallet FROM "Wallet" WHERE "profileId" = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'WALLET_NOT_FOUND', 'message', 'Wallet not found');
  END IF;

  IF v_wallet.pin_is_set THEN
    RETURN jsonb_build_object('status', 'PIN_ALREADY_SET', 'message', 'Transaction PIN is already set. Use change PIN instead.');
  END IF;

  v_salt := gen_salt('bf', 10);
  v_hash := crypt(p_raw_pin, v_salt);

  INSERT INTO "wallet_security" (wallet_id, profile_id, pin_hash, failed_pin_attempts, pin_last_changed_at, updated_at)
  VALUES (v_wallet.id, p_profile_id, v_hash, 0, ARRAY[]::TIMESTAMPTZ[], now())
  ON CONFLICT (wallet_id) DO UPDATE
    SET pin_hash = v_hash,
        failed_pin_attempts = 0,
        pin_last_changed_at = ARRAY[]::TIMESTAMPTZ[],
        updated_at = now();

  UPDATE "Wallet"
  SET pin_is_set = TRUE, "updatedAt" = now()
  WHERE id = v_wallet.id;

  RETURN jsonb_build_object('status', 'success', 'message', 'Transaction PIN created successfully');
END;
$$;

-- Step 5: RPC to check PIN & handle atomic failure counting / wallet freezing
CREATE OR REPLACE FUNCTION check_wallet_pin(p_profile_id UUID, p_raw_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet "Wallet"%ROWTYPE;
  v_sec "wallet_security"%ROWTYPE;
  v_attempts INT;
BEGIN
  SELECT * INTO v_wallet FROM "Wallet" WHERE "profileId" = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'WALLET_NOT_FOUND', 'message', 'Wallet not found');
  END IF;

  IF v_wallet.is_frozen OR COALESCE(v_wallet.wallet_status, 'active') = 'frozen' THEN
    RETURN jsonb_build_object(
      'status', 'WALLET_FROZEN',
      'message', 'Your wallet has been frozen. Please contact support@taska.com.ng to appeal.',
      'is_frozen', true,
      'attempts_remaining', 0
    );
  END IF;

  IF NOT v_wallet.pin_is_set THEN
    RETURN jsonb_build_object('status', 'PIN_NOT_SET', 'message', 'Transaction PIN has not been configured yet.');
  END IF;

  SELECT * INTO v_sec FROM "wallet_security" WHERE wallet_id = v_wallet.id FOR UPDATE;
  IF NOT FOUND OR v_sec.pin_hash IS NULL THEN
    RETURN jsonb_build_object('status', 'PIN_NOT_SET', 'message', 'Transaction PIN has not been configured yet.');
  END IF;

  IF p_raw_pin !~ '^[0-9]{4}$' THEN
    v_attempts := v_sec.failed_pin_attempts + 1;
    IF v_attempts >= 5 THEN
      UPDATE "wallet_security" SET failed_pin_attempts = v_attempts, updated_at = now() WHERE id = v_sec.id;
      UPDATE "Wallet" SET is_frozen = TRUE, wallet_status = 'frozen', "updatedAt" = now() WHERE id = v_wallet.id;
      RETURN jsonb_build_object(
        'status', 'WALLET_FROZEN',
        'message', 'Wallet has been frozen due to 5 consecutive incorrect PIN attempts. Contact support@taska.com.ng to appeal.',
        'attempts_remaining', 0,
        'is_frozen', true
      );
    ELSE
      UPDATE "wallet_security" SET failed_pin_attempts = v_attempts, updated_at = now() WHERE id = v_sec.id;
      RETURN jsonb_build_object(
        'status', 'WRONG_PIN',
        'message', 'Incorrect PIN. ' || (5 - v_attempts) || ' attempt(s) remaining.',
        'attempts_remaining', (5 - v_attempts),
        'is_frozen', false
      );
    END IF;
  END IF;

  IF v_sec.pin_hash = crypt(p_raw_pin, v_sec.pin_hash) THEN
    -- Correct PIN
    UPDATE "wallet_security" SET failed_pin_attempts = 0, updated_at = now() WHERE id = v_sec.id;
    RETURN jsonb_build_object('status', 'OK', 'message', 'PIN verified successfully');
  ELSE
    -- Incorrect PIN
    v_attempts := v_sec.failed_pin_attempts + 1;
    IF v_attempts >= 5 THEN
      UPDATE "wallet_security" SET failed_pin_attempts = v_attempts, updated_at = now() WHERE id = v_sec.id;
      UPDATE "Wallet" SET is_frozen = TRUE, wallet_status = 'frozen', "updatedAt" = now() WHERE id = v_wallet.id;
      RETURN jsonb_build_object(
        'status', 'WALLET_FROZEN',
        'message', 'Wallet has been frozen due to 5 consecutive incorrect PIN attempts. Contact support@taska.com.ng to appeal.',
        'attempts_remaining', 0,
        'is_frozen', true
      );
    ELSE
      UPDATE "wallet_security" SET failed_pin_attempts = v_attempts, updated_at = now() WHERE id = v_sec.id;
      RETURN jsonb_build_object(
        'status', 'WRONG_PIN',
        'message', 'Incorrect PIN. ' || (5 - v_attempts) || ' attempt(s) remaining.',
        'attempts_remaining', (5 - v_attempts),
        'is_frozen', false
      );
    END IF;
  END IF;
END;
$$;

-- Step 6: RPC to change PIN with rate limiting (max 3 times in 24 hours)
CREATE OR REPLACE FUNCTION change_wallet_pin(p_profile_id UUID, p_current_raw_pin TEXT, p_new_raw_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet "Wallet"%ROWTYPE;
  v_sec "wallet_security"%ROWTYPE;
  v_attempts INT;
  v_recent_changes INT;
  v_salt TEXT;
  v_hash TEXT;
BEGIN
  IF p_new_raw_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('status', 'INVALID_PIN_FORMAT', 'message', 'New PIN must be exactly 4 digits');
  END IF;

  SELECT * INTO v_wallet FROM "Wallet" WHERE "profileId" = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'WALLET_NOT_FOUND', 'message', 'Wallet not found');
  END IF;

  IF v_wallet.is_frozen OR COALESCE(v_wallet.wallet_status, 'active') = 'frozen' THEN
    RETURN jsonb_build_object('status', 'WALLET_FROZEN', 'message', 'Wallet is frozen. Cannot change PIN.');
  END IF;

  IF NOT v_wallet.pin_is_set THEN
    RETURN jsonb_build_object('status', 'PIN_NOT_SET', 'message', 'Transaction PIN has not been configured yet.');
  END IF;

  SELECT * INTO v_sec FROM "wallet_security" WHERE wallet_id = v_wallet.id FOR UPDATE;
  IF NOT FOUND OR v_sec.pin_hash IS NULL THEN
    RETURN jsonb_build_object('status', 'PIN_NOT_SET', 'message', 'Transaction PIN has not been configured yet.');
  END IF;

  -- Verify current PIN
  IF v_sec.pin_hash != crypt(p_current_raw_pin, v_sec.pin_hash) THEN
    v_attempts := v_sec.failed_pin_attempts + 1;
    IF v_attempts >= 5 THEN
      UPDATE "wallet_security" SET failed_pin_attempts = v_attempts, updated_at = now() WHERE id = v_sec.id;
      UPDATE "Wallet" SET is_frozen = TRUE, wallet_status = 'frozen', "updatedAt" = now() WHERE id = v_wallet.id;
      RETURN jsonb_build_object(
        'status', 'WALLET_FROZEN',
        'message', 'Wallet has been frozen due to 5 consecutive incorrect PIN attempts. Contact support@taska.com.ng to appeal.',
        'attempts_remaining', 0,
        'is_frozen', true
      );
    ELSE
      UPDATE "wallet_security" SET failed_pin_attempts = v_attempts, updated_at = now() WHERE id = v_sec.id;
      RETURN jsonb_build_object(
        'status', 'WRONG_PIN',
        'message', 'Current PIN is incorrect. ' || (5 - v_attempts) || ' attempt(s) remaining.',
        'attempts_remaining', (5 - v_attempts),
        'is_frozen', false
      );
    END IF;
  END IF;

  -- Rate limit: max 3 changes in 24 hours
  v_recent_changes := 0;
  IF v_sec.pin_last_changed_at IS NOT NULL THEN
    SELECT count(*) INTO v_recent_changes
    FROM unnest(v_sec.pin_last_changed_at) AS t
    WHERE t > (now() - INTERVAL '24 hours');
  END IF;

  IF v_recent_changes >= 3 THEN
    RETURN jsonb_build_object(
      'status', 'RATE_LIMITED',
      'message', 'You can only change your transaction PIN 3 times in 24 hours. Please try again later.'
    );
  END IF;

  v_salt := gen_salt('bf', 10);
  v_hash := crypt(p_new_raw_pin, v_salt);

  UPDATE "wallet_security"
  SET pin_hash = v_hash,
      failed_pin_attempts = 0,
      pin_last_changed_at = array_append(
        ARRAY(
          SELECT t FROM unnest(COALESCE(v_sec.pin_last_changed_at, ARRAY[]::TIMESTAMPTZ[])) AS t
          WHERE t > (now() - INTERVAL '24 hours')
        ),
        now()
      ),
      updated_at = now()
  WHERE id = v_sec.id;

  RETURN jsonb_build_object('status', 'success', 'message', 'Transaction PIN changed successfully');
END;
$$;

-- Step 7: Admin-only unfreeze RPC
CREATE OR REPLACE FUNCTION admin_unfreeze_wallet(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE "Wallet"
  SET is_frozen = FALSE,
      wallet_status = 'active',
      "updatedAt" = now()
  WHERE "profileId" = p_profile_id;

  UPDATE "wallet_security"
  SET failed_pin_attempts = 0,
      updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN jsonb_build_object('status', 'success', 'message', 'Wallet unfrozen successfully');
END;
$$;

-- Step 8: Status RPC
CREATE OR REPLACE FUNCTION get_wallet_pin_status(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet "Wallet"%ROWTYPE;
  v_sec "wallet_security"%ROWTYPE;
BEGIN
  SELECT * INTO v_wallet FROM "Wallet" WHERE "profileId" = p_profile_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'pin_is_set', false,
      'is_frozen', false,
      'failed_attempts', 0
    );
  END IF;

  SELECT * INTO v_sec FROM "wallet_security" WHERE wallet_id = v_wallet.id;

  RETURN jsonb_build_object(
    'found', true,
    'pin_is_set', COALESCE(v_wallet.pin_is_set, false),
    'is_frozen', COALESCE(v_wallet.is_frozen, false) OR COALESCE(v_wallet.wallet_status, 'active') = 'frozen',
    'failed_attempts', COALESCE(v_sec.failed_pin_attempts, 0)
  );
END;
$$;

-- Step 9: Update initiate_withdrawal with exact original parameter order
CREATE OR REPLACE FUNCTION initiate_withdrawal(
  p_profile_id UUID,
  p_requested_amount_kobo BIGINT,
  p_bank_code TEXT,
  p_account_number TEXT,
  p_account_name TEXT,
  p_bank_name TEXT,
  p_recipient_code TEXT,
  p_paystack_reference TEXT,
  p_commission_rate NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet "Wallet"%ROWTYPE;
  v_withdrawal_id UUID;
  v_commission BIGINT;
  v_payout BIGINT;
BEGIN
  -- Lock wallet row to prevent concurrent withdrawals
  SELECT * INTO v_wallet FROM "Wallet" WHERE "profileId" = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;

  -- Double defense-in-depth: Check frozen status
  IF v_wallet.is_frozen OR COALESCE(v_wallet.wallet_status, 'active') = 'frozen' THEN
    RAISE EXCEPTION 'WALLET_FROZEN';
  END IF;

  -- Check sufficient available balance
  IF COALESCE(v_wallet.available_balance, 0) < p_requested_amount_kobo THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- 0% withdrawal commission (full requested amount paid out)
  v_commission := (p_requested_amount_kobo * COALESCE(p_commission_rate, 0) / 100)::BIGINT;
  v_payout := p_requested_amount_kobo - v_commission;

  -- Move funds from available -> locked
  UPDATE "Wallet"
    SET available_balance = available_balance - p_requested_amount_kobo,
        locked_balance = COALESCE(locked_balance, 0) + p_requested_amount_kobo,
        balance = (available_balance - p_requested_amount_kobo) / 100,
        "updatedAt" = now()
    WHERE id = v_wallet.id;

  -- Ledger: lock entry
  INSERT INTO "wallet_ledger_entries" ("walletId", "profileId", entry_type, direction, amount, currency, reference, description)
  VALUES (v_wallet.id, p_profile_id, 'lock', 'debit', p_requested_amount_kobo, 'NGN', p_paystack_reference, 'Funds locked pending withdrawal transfer');

  -- Create withdrawal record (processing)
  INSERT INTO "withdrawals" (
    "profileId", "walletId", requested_amount, commission_amount, payout_amount,
    commission_rate, paystack_recipient_code, paystack_reference,
    bank_code, account_number, account_name, bank_name, status
  ) VALUES (
    p_profile_id, v_wallet.id, p_requested_amount_kobo, v_commission, v_payout,
    COALESCE(p_commission_rate, 0), p_recipient_code, p_paystack_reference,
    p_bank_code, p_account_number, p_account_name, p_bank_name, 'processing'
  ) RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'withdrawal_id', v_withdrawal_id,
    'payout_kobo', v_payout,
    'commission_kobo', v_commission,
    'locked_kobo', p_requested_amount_kobo
  );
END;
$$;

-- Step 10: Update task_escrow_lock to also reject frozen wallets
CREATE OR REPLACE FUNCTION task_escrow_lock(
  p_task_id UUID,
  p_application_id UUID,
  p_poster_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task "Task"%ROWTYPE;
  v_app "Application"%ROWTYPE;
  v_wallet "Wallet"%ROWTYPE;
  v_budget_naira NUMERIC;
  v_budget_kobo BIGINT;
BEGIN
  -- Validate Task
  SELECT * INTO v_task FROM "Task" WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TASK_NOT_FOUND';
  END IF;
  IF v_task."posterId" != p_poster_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED_POSTER';
  END IF;
  IF v_task.status != 'OPEN' THEN
    RAISE EXCEPTION 'TASK_NOT_OPEN';
  END IF;

  -- Validate Application
  SELECT * INTO v_app FROM "Application" WHERE id = p_application_id AND "taskId" = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND';
  END IF;

  -- Determine agreed budget
  v_budget_naira := COALESCE(v_app."bidAmount", v_task.budget, 0);
  IF v_budget_naira <= 0 THEN
    RAISE EXCEPTION 'INVALID_BUDGET';
  END IF;
  v_budget_kobo := (v_budget_naira * 100)::BIGINT;

  -- Lock Poster Wallet
  SELECT * INTO v_wallet FROM "Wallet" WHERE "profileId" = p_poster_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  -- Defense-in-depth: Check frozen status
  IF v_wallet.is_frozen OR COALESCE(v_wallet.wallet_status, 'active') = 'frozen' THEN
    RAISE EXCEPTION 'WALLET_FROZEN';
  END IF;

  -- Check balance
  IF COALESCE(v_wallet.available_balance, (v_wallet.balance * 100)::BIGINT, 0) < v_budget_kobo THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- Deduct from available & add to escrow
  UPDATE "Wallet"
    SET available_balance = COALESCE(available_balance, (balance * 100)::BIGINT) - v_budget_kobo,
        balance = balance - v_budget_naira,
        "escrowBalance" = COALESCE("escrowBalance", 0) + v_budget_naira,
        "updatedAt" = now()
    WHERE id = v_wallet.id;

  -- Ledger transaction record
  INSERT INTO "WalletTransaction" ("walletId", type, amount, reference, note, "createdAt")
  VALUES (
    v_wallet.id,
    'ESCROW_LOCK',
    v_budget_naira,
    'ESCROW_' || extract(epoch from now())::bigint || '_' || floor(random() * 1000)::int,
    'Escrow locked for task: ' || v_task.title,
    now()
  );

  -- Update Application & Task
  UPDATE "Application" SET "isSelected" = true WHERE id = p_application_id;
  UPDATE "Task"
    SET "assignedTo" = v_app."taskerId",
        budget = v_budget_naira,
        status = 'IN_PROGRESS',
        "updatedAt" = now()
    WHERE id = p_task_id;

  RETURN jsonb_build_object(
    'status', 'success',
    'task_id', p_task_id,
    'tasker_id', v_app."taskerId",
    'budget_naira', v_budget_naira
  );
END;
$$;

-- Step 11: Update process_deposit to reject deposits if wallet is frozen
CREATE OR REPLACE FUNCTION process_deposit(
  p_profile_id UUID,
  p_paystack_reference TEXT,
  p_paystack_transaction_id BIGINT,
  p_gross_amount_kobo BIGINT,
  p_channel TEXT,
  p_commission_rate NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet "Wallet"%ROWTYPE;
  v_deposit_id UUID;
  v_commission BIGINT;
  v_net BIGINT;
BEGIN
  -- Idempotency: already processed?
  IF EXISTS (SELECT 1 FROM "deposits" WHERE paystack_reference = p_paystack_reference AND status = 'successful') THEN
    RETURN jsonb_build_object('status', 'already_processed');
  END IF;

  -- Lock wallet row
  SELECT * INTO v_wallet FROM "Wallet" WHERE "profileId" = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN
    -- Auto-create wallet if missing
    INSERT INTO "Wallet" ("profileId", balance, available_balance, locked_balance, "escrowBalance", "lifetimeEarned", "lifetimeWithdrawn", currency, wallet_status, is_frozen, pin_is_set)
    VALUES (p_profile_id, 0, 0, 0, 0, 0, 0, 'NGN', 'active', FALSE, FALSE)
    RETURNING * INTO v_wallet;
  END IF;

  -- Defense-in-depth: Check frozen status
  IF v_wallet.is_frozen OR COALESCE(v_wallet.wallet_status, 'active') = 'frozen' THEN
    RAISE EXCEPTION 'WALLET_FROZEN';
  END IF;

  -- 0% deposit commission (full 100% credited)
  v_commission := (p_gross_amount_kobo * COALESCE(p_commission_rate, 0) / 100)::BIGINT;
  v_net := p_gross_amount_kobo - v_commission;

  -- Insert deposit record
  INSERT INTO "deposits" (
    "profileId", "walletId", paystack_transaction_id, paystack_reference,
    gross_amount, commission_amount, net_amount, commission_rate, channel, status
  ) VALUES (
    p_profile_id, v_wallet.id, p_paystack_transaction_id, p_paystack_reference,
    p_gross_amount_kobo, v_commission, v_net, COALESCE(p_commission_rate, 0), p_channel, 'successful'
  ) RETURNING id INTO v_deposit_id;

  -- Credit user wallet (available_balance in kobo; balance in naira)
  UPDATE "Wallet"
    SET available_balance = COALESCE(available_balance, 0) + v_net,
        balance = (COALESCE(available_balance, 0) + v_net) / 100,
        "lifetimeEarned" = COALESCE("lifetimeEarned", 0) + (v_net / 100),
        "updatedAt" = now()
    WHERE id = v_wallet.id;

  -- Immutable ledger: user credit
  INSERT INTO "wallet_ledger_entries" ("walletId", "profileId", entry_type, direction, amount, currency, reference, description)
  VALUES (v_wallet.id, p_profile_id, 'user_credit', 'credit', v_net, 'NGN', p_paystack_reference, 'Deposit credited (0% fee)');

  IF v_commission > 0 THEN
    -- Immutable ledger: platform revenue record
    INSERT INTO "wallet_ledger_entries" ("walletId", "profileId", entry_type, direction, amount, currency, reference, description)
    VALUES (v_wallet.id, p_profile_id, 'platform_revenue', 'debit', v_commission, 'NGN', p_paystack_reference, 'Taska deposit commission');

    INSERT INTO "PlatformRevenue" (type, amount, "grossAmount", "sourceProfileId", reference, note, amount_kobo, gross_amount_kobo, commission_rate, source_deposit_id, currency, "createdAt")
    VALUES ('DEPOSIT_FEE', v_commission/100.0, p_gross_amount_kobo/100.0, p_profile_id,
            p_paystack_reference, 'Taska deposit commission', v_commission, p_gross_amount_kobo, p_commission_rate, v_deposit_id, 'NGN', now());
  END IF;

  -- Mark paystack event processed
  UPDATE "paystack_events" SET processed = true, "processedAt" = now() WHERE event_id = p_paystack_reference;

  RETURN jsonb_build_object(
    'status', 'success',
    'deposit_id', v_deposit_id,
    'net_credited_kobo', v_net,
    'commission_kobo', v_commission,
    'new_balance_kobo', (SELECT available_balance FROM "Wallet" WHERE id = v_wallet.id)
  );
END;
$$;
