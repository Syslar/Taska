/**
 * Taska Wallet Controller — v3.0
 * Compliant with Taska Wallet & Paystack Integration Specification
 *
 * Architecture:
 * - Single Paystack Business Account
 * - Authoritative Accounting Ledger in Supabase
 * - Paystack Checkout Popup for Deposits (Cards, Bank Transfer, USSD)
 * - Paystack Transfer API for Withdrawals
 * - Configurable Platform Commission Rates
 * - Zero Direct Frontend DB Mutations
 */

// ── Config ────────────────────────────────────────────────────────────────────
const PAYSTACK_PUBLIC_KEY = 'pk_test_fa5b21442a0f593c2af57cf0af33adcb93f1c9ae';
const EDGE_FN = 'https://nhittvkskzwpeinscxir.supabase.co/functions/v1';

// ── State ─────────────────────────────────────────────────────────────────────
let _currentProfile = null;
let _allTransactionsData = [];
let _activeOverviewFilter = 'all';
let _activeModalFilter = 'all';
let _activeModalSearch = '';
let _walletState = {
  available_balance: 0,
  locked_balance: 0,
  escrow_balance: 0,
  lifetime_earned: 0,
  lifetime_withdrawn: 0,
  deposits: [],
  withdrawals: [],
  deposit_fee_rate: 0,
  withdrawal_fee_rate: 0,
  task_commission_rate: 10,
};
let _resolvedAccountName = '';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatNaira(amount) {
  return `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

async function edgeFetch(path, options = {}) {
  const token = window.getTaskaToken ? await window.getTaskaToken() : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${EDGE_FN}/${path}`, {
    ...options,
    headers,
  });
  return res.json();
}

function showModal(modalEl) {
  if (!modalEl) return;
  modalEl.style.display = 'flex';
  modalEl.classList.add('is-open');
}

function hideModal(modalEl) {
  if (!modalEl) return;
  modalEl.style.display = 'none';
  modalEl.classList.remove('is-open');
}

// ── Load Wallet Data ──────────────────────────────────────────────────────────

