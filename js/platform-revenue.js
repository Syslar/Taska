/**
 * Taska Platform Revenue Utility
 * Shared helper for recording platform fees into the Taska Master Treasury Account
 * and the PlatformRevenue audit ledger.
 * 
 * Load this script on any page that triggers financial transactions.
 * It exposes: window.recordPlatformRevenue(type, feeAmount, grossAmount, sourceProfileId, reference, note)
 */

// Taska Master Treasury IDs (safe internal accounting identifiers - no user secrets exposed)
window.TASKA_TREASURY_WALLET_ID  = '4231da9f-6e94-45b2-a3ee-9dbe47f74284';
window.TASKA_TREASURY_PROFILE_ID = '6fbcb633-16ad-4d02-bd6e-8115d270d4e4';

/**
 * Records a platform revenue entry and credits the Taska Treasury Wallet.
 * @param {string} type - Revenue type: 'DEPOSIT_FEE', 'WITHDRAWAL_FEE', 'TASK_COMMISSION'
 * @param {number} feeAmount - Exact fee amount to collect (e.g. 500 for 10% of 5000)
 * @param {number} grossAmount - Gross transaction amount before fee (e.g. 5000)
 * @param {string|null} sourceProfileId - Profile ID of the user being charged
 * @param {string|null} reference - Transaction reference string
 * @param {string|null} note - Human-readable description
 */
window.recordPlatformRevenue = async function (type, feeAmount, grossAmount, sourceProfileId, reference, note) {
  if (!window.supabaseClient) {
    console.warn('[Treasury] supabaseClient not ready - fee not recorded');
    return;
  }
  if (!feeAmount || feeAmount <= 0) return;

  const ref = reference || `REV_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

  try {
    // Step 1: Insert into PlatformRevenue audit ledger
    const { error: revErr } = await window.supabaseClient
      .from('PlatformRevenue')
      .insert({
        type,
        amount: feeAmount,
        grossAmount: grossAmount || feeAmount,
        sourceProfileId: sourceProfileId || null,
        reference: ref,
        note: note || `Platform revenue for ${type}`,
        createdAt: new Date().toISOString()
      });
    if (revErr) console.error('[Treasury] PlatformRevenue insert failed:', revErr);

    // Step 2: Fetch Taska Treasury Wallet balance directly by its known UUID
    const { data: tWallet, error: wErr } = await window.supabaseClient
      .from('Wallet')
      .select('id, balance, lifetimeEarned')
      .eq('id', window.TASKA_TREASURY_WALLET_ID)
      .maybeSingle();

    if (wErr) {
      console.error('[Treasury] Wallet fetch failed:', wErr);
      return;
    }

    if (!tWallet) {
      // Recreate treasury wallet if somehow missing
      const { error: cErr } = await window.supabaseClient
        .from('Wallet')
        .insert({
          id: window.TASKA_TREASURY_WALLET_ID,
          profileId: window.TASKA_TREASURY_PROFILE_ID,
          balance: feeAmount,
          escrowBalance: 0,
          lifetimeEarned: feeAmount,
          lifetimeWithdrawn: 0
        });
      if (cErr) console.error('[Treasury] Wallet re-creation failed:', cErr);
    } else {
      // Step 3: Credit fee into Treasury Wallet
      const { error: uErr } = await window.supabaseClient
        .from('Wallet')
        .update({
          balance: (tWallet.balance || 0) + feeAmount,
          lifetimeEarned: (tWallet.lifetimeEarned || 0) + feeAmount,
          updatedAt: new Date().toISOString()
        })
        .eq('id', window.TASKA_TREASURY_WALLET_ID);
      if (uErr) console.error('[Treasury] Wallet credit failed:', uErr);
    }

    // Step 4: Log WalletTransaction for treasury traceability
    const { error: txErr } = await window.supabaseClient
      .from('WalletTransaction')
      .insert({
        walletId: window.TASKA_TREASURY_WALLET_ID,
        amount: feeAmount,
        type: 'TASK_PAYOUT',
        reference: ref,
        note: note || `Platform revenue: ${type}`,
        createdAt: new Date().toISOString()
      });
    if (txErr) console.error('[Treasury] WalletTransaction insert failed:', txErr);

  } catch (err) {
    console.error('[Treasury] recordPlatformRevenue unhandled error:', err);
  }
};
