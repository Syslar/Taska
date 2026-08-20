// supabase/functions/resolve-account/index.ts
// POST https://<project>.supabase.co/functions/v1/resolve-account
//
// Resolves a Nigerian bank account number to get the real account holder's name.
// Calls Paystack's live account resolution API server-side.

const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await req.json(); } catch {
    return respond({ error: 'Invalid JSON' }, 400);
  }

  const { accountNumber, bankCode } = body;
  const cleanAccount = (accountNumber || '').replace(/\D/g, '');

  if (cleanAccount.length !== 10 || !bankCode) {
    return respond({ error: 'Valid 10-digit account number and bank code required' }, 400);
  }

  try {
    const res = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${cleanAccount}&bank_code=${bankCode}`,
      { headers: { 'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const data = await res.json();

    if (data.status && data.data?.account_name) {
      return respond({
        success: true,
        account_name: data.data.account_name,
        account_number: data.data.account_number,
        bank_id: data.data.bank_id,
      });
    }

    return respond({
      success: false,
      error: data.message || 'Could not resolve bank account. Please verify details.',
    }, 400);

  } catch (err) {
    console.error('[resolve-account] Error:', err);
    return respond({ error: 'Bank account resolution request failed' }, 500);
  }
});
