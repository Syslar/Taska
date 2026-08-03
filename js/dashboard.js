/* ==========================================================================
   dashboard.js — Loads real user data from the backend API and populates
   the dashboard UI. Requires Clerk JS to already be loaded on the page.
   ========================================================================== */

const API_BASE = 'http://localhost:4000/api/v1';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNaira(amount) {
  if (amount == null) return '₦0';
  return '₦' + Number(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getStatusLabel(status) {
  const map = {
    OPEN:            'Open',
    ASSIGNED:        'Assigned',
    IN_PROGRESS:     'In progress',
    PROOF_SUBMITTED: 'Awaiting approval',
    COMPLETED:       'Completed',
    DISPUTED:        'Disputed',
    CANCELLED:       'Cancelled',
  };
  return map[status] || status;
}

function getStatusClass(status) {
  const map = {
    OPEN:            'status-open',
    ASSIGNED:        'status-open',
    IN_PROGRESS:     'status-open',
    PROOF_SUBMITTED: 'status-pending',
    COMPLETED:       'status-done',
    DISPUTED:        'status-error',
    CANCELLED:       'status-error',
  };
  return map[status] || 'status-open';
}

// ─── DOM Renderers ────────────────────────────────────────────────────────────

function renderActiveTasks(tasks) {
  const el = document.getElementById('active-tasks-list');
  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">No active tasks yet. <a href="post-task.html" style="color:var(--green-700); font-weight:600;">Post one now.</a></div>';
    return;
  }
  el.innerHTML = tasks.map(task => {
    const assignee = task.applications && task.applications[0]
      ? `Assigned to ${task.applications[0].tasker.firstName} ${task.applications[0].tasker.lastName}`
      : task._count && task._count.applications > 0
        ? `${task._count.applications} applicant${task._count.applications > 1 ? 's' : ''}`
        : 'Open for bids';

    const budget = task.budget != null ? formatNaira(task.budget) : 'Open bid';

    return `
      <div class="task-row">
        <div class="task-row-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19V5C4 3.9 4.9 3 6 3H18C19.1 3 20 3.9 20 5V19M4 19L2 21M4 19H20M20 19L22 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="task-row-body">
          <div class="task-row-title">${task.title}</div>
          <div class="task-row-meta">${assignee} · <span class="status ${getStatusClass(task.status)}">${getStatusLabel(task.status)}</span></div>
        </div>
        <div class="task-row-amt mono">${budget}</div>
      </div>`;
  }).join('');
}

function renderActivity(transactions) {
  const el = document.getElementById('activity-list');
  if (!transactions || transactions.length === 0) {
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">No wallet activity yet.</div>';
    return;
  }
  el.innerHTML = transactions.map(tx => {
    const isCredit = tx.type === 'credit' || tx.type === 'escrow_release' || tx.type === 'top_up';
    const sign     = isCredit ? '+' : '−';
    const color    = isCredit ? 'var(--green-700)' : 'var(--ink)';
    return `
      <div class="receipt-row">
        <div>
          <div style="font-weight:600; font-size:0.9rem;">${tx.note || tx.reference}</div>
          <div style="font-size:0.78rem; color:var(--muted);">${timeAgo(tx.createdAt)}</div>
        </div>
        <div class="mono" style="color:${color}; font-weight:600;">${sign}${formatNaira(tx.amount)}</div>
      </div>`;
  }).join('');
}

// ─── Main Load ────────────────────────────────────────────────────────────────

window.addEventListener('load', async function () {
  try {
    await window.Clerk.load();

    // Session guard — redirect to login if not authenticated
    if (!window.Clerk.session) {
      window.location.replace('../Auth/login.html');
      return;
    }

    const token = await window.Clerk.session.getToken();

    const res = await fetch(`${API_BASE}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      window.Clerk.signOut().then(() => window.location.replace('../Auth/login.html'));
      return;
    }

    if (!res.ok) {
      console.error('Dashboard fetch failed', res.status);
      if (window.showToast) window.showToast('Failed to load dashboard data.');
      return;
    }

    const { data } = await res.json();
    const { profile, wallet, stats, activeTasks } = data;

    // ── Greeting & sidebar ────────────────────────────────────────────────────
    const firstName = profile.firstName || 'there';
    document.getElementById('greeting').textContent = `${getGreeting()}, ${firstName}`;

    const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || '--';
    document.getElementById('sidebar-avatar').textContent = initials;
    document.getElementById('mobile-avatar').textContent  = initials;
    document.getElementById('sidebar-name').textContent   = `${profile.firstName} ${profile.lastName}`;
    document.getElementById('sidebar-role').textContent   = profile.role === 'POSTER' ? 'Task Poster' : 'Tasker';

    // ── Stat cards ────────────────────────────────────────────────────────────
    if (wallet) {
      document.getElementById('stat-balance').textContent = formatNaira(wallet.balance);
      document.getElementById('stat-escrow').textContent  =
        wallet.escrowBalance > 0 ? `${formatNaira(wallet.escrowBalance)} in escrow` : 'No escrow holds';
    } else {
      document.getElementById('stat-balance').textContent = '₦0';
      document.getElementById('stat-escrow').textContent  = 'Wallet not set up';
    }

    document.getElementById('stat-active-tasks').textContent     = stats.activeTasks;
    document.getElementById('stat-active-tasks-sub').textContent = stats.activeTasks === 1 ? '1 task in progress' : `${stats.activeTasks} tasks in progress`;
    document.getElementById('stat-completed-tasks').textContent  = stats.completedTasks;

    const rating = profile.averageRating;
    document.getElementById('stat-rating').innerHTML = rating
      ? `${rating.toFixed(1)}<span style="font-size:0.9rem; color:var(--muted);"> / 5</span>`
      : `—<span style="font-size:0.9rem; color:var(--muted);"> / 5</span>`;
    document.getElementById('stat-reviews').textContent = profile.totalReviews > 0
      ? `From ${profile.totalReviews} review${profile.totalReviews > 1 ? 's' : ''}`
      : 'No reviews yet';

    // ── Lists ─────────────────────────────────────────────────────────────────
    renderActiveTasks(activeTasks);
    renderActivity(wallet ? wallet.recentTransactions : []);

  } catch (err) {
    console.error('Dashboard load error:', err);
    if (window.showToast) window.showToast('Something went wrong loading your dashboard.');
  }
});
