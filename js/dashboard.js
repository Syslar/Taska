/* ==========================================================================
   dashboard.js — Single Page Application (SPA) Controller for Taska Dashboard.
   Manages tab switching, live API data loading for all views, modals, & forms.
   ========================================================================== */

const DASHBOARD_API_BASE = 'https://taska-production-89b8.up.railway.app/api/v1';

// Global state
let currentTab = 'dashboard';
let browsePage = 1;
let browseTotalPages = 1;
let browseFilters = { search: '', category: 'all', location: 'all', sort: 'newest' };
let currentTaskId = null;
let appliedTaskIds = new Set();
let allWalletTxs = [];
let cachedTasks = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNaira(amount) {
  if (amount == null) return '₦0';
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatNairaDecimals(amount) {
  if (amount == null) return '₦0.00';
  return '₦' + Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}, ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
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

// ─── SPA Tab Switching ────────────────────────────────────────────────────────

window.switchTab = function switchTab(tabName) {
  const validTabs = ['dashboard', 'browse', 'post', 'wallet', 'profile', 'settings'];
  if (!validTabs.includes(tabName)) tabName = 'dashboard';

  currentTab = tabName;

  // Update URL hash without scroll jumping
  try {
    if (window.location.hash !== `#${tabName}`) {
      history.pushState(null, '', `#${tabName}`);
    }
  } catch (e) {
    console.warn('history.pushState failed, falling back to direct hash update:', e);
    window.location.hash = `#${tabName}`;
  }

  // Update sidebar active states
  document.querySelectorAll('.sidebar-link[data-tab]').forEach(el => {
    if (el.dataset.tab === tabName) {
      el.classList.add('is-active');
    } else {
      el.classList.remove('is-active');
    }
  });

  // Update mobile bottom tab bar active states
  document.querySelectorAll('.tab-bar .tab-item[data-tab]').forEach(el => {
    if (el.dataset.tab === tabName) {
      el.classList.add('is-active');
    } else {
      el.classList.remove('is-active');
    }
  });

  // Toggle tab panels
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('is-active');
  });

  const activePanel = document.getElementById(`tab-${tabName}`);
  if (activePanel) {
    activePanel.classList.add('is-active');
  }

  // Scroll to top of main content
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Load data for active tab
  if (tabName === 'dashboard') {
    loadDashboardData();
  } else if (tabName === 'browse') {
    loadBrowseGigsData();
  } else if (tabName === 'wallet') {
    loadWalletData();
  } else if (tabName === 'profile') {
    renderProfileTab();
  } else if (tabName === 'settings') {
    renderSettingsTab();
  }
};

// Handle browser back/forward buttons & URL hash on load
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash && hash !== currentTab) {
    switchTab(hash);
  }
});

// ─── TAB 1: Dashboard Data Loading ────────────────────────────────────────────

