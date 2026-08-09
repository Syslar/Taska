/**
 * Taska Wallet Controller
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
    if (!amt || amt <= 0) {
      if (window.showToast) window.showToast('Please enter a valid deposit amount.');
      return;
    }

    if (window.showToast) window.showToast(`Processing ₦${amt.toLocaleString()} deposit request...`);
    const modal = document.getElementById('wallet-deposit-modal');
    if (modal) modal.style.display = 'none';
    if (amtInput) amtInput.value = '';

    // Mock deposit completion
    setTimeout(async () => {
      if (window.showToast) window.showToast(`Successfully deposited ₦${amt.toLocaleString()} to your Taska Wallet ✓`);
      await loadWalletData();
    }, 1200);
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
    // Fetch applications where user was selected
    const { data: myApps } = await window.supabaseClient
      .from('Application')
      .select('*, Task(*)')
      .eq('taskerId', profile.id)
      .eq('isSelected', true);

    let totalEarned = 0;
    (myApps || []).forEach(a => {
      totalEarned += (a.bidAmount || a.Task?.budget || 0);
    });

    if (walletBalEl) walletBalEl.textContent = `₦${totalEarned.toLocaleString()}`;
    if (statEarned) statEarned.textContent = `₦${totalEarned.toLocaleString()}`;
    if (statEscrow) statEscrow.textContent = `₦0`;
    if (statWithdrawn) statWithdrawn.textContent = `₦0`;
    if (statMonth) statMonth.textContent = `₦${totalEarned.toLocaleString()}`;

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
    const { data: myApps } = await window.supabaseClient
      .from('Application')
      .select('*, Task(*)')
      .eq('taskerId', profile.id)
      .order('createdAt', { ascending: false });

    if (!myApps || myApps.length === 0) {
      container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--muted);">No transaction history yet.</div>';
      return;
    }

    let filtered = myApps;
    if (filter === 'earnings') {
      filtered = myApps.filter(a => a.isSelected);
    } else if (filter === 'payments' || filter === 'withdrawals') {
      filtered = [];
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No transactions matching '${filter}'.</div>`;
      return;
    }

    let html = '';
    filtered.forEach(a => {
      const taskTitle = a.Task?.title || 'Task Payment';
      const amt = a.bidAmount || a.Task?.budget || 0;
      const dateStr = new Date(a.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const statusText = a.isSelected ? 'Completed / Paid' : 'Application Pending';
      const isPositive = a.isSelected;

      html += `
        <div class="task-row">
          <div class="task-row-icon" style="background:${isPositive ? 'var(--mint-100)' : 'var(--surface)'}; color:${isPositive ? 'var(--green-700)' : 'var(--muted)'};">
            ${isPositive ? '↓' : '•'}
          </div>
          <div class="task-row-body">
            <div class="task-row-title">${taskTitle}</div>
            <div class="task-row-meta">${dateStr} • ${statusText}</div>
          </div>
          <div class="task-row-amt" style="color:${isPositive ? 'var(--green-900)' : 'var(--muted)'}; font-weight:700;">
            ${isPositive ? '+' : ''}₦${amt.toLocaleString()}
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
