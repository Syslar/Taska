/**
 * Taska Wallet Full Transactions Page Controller
 */

let _pageProfile = null;
let _pageAllTransactions = [];
let _pageActiveFilter = 'all';
let _pageActiveSearch = '';

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
  const res = await fetch(`https://nhittvkskzwpeinscxir.supabase.co/functions/v1/${path}`, {
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

async function loadFullTransactionsPage() {
  const container = document.getElementById('full-tx-list-container');
  if (container) container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--muted);">Loading transactions…</div>';

  _pageProfile = await window.ensureTaskaProfile?.();
  if (!_pageProfile) return;

  try {
    const info = await edgeFetch(`wallet-info?profileId=${_pageProfile.id}`);
    const deposits = info?.deposits || [];
    const withdrawals = info?.withdrawals || [];

    let walletTxs = [];
    if (window.supabaseClient && _pageProfile.id) {
      try {
        const { data: wRecord } = await window.supabaseClient
          .from('Wallet')
          .select('id, WalletTransaction(*)')
          .eq('profileId', _pageProfile.id)
          .maybeSingle();
        if (wRecord && wRecord.WalletTransaction) {
          walletTxs = wRecord.WalletTransaction;
        }
      } catch (err) {
        console.warn('[wallet-tx-page] Error loading WalletTransaction:', err);
      }
    }

    const ownerName = _pageProfile ? `${_pageProfile.firstName || ''} ${_pageProfile.lastName || ''}`.trim() || _pageProfile.username : 'Account Holder';

    _pageAllTransactions = [
      ...deposits.map(d => ({
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
      ...withdrawals.map(w => ({
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

    renderPageTransactions();

  } catch (err) {
    console.error('[wallet-tx-page] load error:', err);
    if (container) container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--red);">Failed to load transactions. Please try again.</div>';
  }
}

function renderPageTransactions() {
  const container = document.getElementById('full-tx-list-container');
  if (!container) return;

  let filtered = _pageAllTransactions;
  if (_pageActiveFilter === 'deposits') filtered = filtered.filter(t => t.type === 'deposit');
  else if (_pageActiveFilter === 'earnings') filtered = filtered.filter(t => t.type === 'earning');
  else if (_pageActiveFilter === 'withdrawals') filtered = filtered.filter(t => t.type === 'withdrawal');

  if (_pageActiveSearch) {
    const q = _pageActiveSearch.toLowerCase().trim();
    filtered = filtered.filter(t =>
      (t.reference || '').toLowerCase().includes(q) ||
      (t.bank || '').toLowerCase().includes(q) ||
      (t.accountOwner || '').toLowerCase().includes(q) ||
      (t.label || '').toLowerCase().includes(q) ||
      (t.category || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:50px; text-align:center; color:var(--muted);">No matching transactions found.</div>';
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

  container.innerHTML = filtered.map(tx => {
    const isCredit = (tx.type === 'deposit' || tx.type === 'earning') && (tx.status === 'successful' || tx.status === 'success');
    const sc = statusConfig[tx.status] || { label: tx.status, cls: 'status-pending' };
    const dateStr = new Date(tx.date || Date.now()).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
    const feeText = tx.fee > 0 ? ` — ${formatNaira(tx.fee)} fee` : '';

    let desc = tx.label;
    if (tx.type === 'deposit') desc = `Wallet Deposit${feeText}`;
    else if (tx.type === 'withdrawal') desc = `Bank Payout to ${tx.bank || 'Bank'}${feeText}`;
    else if (tx.type === 'earning') desc = tx.label || 'Task Completion Earning';

    const safeDesc = window.escapeHtml?.(desc) || desc;
    const safeRef = window.escapeHtml?.(tx.reference) || tx.reference;

    return `
      <div class="task-row clickable-tx-row" data-tx-id="${window.escapeHtml?.(tx.id) || tx.id}" style="display:flex; align-items:center; justify-content:space-between; padding:15px 18px; border-bottom:1px solid var(--line-soft); cursor:pointer; transition:background 0.15s ease; border-radius:var(--radius-sm);" onmouseover="this.style.background='var(--mint-050)'" onmouseout="this.style.background='transparent'">
        <div style="flex:1; min-width:0; padding-right:12px;">
          <div class="task-row-title" style="font-weight:600; font-size:0.94rem; color:var(--green-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${safeDesc}
          </div>
          <div class="task-row-meta" style="font-size:0.8rem; color:var(--muted); margin-top:3px;">
            ${dateStr} · <span class="status ${sc.cls}" style="font-size:0.72rem; padding:2px 8px;">${sc.label}</span>
            <span class="mono" style="margin-left:6px; color:var(--ink-soft); font-size:0.75rem;">${safeRef}</span>
            ${tx.failure_reason ? ` · <span style="color:var(--red-500);">${window.escapeHtml?.(tx.failure_reason) || tx.failure_reason}</span>` : ''}
          </div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div class="task-row-amt mono" style="color:${isCredit ? 'var(--green-700)' : 'var(--ink-soft)'}; font-weight:700; font-size:1rem;">
            ${isCredit ? '+' : '-'}${formatNaira(tx.amount)}
          </div>
          <span style="font-size:0.74rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.3px;">${tx.category}</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.clickable-tx-row').forEach(row => {
    row.addEventListener('click', () => {
      const txId = row.getAttribute('data-tx-id');
      if (txId) openTxDetailModal(txId);
    });
  });
}

function openTxDetailModal(txId) {
  const tx = _pageAllTransactions.find(t => t.id === txId || t.reference === txId);
  if (!tx) return;

  const modal = document.getElementById('tx-detail-modal');
  if (!modal) return;

  const isCredit = (tx.type === 'deposit' || tx.type === 'earning') && (tx.status === 'successful' || tx.status === 'success');
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

document.addEventListener('DOMContentLoaded', () => {
  // Tabs
  document.querySelectorAll('#full-page-tx-tabs .wallet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#full-page-tx-tabs .wallet-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      _pageActiveFilter = tab.dataset.filter || 'all';
      renderPageTransactions();
    });
  });

  // Search
  const searchInput = document.getElementById('full-page-tx-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      _pageActiveSearch = e.target.value;
      renderPageTransactions();
    });
  }

  // Details Modal Dismiss
  const txDetailModal = document.getElementById('tx-detail-modal');
  document.getElementById('tx-detail-close-btn')?.addEventListener('click', () => hideModal(txDetailModal));
  document.getElementById('tx-detail-dismiss-btn')?.addEventListener('click', () => hideModal(txDetailModal));
  txDetailModal?.addEventListener('click', (e) => {
    if (e.target === txDetailModal) hideModal(txDetailModal);
  });

  // Copy ref
  document.getElementById('btn-copy-tx-ref')?.addEventListener('click', () => {
    const refText = document.getElementById('tx-detail-ref')?.textContent;
    if (refText && refText !== '—') {
      navigator.clipboard?.writeText(refText);
      if (window.showToast) window.showToast('Transaction reference copied!');
    }
  });

  loadFullTransactionsPage();
});