async function loadDashboardData() {
  try {
    const token = await window.getTaskaToken();
    if (!token) return;

    const res = await fetch(`${DASHBOARD_API_BASE}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.warn('Dashboard API failed', res.status);
      return;
    }

    const { data } = await res.json();
    const { profile, wallet, stats, activeTasks } = data;

    // Greeting
    const firstName = profile.firstName || 'there';
    document.getElementById('greeting').textContent = `${getGreeting()}, ${firstName}`;

    // Stats
    if (wallet) {
      document.getElementById('stat-balance').textContent = formatNaira(wallet.balance);
      document.getElementById('stat-escrow').textContent =
        wallet.escrowBalance > 0 ? `${formatNaira(wallet.escrowBalance)} in escrow` : 'No escrow holds';
    }

    document.getElementById('stat-active-tasks').textContent = stats.activeTasks;
    document.getElementById('stat-active-tasks-sub').textContent =
      stats.activeTasks === 1 ? '1 task in progress' : `${stats.activeTasks} tasks in progress`;
    document.getElementById('stat-completed-tasks').textContent = stats.completedTasks;

    const rating = profile.averageRating;
    document.getElementById('stat-rating').innerHTML = rating
      ? `${rating.toFixed(1)}<span style="font-size:0.9rem; color:var(--muted);"> / 5</span>`
      : `—<span style="font-size:0.9rem; color:var(--muted);"> / 5</span>`;
    document.getElementById('stat-reviews').textContent = profile.totalReviews > 0
      ? `From ${profile.totalReviews} review${profile.totalReviews > 1 ? 's' : ''}`
      : 'No reviews yet';

    // Render active tasks
    renderActiveTasksList(activeTasks);

    // Render recent activity
    renderRecentActivityList(wallet ? wallet.recentTransactions : []);

  } catch (err) {
    console.error('loadDashboardData error:', err);
  }
}

function renderActiveTasksList(tasks) {
  const el = document.getElementById('active-tasks-list');
  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">No active tasks yet. <a href="#post" onclick="switchTab(\'post\')" style="color:var(--green-700); font-weight:600;">Post one now.</a></div>';
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

function renderRecentActivityList(transactions) {
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
          <div style="font-weight:600; font-size:0.9rem;">${tx.note || tx.reference || 'Transaction'}</div>
          <div style="font-size:0.78rem; color:var(--muted);">${timeAgo(tx.createdAt)}</div>
        </div>
        <div class="mono" style="color:${color}; font-weight:600;">${sign}${formatNaira(tx.amount)}</div>
      </div>`;
  }).join('');
}

// ─── TAB 2: Browse Gigs Loading & Filters ──────────────────────────────────────