async function loadWalletData() {
  if (!_currentProfile) {
    _currentProfile = await window.ensureTaskaProfile?.();
  }
  const profile = _currentProfile;
  if (!profile) return;

  try {
    const info = await edgeFetch(`wallet-info?profileId=${profile.id}`);
    if (!info.success) {
      console.error('[wallet] Failed to load wallet info:', info.error);
      return;
    }

    _walletState = {
      available_balance: info.wallet?.available_balance || 0,
      locked_balance: info.wallet?.locked_balance || 0,
      escrow_balance: info.wallet?.escrow_balance || 0,
      lifetime_earned: info.wallet?.lifetime_earned || 0,
      lifetime_withdrawn: info.wallet?.lifetime_withdrawn || 0,
      is_frozen: Boolean(info.wallet?.is_frozen || info.wallet?.status === 'frozen'),
      pin_is_set: Boolean(info.wallet?.pin_is_set),
      deposits: info.deposits || [],
      withdrawals: info.withdrawals || [],
      refunds: info.refunds || [],
      deposit_fee_rate: info.settings?.deposit_fee_percentage ?? 0,
      withdrawal_fee_rate: info.settings?.withdrawal_fee_percentage ?? 0,
      task_commission_rate: info.settings?.task_commission_percentage ?? 10,
    };

    // Also fetch any task earnings/ledger entries from WalletTransaction if available
    let walletTxs = [];
    if (window.supabaseClient && profile?.id) {
      try {
        const { data: wRecord } = await window.supabaseClient
          .from('Wallet')
          .select('id, WalletTransaction(*)')
          .eq('profileId', profile.id)
          .maybeSingle();
        if (wRecord && wRecord.WalletTransaction) {
          walletTxs = wRecord.WalletTransaction;
        }
      } catch (err) {
        console.warn('[wallet] Error fetching WalletTransaction ledger:', err);
      }
    }

    const ownerName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.username : 'Account Holder';

    // Assemble unified transactions list
    _allTransactionsData = [
      ..._walletState.deposits.map(d => ({
        id: String(d.id || d.paystack_reference),
        type: 'deposit',
        category: 'Deposit',
        date: d.createdAt,
        status: d.status || 'successful',
        amount: d.net_naira || d.net_amount_naira || (d.net_amount ? d.net_amount / 100 : 0) || 0,
        gross: d.gross_naira || d.gross_amount_naira || (d.gross_amount ? d.gross_amount / 100 : 0) || 0,
        fee: d.commission_naira || (d.commission_amount ? d.commission_amount / 100 : 0) || 0,
        reference: d.paystack_reference || `TK-DEP-${d.id || Date.now()}`,
        bank: d.channel ? `Paystack (${d.channel.toUpperCase()})` : 'Paystack Checkout',
        accountOwner: ownerName,
        accountNumber: d.channel === 'card' ? 'Debit/Credit Card' : d.channel === 'bank_transfer' ? 'Virtual Bank Transfer' : (d.channel || 'Paystack Gateway'),
        label: 'Wallet Deposit',
        failure_reason: null
      })),
      ..._walletState.withdrawals.map(w => ({
        id: String(w.id || w.paystack_reference),
        type: 'withdrawal',
        category: 'Withdrawal',
        date: w.createdAt,
        status: w.status || 'pending',
        amount: w.payout_naira || (w.payout_amount ? w.payout_amount / 100 : 0) || 0,
        gross: w.requested_naira || (w.requested_amount ? w.requested_amount / 100 : 0) || 0,
        fee: w.commission_naira || (w.commission_amount ? w.commission_amount / 100 : 0) || 0,
        reference: w.paystack_reference || `TK-WTH-${w.id || Date.now()}`,
        bank: w.bank_name || 'Commercial Bank',
        accountOwner: w.account_name || ownerName,
        accountNumber: w.account_number || 'N/A',
        label: 'Bank Withdrawal',
        failure_reason: w.failure_reason || null
      })),
      ...(_walletState.refunds || []).map(r => ({
        id: String(r.id || r.reference),
        type: 'refund',
        category: 'Refund',
        date: r.createdAt,
        status: 'successful',
        amount: r.amount_naira || (r.amount ? r.amount / 100 : 0) || 0,
        gross: r.gross_amount_naira || r.amount_naira || (r.amount ? r.amount / 100 : 0) || 0,
        fee: 0,
        reference: r.reference || `TK-RFD-${r.id || Date.now()}`,
        bank: 'Taska Wallet System',
        accountOwner: ownerName,
        accountNumber: 'Refund to Wallet Balance',
        label: r.description || 'Funds Refunded to Wallet',
        failure_reason: null
      })),
      ...walletTxs
        .filter(tx => ['task_payout', 'escrow_release', 'credit'].includes(tx.type))
        .map(tx => ({
          id: String(tx.id || tx.reference),
          type: 'earning',
          category: 'Earnings',
          date: tx.createdAt,
          status: 'successful',
          amount: tx.amount || 0,
          gross: tx.amount || 0,
          fee: 0,
          reference: tx.reference || `TK-ERN-${tx.id || Date.now()}`,
          bank: 'Taska Escrow System',
          accountOwner: ownerName,
          accountNumber: 'Task Completion Payout',
          label: tx.note || 'Task Completion Earning',
          failure_reason: null
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Hero Balance
    const balEl = document.getElementById('wallet-hero-balance');
    if (balEl) balEl.textContent = formatNaira(_walletState.available_balance);

    const withdrawAvailableBalEl = document.getElementById('withdraw-available-bal');
    if (withdrawAvailableBalEl) withdrawAvailableBalEl.textContent = formatNaira(_walletState.available_balance);

    // Locked balance indicator
    const lockedEl = document.getElementById('wallet-locked-balance');
    if (lockedEl) {
      lockedEl.textContent = _walletState.locked_balance > 0
        ? `${formatNaira(_walletState.locked_balance)} pending withdrawal payout`
        : '';
      lockedEl.style.display = _walletState.locked_balance > 0 ? 'block' : 'none';
    }

    // Stats
    const statEarned = document.getElementById('stat-earned');
    const statEscrow = document.getElementById('stat-wallet-escrow');
    const statWithdrawn = document.getElementById('stat-withdrawn');
    const statMonth = document.getElementById('stat-month');

    if (statEarned) statEarned.textContent = formatNaira(_walletState.lifetime_earned);
    if (statEscrow) statEscrow.textContent = formatNaira(_walletState.escrow_balance);
    if (statWithdrawn) statWithdrawn.textContent = formatNaira(_walletState.lifetime_withdrawn);
    if (statMonth) statMonth.textContent = formatNaira(_walletState.lifetime_earned);

    // Fee rate labels in modals
    const depFeeRateEl = document.getElementById('deposit-fee-rate-display');
    if (depFeeRateEl) depFeeRateEl.textContent = `${_walletState.deposit_fee_rate}%`;

    // Handle Frozen Wallet UI & Under Investigation Lockdown Animation
    const frozenBanner = document.getElementById('wallet-frozen-banner');
    const heroActions = document.querySelector('.wallet-hero-actions');
    const depositBtn = document.getElementById('wallet-deposit-btn');
    const withdrawBtn = document.getElementById('wallet-withdraw-btn');
    const walletHero = document.querySelector('.wallet-hero');
    const frozenBadge = document.getElementById('wallet-hero-frozen-badge');
    const crimeSceneOverlay = document.getElementById('wallet-crime-scene-overlay');

    if (_walletState.is_frozen) {
      if (walletHero) walletHero.classList.add('is-frozen');
      if (frozenBadge) frozenBadge.style.display = 'inline-flex';
      if (crimeSceneOverlay) crimeSceneOverlay.style.display = 'block';
      if (frozenBanner) frozenBanner.style.display = 'block';
      if (depositBtn) depositBtn.disabled = true;
      if (withdrawBtn) withdrawBtn.disabled = true;
    } else {
      if (walletHero) walletHero.classList.remove('is-frozen');
      if (frozenBadge) frozenBadge.style.display = 'none';
      if (crimeSceneOverlay) crimeSceneOverlay.style.display = 'none';
      if (frozenBanner) frozenBanner.style.display = 'none';
      if (depositBtn) depositBtn.disabled = false;
      if (withdrawBtn) withdrawBtn.disabled = false;
    }

    renderOverviewTransactions(_activeOverviewFilter);
    renderModalAllTransactions();

  } catch (err) {
    console.error('[wallet] loadWalletData error:', err);
  }
}

// ── Transaction Ledger & Modals ───────────────────────────────────────────────

function filterTransactions(txList, filterType, searchQuery = '') {
  let filtered = txList;
  if (filterType === 'deposits') {
    filtered = filtered.filter(t => t.type === 'deposit');
  } else if (filterType === 'earnings') {
    filtered = filtered.filter(t => t.type === 'earning');
  } else if (filterType === 'withdrawals') {
    filtered = filtered.filter(t => t.type === 'withdrawal');
  } else if (filterType === 'refunds') {
    filtered = filtered.filter(t => t.type === 'refund');
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase().trim();
    filtered = filtered.filter(t =>
      (t.reference || '').toLowerCase().includes(q) ||
      (t.bank || '').toLowerCase().includes(q) ||
      (t.accountOwner || '').toLowerCase().includes(q) ||
      (t.label || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  }

  return filtered;
}

function renderTransactionRowHTML(tx) {
  const isCredit = (tx.type === 'deposit' || tx.type === 'earning' || tx.type === 'refund') && (tx.status === 'successful' || tx.status === 'success');
  const statusConfig = {
    successful: { label: 'Completed', cls: 'status-open' },
    success: { label: 'Completed', cls: 'status-open' },
    pending: { label: 'Pending', cls: 'status-pending' },
    processing: { label: 'Processing', cls: 'status-pending' },
    failed: { label: 'Failed', cls: 'status-closed' },
    reversed: { label: 'Reversed', cls: 'status-closed' },
  };
  const sc = statusConfig[tx.status] || { label: tx.status, cls: 'status-pending' };
  const dateStr = new Date(tx.date || Date.now()).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
  const feeText = tx.fee > 0 ? ` — ${formatNaira(tx.fee)} platform fee` : '';

  let desc = tx.label;
  if (tx.type === 'deposit') desc = `Wallet Deposit${feeText}`;
  else if (tx.type === 'withdrawal') desc = `Bank Payout to ${tx.bank || 'Bank'}${feeText}`;
  else if (tx.type === 'earning') desc = tx.label || 'Task Completion Earning';
  else if (tx.type === 'refund') desc = tx.label || 'Funds Refunded to Wallet';

  const safeDesc = window.escapeHtml?.(desc) || desc;
  const safeRef = window.escapeHtml?.(tx.reference) || tx.reference;

  return `
    <div class="task-row clickable-tx-row" data-tx-id="${window.escapeHtml?.(tx.id) || tx.id}" style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--line-soft); cursor:pointer; transition:background 0.15s ease; border-radius:var(--radius-sm);">
      <div style="flex:1; min-width:0; padding-right:12px;">
        <div class="task-row-title" style="font-weight:600; font-size:0.92rem; color:var(--green-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${safeDesc}
        </div>
        <div class="task-row-meta" style="font-size:0.78rem; color:var(--muted); margin-top:2px;">
          ${dateStr} · <span class="status ${sc.cls}" style="font-size:0.72rem; padding:2px 8px;">${sc.label}</span>
          <span class="mono" style="margin-left:6px; color:var(--ink-soft); font-size:0.75rem;">${safeRef}</span>
          ${tx.failure_reason ? ` · <span style="color:var(--red-500);">${window.escapeHtml?.(tx.failure_reason) || tx.failure_reason}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right; flex-shrink:0;">
        <div class="task-row-amt mono" style="color:${isCredit ? 'var(--green-700)' : 'var(--ink-soft)'}; font-weight:700; font-size:0.95rem;">
          ${isCredit ? '+' : '-'}${formatNaira(tx.amount)}
        </div>
        <span style="font-size:0.72rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.3px;">${tx.category}</span>
      </div>
    </div>
  `;
}

function bindTransactionRowClicks(container) {
  if (!container) return;
  container.querySelectorAll('.clickable-tx-row').forEach(row => {
    row.addEventListener('click', () => {
      const txId = row.getAttribute('data-tx-id');
      if (txId) openTransactionDetailModal(txId);
    });
  });
}

function renderOverviewTransactions(filter = 'all') {
  _activeOverviewFilter = filter;
  const container = document.getElementById('tx-container');
  if (!container) return;

  const filtered = filterTransactions(_allTransactionsData, filter);

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No ${filter === 'all' ? '' : filter} transactions found.</div>`;
    return;
  }

  // Show strictly top 5 most recent transactions
  const top5 = filtered.slice(0, 5);
  container.innerHTML = top5.map(tx => renderTransactionRowHTML(tx)).join('');
  bindTransactionRowClicks(container);
}

function renderModalAllTransactions() {
  const container = document.getElementById('modal-all-tx-container');
  if (!container) return;

  const filtered = filterTransactions(_allTransactionsData, _activeModalFilter, _activeModalSearch);

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No matching transactions found.</div>`;
    return;
  }

  container.innerHTML = filtered.map(tx => renderTransactionRowHTML(tx)).join('');
  bindTransactionRowClicks(container);
}

function openTransactionDetailModal(txId) {
  const tx = _allTransactionsData.find(t => t.id === txId || t.reference === txId);
  if (!tx) return;

  const modal = document.getElementById('tx-detail-modal');
  if (!modal) return;

  const isCredit = (tx.type === 'deposit' || tx.type === 'earning' || tx.type === 'refund') && (tx.status === 'successful' || tx.status === 'success');
  const statusConfig = {
    successful: { label: 'Completed', cls: 'status-open' },
    success: { label: 'Completed', cls: 'status-open' },
    pending: { label: 'Pending', cls: 'status-pending' },
    processing: { label: 'Processing', cls: 'status-pending' },
    failed: { label: 'Failed', cls: 'status-closed' },
    reversed: { label: 'Reversed', cls: 'status-closed' },
  };
  const sc = statusConfig[tx.status] || { label: tx.status, cls: 'status-pending' };

  const statusEl = document.getElementById('tx-detail-status');
  if (statusEl) {
    statusEl.className = `status ${sc.cls}`;
    statusEl.textContent = sc.label;
  }

  const typeBadge = document.getElementById('tx-detail-type-badge');
  if (typeBadge) typeBadge.textContent = (tx.category || 'Transaction').toUpperCase();

  const amtEl = document.getElementById('tx-detail-amount');
  if (amtEl) {
    amtEl.textContent = `${isCredit ? '+' : '-'}${formatNaira(tx.amount)}`;
    amtEl.style.color = isCredit ? 'var(--green-700)' : 'var(--ink)';
  }

  const dateEl = document.getElementById('tx-detail-date');
  if (dateEl) {
    dateEl.textContent = new Date(tx.date || Date.now()).toLocaleString('en-NG', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  const refEl = document.getElementById('tx-detail-ref');
  if (refEl) refEl.textContent = tx.reference || '—';

  const catEl = document.getElementById('tx-detail-category');
  if (catEl) catEl.textContent = tx.category || 'Transaction';

  const bankEl = document.getElementById('tx-detail-bank');
  if (bankEl) bankEl.textContent = tx.bank || '—';

  const ownerEl = document.getElementById('tx-detail-owner');
  if (ownerEl) ownerEl.textContent = tx.accountOwner || '—';

  const accNumEl = document.getElementById('tx-detail-accnum');
  if (accNumEl) accNumEl.textContent = tx.accountNumber || '—';

  const grossEl = document.getElementById('tx-detail-gross');
  if (grossEl) grossEl.textContent = formatNaira(tx.gross);

  const feeEl = document.getElementById('tx-detail-fee');
  if (feeEl) feeEl.textContent = tx.fee > 0 ? `-${formatNaira(tx.fee)}` : '₦0';

  const netEl = document.getElementById('tx-detail-net');
  if (netEl) netEl.textContent = formatNaira(tx.amount);

  const failBox = document.getElementById('tx-detail-failure-box');
  const failReasonEl = document.getElementById('tx-detail-failure-reason');
  if (failBox && failReasonEl) {
    if (tx.failure_reason) {
      failReasonEl.textContent = tx.failure_reason;
      failBox.style.display = 'block';
    } else {
      failBox.style.display = 'none';
    }
  }

  showModal(modal);
}

// ── Setup Listeners ───────────────────────────────────────────────────────────

function setupWalletListeners() {
  // Overview Tabs
  document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      renderOverviewTransactions(tab.dataset.walletFilter || 'all');
    });
  });

  // Open All Transactions Modal
  const allTxModal = document.getElementById('all-tx-modal');
  const openAllTx = () => {
    showModal(allTxModal);
    renderModalAllTransactions();
  };
  document.getElementById('btn-open-all-tx-top')?.addEventListener('click', openAllTx);
  document.getElementById('btn-open-all-tx-bottom')?.addEventListener('click', openAllTx);

  // Close All Transactions Modal
  document.getElementById('all-tx-close-btn')?.addEventListener('click', () => hideModal(allTxModal));
  allTxModal?.addEventListener('click', (e) => {
    if (e.target === allTxModal) hideModal(allTxModal);
  });

  // Modal Tabs inside All Transactions Modal
  document.querySelectorAll('#modal-tx-tabs-bar .wallet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#modal-tx-tabs-bar .wallet-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      _activeModalFilter = tab.dataset.modalFilter || 'all';
      renderModalAllTransactions();
    });
  });

  // Modal Search inside All Transactions Modal
  const modalSearchInput = document.getElementById('modal-tx-search-input');
  if (modalSearchInput) {
    modalSearchInput.addEventListener('input', (e) => {
      _activeModalSearch = e.target.value;
      renderModalAllTransactions();
    });
  }

  // Transaction Details Modal Close & Copy Reference
  const txDetailModal = document.getElementById('tx-detail-modal');
  document.getElementById('tx-detail-close-btn')?.addEventListener('click', () => hideModal(txDetailModal));
  document.getElementById('tx-detail-dismiss-btn')?.addEventListener('click', () => hideModal(txDetailModal));
  txDetailModal?.addEventListener('click', (e) => {
    if (e.target === txDetailModal) hideModal(txDetailModal);
  });

  document.getElementById('btn-copy-tx-ref')?.addEventListener('click', () => {
    const refText = document.getElementById('tx-detail-ref')?.textContent;
    if (refText && refText !== '—') {
      navigator.clipboard?.writeText(refText);
      if (window.showToast) window.showToast('Transaction reference copied to clipboard!');
    }
  });

  // ── Deposit Modal ───────────────────────────────────────────────────────────
  const depositModal = document.getElementById('wallet-deposit-modal');
  const depositAmountInput = document.getElementById('deposit-amount');
  const depositSubmitBtn = document.getElementById('deposit-submit-btn');
  const depositGrossDisplay = document.getElementById('deposit-gross-display');
  const depositFeeDisplay = document.getElementById('deposit-fee-display');
  const depositNetDisplay = document.getElementById('deposit-net-display');

  const updateDepositBreakdown = () => {
    const gross = parseFloat(depositAmountInput?.value || '0');
    if (!isNaN(gross) && gross > 0) {
      if (depositGrossDisplay) depositGrossDisplay.textContent = formatNaira(gross);
      if (depositNetDisplay) depositNetDisplay.textContent = formatNaira(gross);
    } else {
      if (depositGrossDisplay) depositGrossDisplay.textContent = '₦0';
      if (depositNetDisplay) depositNetDisplay.textContent = '₦0';
    }
  };

  // Open & Close Deposit Modal
  document.getElementById('wallet-deposit-btn')?.addEventListener('click', () => {
    if (_walletState.is_frozen) {
      if (window.showToast) window.showToast('Your wallet is frozen. Funding is disabled. Please contact support@taska.com.ng to appeal.', 'error');
      return;
    }
    showModal(depositModal);
    updateDepositBreakdown();
  });
  document.getElementById('wallet-deposit-close-btn')?.addEventListener('click', () => {
    hideModal(depositModal);
  });
  depositModal?.addEventListener('click', (e) => {
    if (e.target === depositModal) hideModal(depositModal);
  });

  // Quick Amount Chips
  document.querySelectorAll('#depositQuickChips .amount-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#depositQuickChips .amount-chip').forEach(c => c.classList.remove('is-selected'));
      chip.classList.add('is-selected');
      if (depositAmountInput) {
        depositAmountInput.value = chip.dataset.amt;
        updateDepositBreakdown();
      }
    });
  });
  depositAmountInput?.addEventListener('input', updateDepositBreakdown);

  // Submit Deposit Form — Launches Paystack Checkout Popup
  document.getElementById('wallet-deposit-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (_walletState.is_frozen) {
      if (window.showToast) window.showToast('Your wallet is frozen. Funding is disabled.', 'error');
      return;
    }
    if (window.TaskaRateLimiter && !window.TaskaRateLimiter.canExecute('wallet-deposit', 1500)) return;

    const grossAmt = parseFloat(depositAmountInput?.value || '0');
    if (isNaN(grossAmt) || grossAmt < 500) {
      if (window.showToast) window.showToast('Minimum deposit amount is ₦500.');
      return;
    }

    if (!_currentProfile) _currentProfile = await window.ensureTaskaProfile?.();
    const profile = _currentProfile;
    if (!profile) {
      if (window.showToast) window.showToast('Please wait for profile to load.');
      return;
    }

    if (depositSubmitBtn) {
      depositSubmitBtn.disabled = true;
      depositSubmitBtn.textContent = 'Opening Paystack...';
    }

    const paymentRef = `TK-DEP-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const userEmail = profile.email || `${profile.username || 'user'}@taska.com.ng`;

    if (typeof window.PaystackPop !== 'undefined' && window.PaystackPop.setup) {
      const handler = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: userEmail,
        amount: Math.round(grossAmt * 100), // kobo
        currency: 'NGN',
        ref: paymentRef,
        metadata: {
          profile_id: profile.id,
          custom_fields: [
            { display_name: 'Profile ID', variable_name: 'profile_id', value: profile.id },
          ],
        },
        callback: (response) => {
          hideModal(depositModal);
          if (window.showToast) window.showToast('Payment received! Crediting your wallet...');
          // Give webhook ~2.5s to commit and refresh
          setTimeout(loadWalletData, 2500);
        },
        onClose: () => {
          if (depositSubmitBtn) {
            depositSubmitBtn.disabled = false;
            depositSubmitBtn.textContent = 'Proceed to Paystack';
          }
          if (window.showToast) window.showToast('Payment window closed.');
        },
      });
      handler.openIframe();
    } else {
      if (window.showToast) window.showToast('Paystack SDK is loading. Please try again.');
      if (depositSubmitBtn) {
        depositSubmitBtn.disabled = false;
        depositSubmitBtn.textContent = 'Proceed to Paystack';
      }
    }
  });

  // ── Withdrawal Modal ────────────────────────────────────────────────────────
  const withdrawModal = document.getElementById('wallet-withdraw-modal');
  const withdrawAmountInput = document.getElementById('withdraw-amount');
  const withdrawBankSelect = document.getElementById('withdraw-bank-select');
  const withdrawAccInput = document.getElementById('withdraw-account-number');
  const withdrawNameBox = document.getElementById('withdraw-account-name-box');
  const withdrawNameEl = document.getElementById('withdraw-resolved-name');
  const withdrawSubmitBtn = document.getElementById('withdraw-submit-btn');
  const withdrawGrossDisplay = document.getElementById('withdraw-gross-display');
  const withdrawFeeDisplay = document.getElementById('withdraw-fee-display');
  const withdrawNetDisplay = document.getElementById('withdraw-net-display');

  const updateWithdrawBreakdown = () => {
    const gross = parseFloat(withdrawAmountInput?.value || '0');
    if (!isNaN(gross) && gross > 0) {
      if (withdrawGrossDisplay) withdrawGrossDisplay.textContent = formatNaira(gross);
      if (withdrawNetDisplay) withdrawNetDisplay.textContent = formatNaira(gross);
    } else {
      if (withdrawGrossDisplay) withdrawGrossDisplay.textContent = '₦0';
      if (withdrawNetDisplay) withdrawNetDisplay.textContent = '₦0';
    }
  };

  // Open & Close Withdraw Modal
  document.getElementById('wallet-withdraw-btn')?.addEventListener('click', () => {
    if (_walletState.is_frozen) {
      if (window.showToast) window.showToast('Your wallet is frozen. Withdrawals are disabled. Please contact support@taska.com.ng to appeal.', 'error');
      return;
    }
    const bal = _walletState.available_balance;
    const withdrawAvailableBalEl = document.getElementById('withdraw-available-bal');
    if (withdrawAvailableBalEl) withdrawAvailableBalEl.textContent = formatNaira(bal);

    if (bal < 1000) {
      if (window.showToast) window.showToast('Minimum withdrawal balance is ₦1,000.');
      return;
    }
    showModal(withdrawModal);
    updateWithdrawBreakdown();
  });

  document.getElementById('wallet-withdraw-close-btn')?.addEventListener('click', () => {
    hideModal(withdrawModal);
  });
  withdrawModal?.addEventListener('click', (e) => {
    if (e.target === withdrawModal) hideModal(withdrawModal);
  });

  document.getElementById('withdraw-max-btn')?.addEventListener('click', () => {
    if (withdrawAmountInput) {
      // Auto-populate exact available balance (supporting exact decimal amounts like 4028.43)
      withdrawAmountInput.value = _walletState.available_balance;
      updateWithdrawBreakdown();
    }
  });

  withdrawAmountInput?.addEventListener('input', updateWithdrawBreakdown);

  // Bank Account Resolution (calls resolve-account Edge Function)
  let _resolveTimeout = null;
  const resolveAccount = async () => {
    const accNum = (withdrawAccInput?.value || '').replace(/\D/g, '');
    const bankCode = withdrawBankSelect?.value || '';
    if (accNum.length !== 10 || !bankCode) {
      if (withdrawNameBox) withdrawNameBox.style.display = 'none';
      _resolvedAccountName = '';
      return;
    }
    if (withdrawNameEl) withdrawNameEl.textContent = 'Resolving...';
    if (withdrawNameBox) withdrawNameBox.style.display = 'flex';

    const result = await edgeFetch('resolve-account', {
      method: 'POST',
      body: JSON.stringify({ accountNumber: accNum, bankCode }),
    });

    if (result.success) {
      _resolvedAccountName = result.account_name;
      if (withdrawNameEl) withdrawNameEl.textContent = result.account_name;
    } else {
      _resolvedAccountName = '';
      if (withdrawNameEl) withdrawNameEl.textContent = 'Could not verify account';
      if (window.showToast) window.showToast(result.error || 'Account resolution failed.');
    }
  };

  withdrawAccInput?.addEventListener('input', () => {
    clearTimeout(_resolveTimeout);
    _resolveTimeout = setTimeout(resolveAccount, 500);
  });
  withdrawBankSelect?.addEventListener('change', resolveAccount);

  // Submit Withdrawal Form — Authorizes via 4-Digit Transaction PIN
  document.getElementById('wallet-withdraw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (_walletState.is_frozen) {
      if (window.showToast) window.showToast('Your wallet is frozen. Withdrawals are disabled.', 'error');
      return;
    }
    if (window.TaskaRateLimiter && !window.TaskaRateLimiter.canExecute('wallet-withdraw', 2000)) return;

    const grossAmt = parseFloat(withdrawAmountInput?.value || '0');
    if (isNaN(grossAmt) || grossAmt < 1000) {
      if (window.showToast) window.showToast('Minimum withdrawal amount is ₦1,000.');
      return;
    }

    const accNum = (withdrawAccInput?.value || '').replace(/\D/g, '');
    if (accNum.length !== 10) {
      if (window.showToast) window.showToast('Please enter a valid 10-digit account number.');
      return;
    }

    const bankCode = withdrawBankSelect?.value || '';
    const bankName = withdrawBankSelect?.options[withdrawBankSelect.selectedIndex]?.text || '';
    if (!bankCode) {
      if (window.showToast) window.showToast('Please select a destination bank.');
      return;
    }

    if (!_resolvedAccountName) {
      if (window.showToast) window.showToast('Please enter a valid account number and wait for bank account verification.');
      return;
    }

    if (grossAmt > _walletState.available_balance) {
      if (window.showToast) window.showToast('Insufficient wallet balance.');
      return;
    }

    if (!_currentProfile) _currentProfile = await window.ensureTaskaProfile?.();
    const profile = _currentProfile;
    if (!profile) return;

    // Prompt for 4-Digit Transaction PIN before submitting
    if (typeof window.promptTransactionPin !== 'function') {
      if (window.showToast) window.showToast('Security module loading. Please try again.');
      return;
    }

    window.promptTransactionPin({
      title: 'Authorize Withdrawal',
      description: `Enter your 4-digit PIN to authorize payout of ${formatNaira(grossAmt)} to ${_resolvedAccountName} (${bankName}).`,
      submitText: 'Authorize Transfer',
      onConfirm: async (pin, modalControls) => {
        modalControls.setLoading(true, 'Processing Transfer...');
        try {
          const result = await edgeFetch('wallet-withdraw', {
            method: 'POST',
            body: JSON.stringify({
              profileId: profile.id,
              requestedAmountNaira: grossAmt,
              bankCode,
              accountNumber: accNum,
              accountName: _resolvedAccountName,
              bankName,
              transactionPin: pin,
            }),
          });

          if (!result.success) {
            if (result.code === 'WALLET_FROZEN') {
              modalControls.showFrozen(result.error || 'Wallet has been frozen. Please contact support@taska.com.ng to appeal.');
              await loadWalletData();
              return;
            }
            if (result.code === 'WRONG_PIN') {
              modalControls.showError(result.error || 'Incorrect Transaction PIN', result.attempts_remaining);
              return;
            }
            modalControls.showError(result.error || 'Withdrawal failed. Please try again.');
            return;
          }

          modalControls.close();
          hideModal(withdrawModal);
          if (withdrawAmountInput) withdrawAmountInput.value = '';
          if (withdrawAccInput) withdrawAccInput.value = '';
          if (withdrawNameBox) withdrawNameBox.style.display = 'none';
          _resolvedAccountName = '';
          updateWithdrawBreakdown();

          if (window.showToast) {
            window.showToast(result.message || `${formatNaira(result.payout_naira)} sent to your bank account!`, 'success');
          }

          await loadWalletData();

        } catch (err) {
          console.error('[wallet] Withdrawal error:', err);
          modalControls.showError(err.message || 'Withdrawal request failed. Please try again.');
        }
      }
    });
  });

  // Init Appeal Support Modal
  initWalletAppealModal();
}

