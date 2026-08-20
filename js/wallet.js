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
      deposits: info.deposits || [],
      withdrawals: info.withdrawals || [],
      deposit_fee_rate: info.settings?.deposit_fee_percentage ?? 0,
      withdrawal_fee_rate: info.settings?.withdrawal_fee_percentage ?? 0,
      task_commission_rate: info.settings?.task_commission_percentage ?? 10,
    };

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

    await loadWalletTransactions('all');

  } catch (err) {
    console.error('[wallet] loadWalletData error:', err);
  }
}

// ── Transaction Ledger ────────────────────────────────────────────────────────

async function loadWalletTransactions(filter = 'all') {
  const container = document.getElementById('tx-container');
  if (!container) return;

  const allTx = [
    ..._walletState.deposits.map(d => ({
      type: 'deposit',
      date: d.createdAt,
      status: d.status,
      amount: d.net_naira || d.net_amount_naira || 0,
      gross: d.gross_naira || d.gross_amount_naira || 0,
      fee: d.commission_naira || 0,
      reference: d.paystack_reference,
      channel: d.channel || 'card',
      label: 'Deposit',
    })),
    ..._walletState.withdrawals.map(w => ({
      type: 'withdrawal',
      date: w.createdAt,
      status: w.status,
      amount: w.payout_naira || 0,
      gross: w.requested_naira || 0,
      fee: w.commission_naira || 0,
      reference: w.paystack_reference,
      bank: w.bank_name || 'Bank',
      label: 'Withdrawal',
      failure_reason: w.failure_reason,
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  let filtered = allTx;
  if (filter === 'earnings') filtered = allTx.filter(t => t.type === 'deposit');
  else if (filter === 'withdrawals') filtered = allTx.filter(t => t.type === 'withdrawal');

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No transaction history yet.</div>`;
    return;
  }

  const statusConfig = {
    successful: { label: 'Completed', cls: 'status-open' },
    success: { label: 'Completed', cls: 'status-open' },
    pending: { label: 'Pending', cls: 'status-pending' },
    processing: { label: 'Processing', cls: 'status-pending' },
    failed: { label: 'Failed', cls: 'status-closed' },
    reversed: { label: 'Reversed', cls: 'status-closed' },
  };

  let html = '';
  filtered.forEach(tx => {
    const isCredit = tx.type === 'deposit' && (tx.status === 'successful' || tx.status === 'success');
    const sc = statusConfig[tx.status] || { label: tx.status, cls: 'status-pending' };
    const dateStr = new Date(tx.date || Date.now()).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
    const feeText = tx.fee > 0 ? ` — ${formatNaira(tx.fee)} platform fee` : '';
    const desc = tx.type === 'deposit'
      ? `Wallet Deposit${feeText}`
      : `Bank Payout to ${window.escapeHtml?.(tx.bank || 'Bank') || tx.bank || 'Bank'}${feeText}`;

    html += `
      <div class="task-row" style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--line-soft);">
        <div style="flex:1; min-width:0;">
          <div class="task-row-title" style="font-weight:600; font-size:0.92rem; color:var(--green-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${window.escapeHtml?.(desc) || desc}</div>
          <div class="task-row-meta" style="font-size:0.78rem; color:var(--muted); margin-top:2px;">
            ${dateStr} · <span class="status ${sc.cls}" style="font-size:0.72rem; padding:2px 8px;">${sc.label}</span>
            ${tx.failure_reason ? ` · <span style="color:var(--red-500);">${window.escapeHtml?.(tx.failure_reason) || tx.failure_reason}</span>` : ''}
          </div>
        </div>
        <div class="task-row-amt mono" style="color:${isCredit ? 'var(--green-700)' : 'var(--ink-soft)'}; font-weight:700; font-size:0.95rem;">
          ${isCredit ? '+' : '-'}${formatNaira(tx.amount)}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// ── Setup Listeners ───────────────────────────────────────────────────────────

function setupWalletListeners() {
  // Tabs
  document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      loadWalletTransactions(tab.dataset.walletFilter || 'all');
    });
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

  // Submit Withdrawal Form
  document.getElementById('wallet-withdraw-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
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

    if (withdrawSubmitBtn) {
      withdrawSubmitBtn.disabled = true;
      withdrawSubmitBtn.textContent = 'Processing Payout...';
    }

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
        }),
      });

      if (!result.success) {
        if (window.showToast) window.showToast(`Withdrawal failed: ${result.error || 'Please try again.'}`);
        return;
      }

      hideModal(withdrawModal);
      if (withdrawAmountInput) withdrawAmountInput.value = '';
      if (withdrawAccInput) withdrawAccInput.value = '';
      if (withdrawNameBox) withdrawNameBox.style.display = 'none';
      _resolvedAccountName = '';
      updateWithdrawBreakdown();

      if (window.showToast) {
        window.showToast(result.message || `₦${formatNaira(result.payout_naira)} sent to your bank account!`);
      }

      await loadWalletData();

    } catch (err) {
      console.error('[wallet] Withdrawal error:', err);
      if (window.showToast) window.showToast('Withdrawal failed. Please try again.');
    } finally {
      if (withdrawSubmitBtn) {
        withdrawSubmitBtn.disabled = false;
        withdrawSubmitBtn.textContent = 'Confirm & Request Payout';
      }
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupWalletListeners();
  loadWalletData();
});