async function loadBrowseGigsData(append = false) {
  if (!append) {
    document.getElementById('gig-grid').innerHTML = `
      <div class="gig-grid-loading">
        ${Array(4).fill('<div class="skeleton skeleton-card"></div>').join('')}
      </div>`;
  }

  const params = new URLSearchParams({
    page:     browsePage,
    limit:    '12',
    sort:     browseFilters.sort,
    ...(browseFilters.search   && { search:   browseFilters.search }),
    ...(browseFilters.location !== 'all' && { location: browseFilters.location }),
    ...(browseFilters.category !== 'all' && { category: browseFilters.category }),
  });

  try {
    const res  = await fetch(`${DASHBOARD_API_BASE}/tasks?${params}`);
    const json = await res.json();

    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load tasks');

    const { tasks, pagination } = json.data;
    browseTotalPages = pagination.totalPages;

    const label = document.getElementById('task-count-label');
    if (label) label.textContent = `${pagination.total} open task${pagination.total !== 1 ? 's' : ''} available right now.`;

    const grid = document.getElementById('gig-grid');
    if (!append) grid.innerHTML = '';

    if (tasks.length === 0 && !append) {
      grid.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No tasks match your filters. Try adjusting your search.</div>`;
    } else {
      grid.insertAdjacentHTML('beforeend', tasks.map(renderTaskCard).join(''));
      grid.querySelectorAll('.gig-card:not([data-bound])').forEach(card => {
        card.setAttribute('data-bound', '1');
        card.addEventListener('click', () => openTaskModal(card.dataset.taskId, tasks));
      });
    }

    const loadMoreWrap = document.getElementById('load-more-wrap');
    if (loadMoreWrap) loadMoreWrap.style.display = browsePage < browseTotalPages ? 'block' : 'none';

  } catch (err) {
    console.error('Browse gigs error:', err);
    document.getElementById('gig-grid').innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">Failed to load tasks. Is the backend running?</div>`;
  }
}

function renderTaskCard(task) {
  const budget   = task.budget != null ? formatNaira(task.budget) : 'Open bid';
  const location = task.location || 'Remote';
  const poster   = task.poster ? `${task.poster.firstName} ${task.poster.lastName}`.trim() : 'Unknown';
  const appCount = task.applicationCount || 0;
  const isRemote = location.toLowerCase() === 'remote';
  const alreadyApplied = appliedTaskIds.has(task.id);

  return `
    <div class="gig-card" data-task-id="${task.id}">
      <div class="gig-card-top">
        <span class="gig-category">${task.category || 'General'}</span>
        <span class="status status-open">${appCount > 0 ? `Open · ${appCount} bid${appCount > 1 ? 's' : ''}` : 'Open'}</span>
      </div>
      <h3>${task.title}</h3>
      <p class="gig-desc">${(task.description || '').slice(0, 120)}${(task.description || '').length > 120 ? '…' : ''}</p>
      <div class="gig-card-foot">
        <span class="gig-budget mono">${budget}</span>
        <span class="gig-loc">
          ${isRemote
            ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 4L20 12L4 20L7 12L4 4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`
            : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.1 2 5 5.1 5 9C5 14.2 12 22 12 22C12 22 19 14.2 19 9C19 5.1 15.9 2 12 2Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>`
          }
          ${location}
        </span>
      </div>
      <div style="margin-top:10px; display:flex; align-items:center; justify-content:space-between; font-size:0.78rem; color:var(--muted);">
        <span>By ${poster} · ${timeAgo(task.createdAt)}</span>
        ${alreadyApplied ? `<span class="applied-badge">✓ Applied</span>` : ''}
      </div>
    </div>`;
}

// ─── TAB 3: Post a Task Form Logic ──────────────────────────────────────────────

let selectedTaskType = 'PHYSICAL';
let selectedBudgetType = 'FIXED';

function initPostTask() {
  const titleEl = document.getElementById('taskTitle');
  const catEl = document.getElementById('taskCategory');
  const dateEl = document.getElementById('taskDate');
  const budgetEl = document.getElementById('taskBudget');

  const sumCategory = document.getElementById('sumCategory');
  const sumType = document.getElementById('sumType');
  const sumBudget = document.getElementById('sumBudget');
  const sumDate = document.getElementById('sumDate');
  const sumFee = document.getElementById('sumFee');
  const sumTotal = document.getElementById('sumTotal');

  // Toggle Task Type (Physical vs Remote)
  document.querySelectorAll('#postTaskTypeToggle .toggle-option').forEach(opt => {
    opt.onclick = () => {
      document.querySelectorAll('#postTaskTypeToggle .toggle-option').forEach(o => o.classList.remove('is-active'));
      opt.classList.add('is-active');
      selectedTaskType = opt.dataset.value;
      
      const locWrap = document.getElementById('locationWrap');
      if (selectedTaskType === 'REMOTE') {
        locWrap.style.display = 'none';
        sumType.textContent = 'Remote';
      } else {
        locWrap.style.display = 'block';
        sumType.textContent = 'Physical';
      }
    };
  });

  // Toggle Budget Type (Fixed vs Open)
  document.querySelectorAll('#postBudgetTypeToggle .toggle-option').forEach(opt => {
    opt.onclick = () => {
      document.querySelectorAll('#postBudgetTypeToggle .toggle-option').forEach(o => o.classList.remove('is-active'));
      opt.classList.add('is-active');
      selectedBudgetType = opt.dataset.value;

      const fixedWrap = document.getElementById('budgetFixedWrap');
      const openWrap = document.getElementById('budgetOpenWrap');

      if (selectedBudgetType === 'OPEN') {
        fixedWrap.style.display = 'none';
        openWrap.style.display = 'block';
        sumBudget.textContent = 'Open bid';
        sumFee.textContent = '—';
        sumTotal.textContent = '—';
      } else {
        fixedWrap.style.display = 'block';
        openWrap.style.display = 'none';
        updateBudgetSummary();
      }
    };
  });

  function updateBudgetSummary() {
    if (selectedBudgetType === 'OPEN') return;
    const v = parseFloat(budgetEl.value) || 0;
    const fee = v * 0.1;
    const total = v + fee;
    sumBudget.textContent = v ? formatNaira(v) : '—';
    sumFee.textContent = v ? formatNaira(Math.round(fee)) : '—';
    sumTotal.textContent = v ? formatNaira(Math.round(total)) : '—';
  }

  if (budgetEl) budgetEl.oninput = updateBudgetSummary;

  if (catEl) {
    catEl.onchange = () => {
      sumCategory.textContent = catEl.options[catEl.selectedIndex]?.text || '—';
    };
  }

  if (dateEl) {
    dateEl.onchange = () => {
      if (dateEl.value) {
        const d = new Date(dateEl.value);
        sumDate.textContent = d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
      } else {
        sumDate.textContent = '—';
      }
    };
  }
}

// Submit Post Task Form
document.getElementById('postTaskForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const token = await window.getTaskaToken();
  if (!token) {
    if (window.showToast) window.showToast('Please log in to post a task.');
    return;
  }

  const submitBtn = document.getElementById('submitPostTaskBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting task…';

  const body = {
    title: document.getElementById('taskTitle').value.trim(),
    category: document.getElementById('taskCategory').value,
    description: document.getElementById('taskDesc').value.trim(),
    taskType: selectedTaskType,
    location: document.getElementById('taskLocation')?.value.trim() || (selectedTaskType === 'REMOTE' ? 'Remote' : ''),
    deadline: document.getElementById('taskDate')?.value || null,
    preferredTime: document.getElementById('taskTime')?.value || 'Flexible',
    budgetType: selectedBudgetType,
    budget: document.getElementById('taskBudget')?.value || null,
    budgetMin: document.getElementById('budgetMin')?.value || null,
    budgetMax: document.getElementById('budgetMax')?.value || null,
  };

  try {
    const res = await fetch(`${DASHBOARD_API_BASE}/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (res.ok && json.success) {
      if (window.showToast) window.showToast('Task posted successfully!');
      document.getElementById('postTaskForm').reset();
      switchTab('browse');
    } else {
      if (window.showToast) window.showToast(json.error || 'Failed to post task.');
    }
  } catch (err) {
    console.error('Post task error:', err);
    if (window.showToast) window.showToast('Network error. Failed to post task.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Post task';
  }
});

// ─── TAB 4: Wallet Loading & Filtering ────────────────────────────────────────

async function loadWalletData() {
  try {
    const token = await window.getTaskaToken();
    if (!token) return;

    const res = await fetch(`${DASHBOARD_API_BASE}/wallet/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load wallet');

    const { balance, escrowBalance, lifetimeEarned, transactions, stats } = json.data;
    allWalletTxs = transactions || [];

    document.getElementById('wallet-balance').textContent = formatNairaDecimals(balance);
    document.getElementById('modal-withdraw-balance').textContent = formatNairaDecimals(balance);

    document.getElementById('wallet-escrow').textContent  = formatNaira(escrowBalance);
    document.getElementById('wallet-lifetime').textContent = formatNaira(lifetimeEarned);

    document.getElementById('stat-earned').textContent        = formatNaira(stats?.totalEarned || 0);
    document.getElementById('stat-wallet-escrow').textContent = formatNaira(stats?.inEscrow || 0);
    document.getElementById('stat-withdrawn').textContent     = formatNaira(stats?.totalWithdrawn || 0);
    document.getElementById('stat-month').textContent         = formatNaira(stats?.thisMonth || 0);

    renderWalletTransactions('all');

  } catch (err) {
    console.error('loadWalletData error:', err);
    if (window.showToast) window.showToast('Could not load wallet data.');
  }
}

function renderWalletTransactions(filter = 'all') {
  let txs = allWalletTxs;

  if (filter === 'earnings') {
    txs = txs.filter(t => ['task_payout', 'escrow_release', 'credit'].includes(t.type));
  } else if (filter === 'payments') {
    txs = txs.filter(t => ['task_payment', 'escrow_hold', 'top_up'].includes(t.type));
  } else if (filter === 'withdrawals') {
    txs = txs.filter(t => t.type === 'withdrawal');
  }

  const container = document.getElementById('tx-container');
  if (!container) return;

  if (txs.length === 0) {
    container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No transactions in this view.</div>`;
    return;
  }

  container.innerHTML = txs.map(tx => {
    const isCredit = ['top_up', 'task_payout', 'escrow_release', 'credit'].includes(tx.type);
    const sign = isCredit ? '+' : '−';
    const color = isCredit ? 'var(--green-700)' : 'var(--ink)';

    let iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
    let bgStyle = `background:var(--mint-100); color:var(--green-700);`;

    if (!isCredit) {
      iconSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12L12 5L19 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      bgStyle = `background:var(--red-bg); color:var(--red);`;
    }

    return `
      <div class="receipt-row">
        <div style="display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0;">
          <div style="width:36px; height:36px; border-radius:10px; ${bgStyle} display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${iconSvg}
          </div>
          <div>
            <div style="font-weight: 600; font-size: 0.9rem;">${tx.note || tx.reference || 'Transaction'}</div>
            <div class="mono" style="font-size: 0.74rem; color: var(--muted);">${formatDate(tx.createdAt)}</div>
          </div>
        </div>
        <div>
          <div class="mono" style="font-weight: 700; color: ${color}; text-align: right;">${sign}${formatNaira(tx.amount)}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── TAB 5: Profile Rendering ──────────────────────────────────────────────────

function renderProfileTab() {
  const profile = window.getTaskaProfile();
  if (!profile) return;

  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || '--';
  document.getElementById('profile-big-avatar').textContent = initials;
  document.getElementById('profile-full-name').textContent = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile';
  
  const roleLabel = profile.role === 'TASKER' ? 'Tasker (Earn money)' : 'Task Poster (Hire people)';
  document.getElementById('profile-role-badge').textContent = roleLabel;

  document.getElementById('profile-email-val').textContent = profile.email || 'Not set';
  document.getElementById('profile-phone-val').textContent = profile.phone || 'Not set';
  document.getElementById('profile-username-val').textContent = profile.username ? `@${profile.username}` : 'Not set';
  document.getElementById('profile-verified-val').textContent = profile.isVerified ? '✓ Identity Verified' : 'Unverified';
}

// ─── Task Modal & Applying ────────────────────────────────────────────────────

function openTaskModal(taskId, tasks) {
  if (tasks) cachedTasks = tasks;
  const task = cachedTasks.find(t => t.id === taskId);
  if (!task) return;

  currentTaskId = taskId;

  document.getElementById('modal-category').textContent = task.category || 'General';
  document.getElementById('modal-title').textContent    = task.title;
  document.getElementById('modal-desc').textContent     = task.description || 'No description provided.';
  document.getElementById('modal-budget').textContent   = task.budget != null ? formatNaira(task.budget) : 'Open bid';
  document.getElementById('modal-location').textContent = task.location || 'Remote';

  const poster = task.poster ? `${task.poster.firstName} ${task.poster.lastName}`.trim() : 'Unknown';
  document.getElementById('modal-poster').textContent   = poster;

  const verifiedBadge = document.getElementById('modal-verified-badge');
  if (verifiedBadge) verifiedBadge.style.display = task.poster?.isVerified ? 'inline-flex' : 'none';

  const applyBtn = document.getElementById('modal-apply-btn');
  if (appliedTaskIds.has(taskId)) {
    applyBtn.textContent = '✓ Already applied';
    applyBtn.disabled    = true;
    applyBtn.classList.add('btn-secondary');
    applyBtn.classList.remove('btn-primary');
  } else {
    applyBtn.textContent = 'Apply for this task';
    applyBtn.disabled    = false;
    applyBtn.classList.add('btn-primary');
    applyBtn.classList.remove('btn-secondary');
  }

  const modal = document.getElementById('task-modal');
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('is-open'), 10);
}

function closeModal() {
  const modal = document.getElementById('task-modal');
  modal.classList.remove('is-open');
  setTimeout(() => { modal.style.display = 'none'; }, 200);
}

// Apply for task button
document.getElementById('modal-apply-btn')?.addEventListener('click', async () => {
  const profile = window.getTaskaProfile();
  if (!profile) { if (window.showToast) window.showToast('Loading your profile…'); return; }
  if (profile.role !== 'TASKER') { if (window.showToast) window.showToast('Only Taskers can apply to tasks. You are signed up as a Task Poster.'); return; }

  const token = await window.getTaskaToken();
  if (!token) { if (window.showToast) window.showToast('Please log in again.'); return; }

  const btn = document.getElementById('modal-apply-btn');
  btn.textContent = 'Submitting…';
  btn.disabled    = true;

  try {
    const res = await fetch(`${DASHBOARD_API_BASE}/tasks/${currentTaskId}/apply`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });

    const json = await res.json();
    if (res.ok && json.success) {
      appliedTaskIds.add(currentTaskId);
      btn.textContent = '✓ Applied!';
      if (window.showToast) window.showToast('Application submitted successfully!');
      setTimeout(closeModal, 1200);
    } else {
      btn.textContent = 'Apply for this task';
      btn.disabled    = false;
      if (window.showToast) window.showToast(json.error || 'Failed to apply.');
    }
  } catch (err) {
    btn.textContent = 'Apply for this task';
    btn.disabled    = false;
    if (window.showToast) window.showToast('Network error. Please try again.');
  }
});

// Modal close triggers
document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.getElementById('modal-close-2')?.addEventListener('click', closeModal);
document.getElementById('task-modal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ─── Fund / Withdraw Modals ───────────────────────────────────────────────────

document.getElementById('openFundModalBtn')?.addEventListener('click', () => {
  const m = document.getElementById('fundModal');
  m.style.display = 'flex';
  setTimeout(() => m.classList.add('is-open'), 10);
});

document.getElementById('openWithdrawModalBtn')?.addEventListener('click', () => {
  const m = document.getElementById('withdrawModal');
  m.style.display = 'flex';
  setTimeout(() => m.classList.add('is-open'), 10);
});

function closeFundModal() {
  const m = document.getElementById('fundModal');
  m.classList.remove('is-open');
  setTimeout(() => m.style.display = 'none', 200);
}

function closeWithdrawModal() {
  const m = document.getElementById('withdrawModal');
  m.classList.remove('is-open');
  setTimeout(() => m.style.display = 'none', 200);
}

document.getElementById('closeFundModalBtn')?.addEventListener('click', closeFundModal);
document.getElementById('closeWithdrawModalBtn')?.addEventListener('click', closeWithdrawModal);

document.getElementById('fundWalletForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (window.showToast) window.showToast('Wallet funding (Paystack demo) submitted!');
  closeFundModal();
});

document.getElementById('withdrawForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (window.showToast) window.showToast('Withdrawal request (Demo) submitted!');
  closeWithdrawModal();
});

// Wallet Tab Filters
document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(tab => {
  tab.addEventListener('click', (e) => {
    document.querySelectorAll('#wallet-tabs-bar .wallet-tab').forEach(t => t.classList.remove('is-active'));
    e.target.classList.add('is-active');
    renderWalletTransactions(e.target.dataset.walletFilter);
  });
});

// ─── Browse Filters Binding ────────────────────────────────────────────────────

let searchTimer = null;
document.getElementById('gigSearch')?.addEventListener('input', function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    browseFilters.search = this.value.trim();
    browsePage = 1;
    loadBrowseGigsData();
  }, 400);
});

