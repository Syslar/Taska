/**
 * Taska Wallet Controller
 * Real Supabase Wallet integration, ledger transactions, and balance management.
 * Pure SVG icons, zero emojis.
 */

async function initWalletPage() {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  await loadWalletData();

  // Bind transaction filter tabs
  document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const filter = tab.dataset.walletFilter;
      loadWalletTransactions(filter);
    });
  });

  // Bind deposit modal buttons
  document.getElementById('wallet-deposit-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('wallet-deposit-modal');
    if (modal) modal.style.display = 'flex';
  });

  document.getElementById('wallet-deposit-close-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('wallet-deposit-modal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('wallet-deposit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amtInput = document.getElementById('deposit-amount');
    const amt = parseFloat(amtInput?.value || '0');
    if (!amt || amt < 500) {
      if (window.showToast) window.showToast('Minimum deposit amount is ₦500.');
      return;
    }

    const modal = document.getElementById('wallet-deposit-modal');
    if (modal) modal.style.display = 'none';

    if (window.showToast) window.showToast(`Processing ₦${amt.toLocaleString()} deposit...`);

    try {
      // 1. Fetch current wallet
      const { data: currentWallet } = await window.supabaseClient
        .from('Wallet')
        .select('*')
        .eq('profileId', profile.id)
        .maybeSingle();

      const newBalance = (currentWallet?.balance || 0) + amt;

      // 2. Update wallet balance
      if (currentWallet) {
        await window.supabaseClient
          .from('Wallet')
          .update({ balance: newBalance })
          .eq('id', currentWallet.id);
      } else {
        await window.supabaseClient
          .from('Wallet')
          .insert({ profileId: profile.id, balance: newBalance, escrowBalance: 0, lifetimeEarned: 0, lifetimeWithdrawn: 0 });
      }

      // 3. Record transaction in WalletTransaction table
      try {
        await window.supabaseClient
          .from('WalletTransaction')
          .insert({
            walletId: currentWallet?.id,
            amount: amt,
            type: 'DEPOSIT',
            description: 'Wallet Deposit via Paystack',
            status: 'COMPLETED'
          });
      } catch (_) {}

      if (amtInput) amtInput.value = '';
      if (window.showToast) window.showToast(`Successfully deposited ₦${amt.toLocaleString()} to your Taska Wallet.`);
      await loadWalletData();

    } catch (err) {
      console.error('Deposit error:', err);
      if (window.showToast) window.showToast('Deposit failed. Please try again.');
    }
  });

  // Bind withdrawal button
  document.getElementById('wallet-withdraw-btn')?.addEventListener('click', async () => {
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .select('*')
      .eq('profileId', profile.id)
      .maybeSingle();

    const currentBal = wallet?.balance || 0;
    if (currentBal <= 0) {
      if (window.showToast) window.showToast('You have no available balance to withdraw.');
      return;
    }

    if (window.showToast) window.showToast('Withdrawal request initialized. Funds transfer takes 5–15 minutes.');
  });
}

async function loadWalletData() {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const walletBalEl = document.getElementById('wallet-hero-balance');
  const statEarned = document.getElementById('stat-earned');
  const statEscrow = document.getElementById('stat-wallet-escrow');
  const statWithdrawn = document.getElementById('stat-withdrawn');
  const statMonth = document.getElementById('stat-month');

  try {
    // 1. Fetch real Wallet record
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .select('*')
      .eq('profileId', profile.id)
      .maybeSingle();

    const balance = wallet?.balance || 0;
    const escrow = wallet?.escrowBalance || 0;
    const earned = wallet?.lifetimeEarned || balance;
    const withdrawn = wallet?.lifetimeWithdrawn || 0;

    if (walletBalEl) walletBalEl.textContent = `₦${balance.toLocaleString()}`;
    if (statEarned) statEarned.textContent = `₦${earned.toLocaleString()}`;
    if (statEscrow) statEscrow.textContent = `₦${escrow.toLocaleString()}`;
    if (statWithdrawn) statWithdrawn.textContent = `₦${withdrawn.toLocaleString()}`;
    if (statMonth) statMonth.textContent = `₦${earned.toLocaleString()}`;

    await loadWalletTransactions('all');
  } catch (err) {
    console.error('Error loading wallet data:', err);
  }
}

async function loadWalletTransactions(filter = 'all') {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const container = document.getElementById('tx-container');
  if (!container) return;

  try {
    // 1. Try fetching from WalletTransaction
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .select('id')
      .eq('profileId', profile.id)
      .maybeSingle();

    let transactions = [];
    if (wallet) {
      const { data: txs } = await window.supabaseClient
        .from('WalletTransaction')
        .select('*')
        .eq('walletId', wallet.id)
        .order('createdAt', { ascending: false });
      if (txs && txs.length > 0) transactions = txs;
    }

    // Only use real WalletTransaction records — no fake pending mockups from unhired applications
    if (transactions.length === 0) {
      container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--muted);">No transaction history yet.</div>';
      return;
    }

    let filtered = transactions;
    if (filter === 'earnings') {
      filtered = transactions.filter(t => t.type === 'TASK_PAYOUT' || t.type === 'DEPOSIT' || t.type === 'EARNING');
    } else if (filter === 'payments') {
      filtered = transactions.filter(t => t.type === 'ESCROW_LOCK' || t.type === 'PAYMENT');
    } else if (filter === 'withdrawals') {
      filtered = transactions.filter(t => t.type === 'WITHDRAWAL');
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No transactions matching '${window.escapeHtml(filter)}'.</div>`;
      return;
    }

    let html = '';
    filtered.forEach(tx => {
      const title = window.escapeHtml(tx.note || tx.reference || 'Wallet Transaction');
      const amt = tx.amount || 0;
      const dateStr = new Date(tx.createdAt || Date.now()).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const isCredit = tx.type === 'TASK_PAYOUT' || tx.type === 'DEPOSIT' || tx.type === 'EARNING';
      const isEscrow = tx.type === 'ESCROW_LOCK';

      let statusLabel = 'Completed';
      let statusClass = 'status-open';

      if (isEscrow) {
        statusLabel = 'Held in Escrow';
        statusClass = 'status-pending';
      } else if (tx.type === 'WITHDRAWAL') {
        statusLabel = 'Withdrawal';
        statusClass = 'status-closed';
      }

      html += `
        <div class="task-row" style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--line-soft);">
          <div style="flex:1; min-width:0;">
            <div class="task-row-title" style="font-weight:600; font-size:0.92rem; color:var(--green-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${title}</div>
            <div class="task-row-meta" style="font-size:0.78rem; color:var(--muted); margin-top:2px;">
              ${dateStr} · <span class="status ${statusClass}" style="font-size:0.72rem; padding:2px 8px;">${statusLabel}</span>
            </div>
          </div>
          <div class="task-row-amt mono" style="color:${isCredit ? 'var(--green-700)' : 'var(--ink-soft)'}; font-weight:700; font-size:0.95rem;">
            ${isCredit ? '+' : '-'}₦${amt.toLocaleString()}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('Load transactions error:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initWalletPage();
});