// ── Wallet Unfreeze Appeal Modal ──────────────────────────────────────────────

function openWalletAppealModal() {
  const modal = document.getElementById('wallet-appeal-modal');
  if (!modal) return;

  const profile = _currentProfile;
  const email = profile?.email || 'Your registered email';
  const userId = profile?.id || '—';
  const emailEl = document.getElementById('appeal-account-email');
  if (emailEl) emailEl.textContent = email;

  const subject = encodeURIComponent('Wallet Unfreeze Appeal');
  const bodyText = `Hello Taska Support Team,

My wallet has been automatically frozen due to 3 consecutive incorrect Transaction PIN attempts.
I would like to request an unfreeze review and identity verification to restore access to my account.

Account Details:
- Registered Email: ${email}
- User ID: ${userId}
- Request Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}

Thank you.`;

  const msgArea = document.getElementById('appeal-message-text');
  if (msgArea) msgArea.value = bodyText;

  // Set mailto link
  const mailtoBtn = document.getElementById('btn-appeal-send-mailto');
  const mailtoUrl = `mailto:support@taska.com.ng?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  if (mailtoBtn) {
    mailtoBtn.href = mailtoUrl;
    mailtoBtn.onclick = (e) => {
      e.stopPropagation();
      window.location.href = mailtoUrl;
    };
  }

  showModal(modal);
}

function initWalletAppealModal() {
  const modal = document.getElementById('wallet-appeal-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('wallet-appeal-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => hideModal(modal));
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) hideModal(modal);
  });

  // Copy email button
  const copyEmailBtn = document.getElementById('btn-copy-support-email');
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('support@taska.com.ng');
        const textSpan = document.getElementById('copy-email-btn-text');
        if (textSpan) textSpan.textContent = '✓ Copied support@taska.com.ng!';
        if (window.showToast) window.showToast('Support email copied to clipboard!', 'success');
        setTimeout(() => {
          if (textSpan) textSpan.textContent = 'Copy Support Email (support@taska.com.ng)';
        }, 3000);
      } catch (err) {
        if (window.showToast) window.showToast('Please email: support@taska.com.ng');
      }
    });
  }

  // Copy message button
  const copyMsgBtn = document.getElementById('btn-copy-appeal-msg');
  if (copyMsgBtn) {
    copyMsgBtn.addEventListener('click', async () => {
      const msgArea = document.getElementById('appeal-message-text');
      if (msgArea) {
        try {
          await navigator.clipboard.writeText(msgArea.value);
          const copyLabel = document.getElementById('copy-msg-text');
          if (copyLabel) copyLabel.textContent = '✓ Copied!';
          if (window.showToast) window.showToast('Appeal message copied to clipboard!', 'success');
          setTimeout(() => {
            if (copyLabel) copyLabel.textContent = 'Copy message';
          }, 3000);
        } catch (err) {
          msgArea.select();
          document.execCommand('copy');
          if (window.showToast) window.showToast('Appeal message copied!');
        }
      }
    });
  }

  // Bind appeal button in frozen banner and anywhere on wallet page
  document.querySelectorAll('#btn-wallet-appeal, .btn-wallet-appeal-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openWalletAppealModal();
    });
  });
}

window.openWalletAppealModal = openWalletAppealModal;

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupWalletListeners();
  loadWalletData();
});