document.getElementById('filterLocation')?.addEventListener('change', function () {
  browseFilters.location = this.value;
  browsePage = 1;
  loadBrowseGigsData();
});

document.getElementById('filterSort')?.addEventListener('change', function () {
  browseFilters.sort = this.value;
  browsePage = 1;
  loadBrowseGigsData();
});

// Category Chips
document.querySelectorAll('[data-chip-group="category"] .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('[data-chip-group="category"] .chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    browseFilters.category = chip.dataset.value;
    browsePage = 1;
    loadBrowseGigsData();
  });
});

// Load More
document.getElementById('load-more-btn')?.addEventListener('click', () => {
  browsePage++;
  loadBrowseGigsData(true);
});

// ─── Initialization ────────────────────────────────────────────────────────────

// Delegated click listener for all tabs and anchor links
document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-tab], a[href^="#"]');
  if (!link) return;

  const targetTab = link.dataset.tab || (link.getAttribute('href') || '').replace('#', '');
  const validTabs = ['dashboard', 'browse', 'post', 'wallet', 'profile'];

  if (validTabs.includes(targetTab)) {
    e.preventDefault();
    window.switchTab(targetTab);
  }
});

function bootSPA() {
  initPostTask();
  const initialHash = window.location.hash.replace('#', '') || 'dashboard';
  window.switchTab(initialHash);
}

