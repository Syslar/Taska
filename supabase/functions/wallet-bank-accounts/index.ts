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
      .select('id, userId, firstName, middleName, lastName, email, username')
      .eq('id', targetProfileId)
      .maybeSingle();

    if (error || !profile) {
      return { error: 'Profile not found', status: 404 };
    }

    if (profile.userId !== clerkUserId) {
      return { error: 'Unauthorized', status: 403 };
    }

    return { ok: true, clerkUserId, profile };
  } catch (err: any) {
    console.error('[wallet-bank-accounts] Auth error:', err.message || err);
    return { error: 'Invalid or expired session token. Please log in again.', status: 401 };
  }
}

function maskEmail(email: string) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.substring(0, 2)}***${local.substring(local.length - 1)}@${domain}`;
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

  const { profileId, action } = body;
  if (!profileId || !action) {
    return respond({ error: 'profileId and action are required' }, 400);
  }

  const authResult = await authenticateCaller(req, supabase, profileId);
  if (authResult.error) {
    return respond({ error: authResult.error }, authResult.status || 401);
  }
  const { profile } = authResult;

  // 1. LIST
  if (action === 'list') {
    const { data: recipients, error } = await supabase
      .from('paystack_recipients')
      .select('id, account_number, account_name, bank_name, bank_code, created_at')
      .eq('profileId', profileId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) return respond({ error: 'Failed to fetch bank accounts' }, 500);
    return respond({ success: true, accounts: recipients || [] });
  }

  // 1.5 RESOLVE
  if (action === 'resolve') {
    const { accountNumber, bankCode } = body;
    if (!accountNumber || !bankCode) return respond({ error: 'Account number and bank code required' }, 400);

    try {
      const resolveRes = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber.replace(/\D/g, '')}&bank_code=${bankCode}`, {
        method: 'GET',
        headers: paystackHeaders,
      });
      const resolveData = await resolveRes.json();
      if (resolveData.status && resolveData.data?.account_name) {
        return respond({ success: true, accountName: resolveData.data.account_name });
      } else {
        console.error('[wallet-bank-accounts] Paystack resolve failed:', resolveData);
        return respond({ error: resolveData.message || 'Could not verify bank account.' }, 400);
      }
    } catch (err) {
      console.error('[wallet-bank-accounts] Bank resolution error:', err);
      return respond({ error: 'An error occurred while verifying the bank account details.' }, 500);
    }
  }

  // 2. SEND OTP
  if (action === 'send_otp') {
    const { accountNumber, bankCode } = body;
    if (!accountNumber || !bankCode) return respond({ error: 'Account number and bank code required' }, 400);

    let resolvedBankName = '';
    try {
      const resolveRes = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber.replace(/\D/g, '')}&bank_code=${bankCode}`, {
        method: 'GET',
        headers: paystackHeaders,
      });
      const resolveData = await resolveRes.json();
      if (resolveData.status && resolveData.data?.account_name) {
        resolvedBankName = resolveData.data.account_name;
      } else {
        console.error('[wallet-bank-accounts] Paystack resolve failed in send_otp:', resolveData);
        return respond({ error: resolveData.message || 'Could not verify bank account.' }, 400);
      }
    } catch (err) {
      console.error('[wallet-bank-accounts] Bank resolution error:', err);
      return respond({ error: 'An error occurred while verifying the bank account details.' }, 500);
    }

    if (!profile.email) {
      return respond({ error: 'No email found on your account. Please update your profile.', code: 'NO_EMAIL' }, 400);
    }

    const emailMasked = maskEmail(profile.email);
    const otp = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
    
    const msgBuffer = new TextEncoder().encode(otp + ':' + SUPABASE_SERVICE_ROLE_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const otpHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from('wallet_bank_account_otps').insert({
      profile_id: profileId,
      otp_hash: otpHash,
      account_number: accountNumber.replace(/\D/g, ''),
      bank_code: bankCode,
      account_name: resolvedBankName,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error('[wallet-bank-accounts] Insert OTP error:', insertError);
      return respond({ error: 'Failed to initialize verification process' }, 500);
    }

    // Send email via send-notification edge function
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'CUSTOM',
          profileId,
          toEmail: profile.email,
          recipientName: profile.firstName || profile.username || 'User',
          customSubject: 'Taska Bank Account Verification Code',
          customBody: `You are attempting to add a new bank account (<strong>${resolvedBankName}</strong> - <code>${accountNumber.replace(/\\D/g, '')}</code>) to your Taska wallet. Your verification code is: <div style="font-size:32px;font-weight:bold;letter-spacing:4px;margin:20px 0;color:#146C34;">${otp}</div> This code expires in 10 minutes. If you did not request this, please ignore this email.`,
          customCtaText: 'Go to Wallet',
          customCtaUrl: `${FRONTEND_API_URL.replace('.clerk.accounts.dev', '')}/wallet`,
          data: { otp, accountName: resolvedBankName, accountNumber: accountNumber.replace(/\\D/g, '') }
        }),
      });
    } catch (err) {
      console.error('[wallet-bank-accounts] Dispatch Notification Error:', err);
    }

    return respond({
      success: true,
      message: `A 6-digit verification code was sent to ${emailMasked}`,
      accountName: resolvedBankName
    });
  }

  // 3. VERIFY AND SAVE
  if (action === 'verify_and_save') {
    const { otp } = body;
    if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
      return respond({ error: 'Please enter a valid 6-digit verification code' }, 400);
    }

    // Find the latest valid OTP for this user
    const { data: otpRecords, error: fetchError } = await supabase
      .from('wallet_bank_account_otps')
      .select('*')
      .eq('profile_id', profileId)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError || !otpRecords || otpRecords.length === 0) {
      return respond({ error: 'Verification code has expired or is invalid. Please request a new one.' }, 400);
    }

    const record = otpRecords[0];

    const msgBuffer = new TextEncoder().encode(String(otp).trim() + ':' + SUPABASE_SERVICE_ROLE_KEY);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (expectedHash !== record.otp_hash) {
      return respond({ error: 'Incorrect verification code. Please try again.' }, 400);
    }

    // Create Paystack Recipient
    const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST',
      headers: paystackHeaders,
      body: JSON.stringify({
        type: 'nuban',
        name: record.account_name,
        account_number: record.account_number,
        bank_code: record.bank_code,
        currency: 'NGN',
      }),
    });
    const recipientData = await recipientRes.json();

    if (!recipientData.status || !recipientData.data?.recipient_code) {
      console.error('[wallet-bank-accounts] Recipient creation failed:', recipientData);
      return respond({ error: recipientData.message || 'Failed to create transfer recipient with Paystack.' }, 400);
    }

    const recipientCode = recipientData.data.recipient_code;
    const bankName = recipientData.data.details?.bank_name || '';

    // Insert into paystack_recipients
    const { data: insertedData, error: dbError } = await supabase.from('paystack_recipients').insert({
      profileId,
      recipient_code: recipientCode,
      bank_code: record.bank_code,
      account_number: record.account_number,
      account_name: record.account_name,
      bank_name: bankName,
      is_active: true,
    }).select().single();

    if (dbError) {
      console.error('[wallet-bank-accounts] DB Insert Error:', dbError);
      return respond({ error: `Database error: ${dbError.message || dbError.details || 'Failed to save bank account.'}` }, 500);
    }

    // Invalidate the OTP
    await supabase.from('wallet_bank_account_otps').delete().eq('id', record.id);

    return respond({ success: true, message: 'Bank account successfully saved!', account: insertedData });
  }
  
  if (action === 'delete') {
    const { accountId } = body;
    const { error: delError } = await supabase
      .from('paystack_recipients')
      .update({ is_active: false })
      .eq('id', accountId)
      .eq('profileId', profileId);
      
    if (delError) return respond({ error: 'Failed to delete bank account' }, 500);
    return respond({ success: true, message: 'Account removed' });
  }

  return respond({ error: 'Invalid action' }, 400);
});
