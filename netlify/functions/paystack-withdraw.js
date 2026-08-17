/**
 * Netlify Serverless Function: paystack-withdraw.js
 * 
 * Handles bank withdrawal transfers via Paystack Transfer API.
 * The Paystack secret key NEVER touches the client browser.
 * 
 * POST /api/paystack-withdraw
 * Body: { amount, bankCode, accountNumber, accountName, walletId, profileId, reference }
 * 
 * Flow:
 *  1. Validate request & deduct 10% Taska fee from amount
 *  2. Create Paystack Transfer Recipient for the user's bank account
 *  3. Initiate Paystack Transfer for the net amount (90%)
 *  4. Return transfer reference back to client for ledger logging
 */

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const TASKA_FEE_PERCENT = 0.10;

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!PAYSTACK_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Payment service not configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { amount, bankCode, accountNumber, accountName, reference } = body;

  // Input validation
  if (!amount || typeof amount !== 'number' || amount < 1000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Minimum withdrawal is ₦1,000' }) };
  }
  if (!bankCode || !accountNumber || accountNumber.replace(/\D/g, '').length !== 10) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid bank account details' }) };
  }

  // Calculate 10% Taska fee - we send 90% to user, 10% stays in Taska Paystack account
  const taskaFee = Math.round(amount * TASKA_FEE_PERCENT);
  const netTransferAmount = amount - taskaFee;

  const paystackHeaders = {
    'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json',
  };

  try {
    // Step 1: Create a Paystack Transfer Recipient for this bank account
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

    if (!recipientData.status || !recipientData.data?.recipient_code) {
      console.error('[Withdraw] Recipient creation failed:', recipientData);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: recipientData.message || 'Failed to create bank recipient' }),
      };
    }

    const recipientCode = recipientData.data.recipient_code;

    // Step 2: Initiate Paystack Transfer (net amount after 10% fee, in kobo)
    const transferRes = await fetch('https://api.paystack.co/transfer', {
      method: 'POST',
      headers: paystackHeaders,
      body: JSON.stringify({
        source: 'balance',                    // Transfer from Taska's Paystack balance
        amount: Math.round(netTransferAmount * 100), // in kobo
        recipient: recipientCode,
        reason: `Taska payout - ${reference || 'withdrawal'}`,
        reference: reference || `TK-WTH-${Date.now()}`,
        currency: 'NGN',
      }),
    });

    const transferData = await transferRes.json();

    if (!transferData.status) {
      console.error('[Withdraw] Transfer failed:', transferData);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: transferData.message || 'Bank transfer failed' }),
      };
    }

    // Success - return details so client can log the transaction
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        transferReference: transferData.data?.reference,
        netAmount: netTransferAmount,
        fee: taskaFee,
        grossAmount: amount,
        status: transferData.data?.status,
      }),
    };

  } catch (err) {
    console.error('[Withdraw] Unhandled error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error during transfer' }),
    };
  }
};