if (window.__taskaReady || window.__taskaToken) {
  bootSPA();
} else {
  window.addEventListener('taska:ready', bootSPA, { once: true });
}

// ─── TAB 6: Settings & Profile Edit ────────────────────────────────────────────

function renderSettingsTab() {
  const profile = window.getTaskaProfile();
  if (!profile) return;

  document.getElementById('settingsFname').value = profile.firstName || '';
  document.getElementById('settingsLname').value = profile.lastName || '';
  
  // Format phone number back to 10 digits for local display
  const rawPhone = profile.phone || '';
  const digitsOnly = rawPhone.replace(/\D/g, '').replace(/^234/, '').replace(/^\+234/, '');
  document.getElementById('settingsPhone').value = digitsOnly;
  
  document.getElementById('settingsLocation').value = profile.location || '';
  document.getElementById('settingsBio').value = profile.bio || '';
}

// Bind Settings Profile Save Form
document.getElementById('settingsProfileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = await window.getTaskaToken();
  if (!token) return;

  const btn = document.getElementById('settingsSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const rawPhone = document.getElementById('settingsPhone').value.trim();
  const digitsOnly = rawPhone.replace(/\D/g, '').replace(/^0/, '');
  const fullPhone = digitsOnly ? '+234' + digitsOnly : '';

  const body = {
    firstName: document.getElementById('settingsFname').value.trim(),
    lastName: document.getElementById('settingsLname').value.trim(),
    phone: fullPhone,
    location: document.getElementById('settingsLocation').value.trim(),
    bio: document.getElementById('settingsBio').value.trim()
  };

  try {
    const res = await fetch(`${DASHBOARD_API_BASE}/profiles/me`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const json = await res.json();
    if (res.ok && json.success) {
      window.__taskaProfile = json.profile;
      
      // Update sidebar avatar & name immediately
      if (window.populateSidebar) {
        populateSidebar(json.profile);
      }
      
      if (window.showToast) window.showToast('Profile updated successfully!');
    } else {
      if (window.showToast) window.showToast(json.error || 'Failed to update profile.');
    }
  } catch (err) {
    console.error('Settings save profile error:', err);
    if (window.showToast) window.showToast('Network error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

// Bind Delete Account Danger Action
document.getElementById('settingsDeleteBtn')?.addEventListener('click', async () => {
  const confirmed = confirm('WARNING: Are you absolutely sure you want to delete your Taska account? This action is permanent, and cannot be undone.');
  if (!confirmed) return;

  const token = await window.getTaskaToken();
  if (!token) return;

  const btn = document.getElementById('settingsDeleteBtn');
  btn.disabled = true;
  btn.textContent = 'Deleting Account...';

  try {
    const res = await fetch(`${DASHBOARD_API_BASE}/profiles/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    const json = await res.json();
    if (res.ok && json.success) {
      if (window.showToast) window.showToast('Account deleted. Signing out...');
      await window.Clerk.signOut();
      window.location.replace('../Auth/login.html');
    } else {
      if (window.showToast) window.showToast(json.error || 'Failed to delete account.');
      btn.disabled = false;
      btn.textContent = 'Delete Account';
    }
  } catch (err) {
    console.error('Settings delete account error:', err);
    if (window.showToast) window.showToast('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Delete Account';
  }
});
