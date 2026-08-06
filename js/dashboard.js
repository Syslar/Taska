/* ==========================================================================
   dashboard.js — Single Page Application (SPA) Controller for Taska Dashboard.
   Direct Supabase Data Layer, Unified Roles, & Media Integration.
   ========================================================================== */

// Global state
let currentTab = 'dashboard';
let browseFilters = { search: '', category: 'all', location: 'all', sort: 'newest' };
let currentTaskId = null;
let allWalletTxs = [];
let cachedTasks = [];
let selectedTaskType = 'PHYSICAL';
let selectedBudgetType = 'FIXED';

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

  try {
    if (window.location.hash !== `#${tabName}`) {
      history.pushState(null, '', `#${tabName}`);
    }
  } catch (e) {
    window.location.hash = `#${tabName}`;
  }

  document.querySelectorAll('.sidebar-link[data-tab]').forEach(el => {
    el.classList.toggle('is-active', el.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-bar .tab-item[data-tab]').forEach(el => {
    el.classList.toggle('is-active', el.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('is-active');
  });

  const activePanel = document.getElementById(`tab-${tabName}`);
  if (activePanel) {
    activePanel.classList.add('is-active');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });

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

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash && hash !== currentTab) {
    window.switchTab(hash);
  }
});

// ─── TAB 1: Dashboard Data Loading ────────────────────────────────────────────

async function loadDashboardData() {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  try {
    // 1. Greeting
    const firstName = profile.firstName || 'there';
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) greetingEl.textContent = `${getGreeting()}, ${firstName}`;

    // 2. Fetch Wallet directly
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .select('*, WalletTransaction(*)')
      .eq('profileId', profile.id)
      .maybeSingle();

    const balanceEl = document.getElementById('stat-balance');
    const escrowEl = document.getElementById('stat-escrow');

    if (wallet) {
      if (balanceEl) balanceEl.textContent = formatNaira(wallet.balance || 0);
      if (escrowEl) escrowEl.textContent = (wallet.escrowBalance > 0) ? `${formatNaira(wallet.escrowBalance)} in escrow` : 'No escrow holds';
    } else {
      if (balanceEl) balanceEl.textContent = '₦0';
      if (escrowEl) escrowEl.textContent = 'No escrow holds';
    }

    // 3. Fetch Active Tasks
    const { data: activeTasks } = await window.supabaseClient
      .from('Task')
      .select('id, title, status, budget, budgetType, assignedTo, createdAt')
      .eq('posterId', profile.id)
      .in('status', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PROOF_SUBMITTED'])
      .order('createdAt', { ascending: false })
      .limit(5);

    // 4. Count Completed Tasks
    const { count: completedCount } = await window.supabaseClient
      .from('Task')
      .select('*', { count: 'exact', head: true })
      .eq('posterId', profile.id)
      .in('status', ['COMPLETED', 'CLOSED']);

    const activeCount = activeTasks?.length || 0;
    const activeTasksEl = document.getElementById('stat-active-tasks');
    const activeTasksSubEl = document.getElementById('stat-active-tasks-sub');
    const completedTasksEl = document.getElementById('stat-completed-tasks');

    if (activeTasksEl) activeTasksEl.textContent = activeCount;
    if (activeTasksSubEl) activeTasksSubEl.textContent = activeCount === 1 ? '1 task in progress' : `${activeCount} tasks in progress`;
    if (completedTasksEl) completedTasksEl.textContent = completedCount || 0;

    const rating = profile.averageRating;
    const ratingEl = document.getElementById('stat-rating');
    const reviewsEl = document.getElementById('stat-reviews');

    if (ratingEl) {
      ratingEl.innerHTML = (rating && rating > 0)
        ? `${rating.toFixed(1)}<span style="font-size:0.9rem; color:var(--muted);"> / 5</span>`
        : `—<span style="font-size:0.9rem; color:var(--muted);"> / 5</span>`;
    }

    if (reviewsEl) {
      reviewsEl.textContent = (profile.totalReviews > 0)
        ? `From ${profile.totalReviews} review${profile.totalReviews > 1 ? 's' : ''}`
        : 'No reviews yet';
    }

    renderActiveTasksList(activeTasks || []);
    renderRecentActivityList(wallet?.WalletTransaction || []);

  } catch (err) {
    console.error('loadDashboardData error:', err);
  }
}

function renderActiveTasksList(tasks) {
  const el = document.getElementById('active-tasks-list');
  if (!el) return;
  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">No active tasks yet. <a href="#post" onclick="switchTab(\'post\')" style="color:var(--green-700); font-weight:600;">Post one now.</a></div>';
    return;
  }
  el.innerHTML = tasks.map(task => {
    const budget = task.budget != null ? formatNaira(task.budget) : 'Open bid';
    return `
      <div class="task-row">
        <div class="task-row-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19V5C4 3.9 4.9 3 6 3H18C19.1 3 20 3.9 20 5V19M4 19L2 21M4 19H20M20 19L22 21" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="task-row-body">
          <div class="task-row-title">${task.title}</div>
          <div class="task-row-meta"><span class="status ${getStatusClass(task.status)}">${getStatusLabel(task.status)}</span></div>
        </div>
        <div class="task-row-amt mono">${budget}</div>
      </div>`;
  }).join('');
}

function renderRecentActivityList(transactions) {
  const el = document.getElementById('activity-list');
  if (!el) return;
  if (!transactions || transactions.length === 0) {
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">No wallet activity yet.</div>';
    return;
  }
  el.innerHTML = transactions.map(tx => {
    const isCredit = ['top_up', 'task_payout', 'escrow_release', 'credit'].includes(tx.type);
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
  if (!window.supabaseClient) return;

  const grid = document.getElementById('gig-grid');
  if (!grid) return;

  if (!append) {
    grid.innerHTML = `<div class="gig-grid-loading">${Array(4).fill('<div class="skeleton skeleton-card"></div>').join('')}</div>`;
  }

  try {
    let query = window.supabaseClient
      .from('Task')
      .select('*, Profile!posterId(firstName, lastName, avatarUrl, averageRating, isVerified)')
      .eq('status', 'OPEN');

    if (browseFilters.category && browseFilters.category !== 'all') {
      query = query.eq('category', browseFilters.category);
    }
    if (browseFilters.location && browseFilters.location !== 'all') {
      query = query.ilike('location', `%${browseFilters.location}%`);
    }
    if (browseFilters.search) {
      query = query.or(`title.ilike.%${browseFilters.search}%,description.ilike.%${browseFilters.search}%`);
    }

    if (browseFilters.sort === 'budget_high') {
      query = query.order('budget', { ascending: false, nullsFirst: false });
    } else {
      query = query.order('createdAt', { ascending: false });
    }

    const { data: tasks, error } = await query;
    if (error) throw error;

    cachedTasks = tasks || [];
    const label = document.getElementById('task-count-label');
    if (label) label.textContent = `${cachedTasks.length} open task${cachedTasks.length !== 1 ? 's' : ''} available right now.`;

    if (!append) grid.innerHTML = '';

    if (cachedTasks.length === 0 && !append) {
      grid.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">No tasks match your filters. Try adjusting your search.</div>`;
    } else {
      grid.insertAdjacentHTML('beforeend', cachedTasks.map(renderTaskCard).join(''));
      grid.querySelectorAll('.gig-card:not([data-bound])').forEach(card => {
        card.setAttribute('data-bound', '1');
        card.addEventListener('click', () => openTaskModal(card.dataset.taskId, cachedTasks));
      });
    }
  } catch (err) {
    console.error('loadBrowseGigsData error:', err);
    if (!append) grid.innerHTML = `<div style="padding:40px; text-align:center; color:var(--muted);">Failed to load gigs.</div>`;
  }
}

function renderTaskCard(task) {
  const posterName = task.Profile ? `${task.Profile.firstName || ''} ${task.Profile.lastName || ''}`.trim() : 'Poster';
  const posterInitials = `${(task.Profile?.firstName || '')[0] || ''}${(task.Profile?.lastName || '')[0] || ''}`.toUpperCase() || 'P';
  const budget = task.budget != null ? formatNaira(task.budget) : task.budgetMin ? `${formatNaira(task.budgetMin)} - ${formatNaira(task.budgetMax)}` : 'Open Bid';

  return `
    <div class="gig-card" data-task-id="${task.id}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <span class="gig-category">${task.category || 'General'}</span>
        <span class="gig-budget mono">${budget}</span>
      </div>
      <h3 class="gig-title">${task.title}</h3>
      <p class="gig-desc">${task.description || ''}</p>
      <div class="gig-footer">
        <div class="gig-author">
          <div class="gig-author-avatar">${posterInitials}</div>
          <span class="gig-author-name">${posterName}</span>
        </div>
        <span class="gig-time">${timeAgo(task.createdAt)}</span>
      </div>
    </div>`;
}

// ─── Filter Events for Browse Gigs ─────────────────────────────────────────────

const handleSearchInput = window.TaskaRateLimiter ? window.TaskaRateLimiter.debounce(() => {
  const searchInput = document.getElementById('gigSearch');
  if (searchInput) {
    browseFilters.search = searchInput.value.trim();
    loadBrowseGigsData();
  }
}, 350) : () => {};

document.getElementById('gigSearch')?.addEventListener('input', handleSearchInput);

document.getElementById('filterLocation')?.addEventListener('change', (e) => {
  browseFilters.location = e.target.value;
  loadBrowseGigsData();
});

document.getElementById('filterSort')?.addEventListener('change', (e) => {
  browseFilters.sort = e.target.value;
  loadBrowseGigsData();
});

// ─── TAB 3: Post a Task Form Submission & Interactivity ──────────────────────

function initPostTask() {
  const form = document.getElementById('postTaskForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';

  // 1. Task Type toggle buttons (Physical / Remote)
  const taskTypeOptions = document.querySelectorAll('#postTaskTypeToggle .toggle-option');
  taskTypeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      taskTypeOptions.forEach(o => o.classList.remove('is-active'));
      opt.classList.add('is-active');
      selectedTaskType = opt.dataset.value || 'PHYSICAL';

      const locWrap = document.getElementById('locationWrap');
      if (locWrap) {
        locWrap.style.display = selectedTaskType === 'REMOTE' ? 'none' : 'block';
      }
    });
  });

  // 2. Budget Type toggle buttons (Fixed / Open)
  const budgetTypeOptions = document.querySelectorAll('#postBudgetTypeToggle .toggle-option');
  budgetTypeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      budgetTypeOptions.forEach(o => o.classList.remove('is-active'));
      opt.classList.add('is-active');
      selectedBudgetType = opt.dataset.value || 'FIXED';

      const fixedWrap = document.getElementById('budgetFixedWrap');
      const openWrap = document.getElementById('budgetOpenWrap');
      if (fixedWrap && openWrap) {
        fixedWrap.style.display = selectedBudgetType === 'OPEN' ? 'none' : 'block';
        openWrap.style.display = selectedBudgetType === 'OPEN' ? 'block' : 'none';
      }
    });
  });

  // 3. Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (window.TaskaRateLimiter && !window.TaskaRateLimiter.canExecute('post-task', 3000)) {
      if (window.showToast) window.showToast('Please wait a moment before posting another task.');
      return;
    }

    const profile = await window.ensureTaskaProfile();
    if (!profile || !window.supabaseClient) {
      if (window.showToast) window.showToast('Please sign in to post a task.');
      return;
    }

    const submitBtn = document.getElementById('submitPostTaskBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Posting task…';
    }

    const title = document.getElementById('taskTitle').value.trim();
    const category = document.getElementById('taskCategory').value;
    const description = document.getElementById('taskDesc').value.trim();
    const location = document.getElementById('taskLocation')?.value.trim() || (selectedTaskType === 'REMOTE' ? 'Remote' : 'Lagos');
    const deadline = document.getElementById('taskDate')?.value || null;
    const preferredTime = document.getElementById('taskTime')?.value || 'Flexible';
    const budget = document.getElementById('taskBudget')?.value || null;
    const budgetMin = document.getElementById('budgetMin')?.value || null;
    const budgetMax = document.getElementById('budgetMax')?.value || null;

    try {
      const { data: task, error } = await window.supabaseClient
        .from('Task')
        .insert({
          posterId: profile.id,
          title,
          category,
          description,
          taskType: selectedTaskType,
          location,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          preferredTime,
          budgetType: selectedBudgetType,
          budget: budget ? parseFloat(budget) : null,
          budgetMin: budgetMin ? parseFloat(budgetMin) : null,
          budgetMax: budgetMax ? parseFloat(budgetMax) : null,
          status: 'OPEN'
        })
        .select()
        .single();

      if (error) throw error;

      if (window.showToast) window.showToast('Task posted successfully!');
      form.reset();
      window.switchTab('browse');
    } catch (err) {
      console.error('Post task error:', err);
      if (window.showToast) window.showToast('Failed to post task. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post task';
      }
    }
  });
}

// ─── TAB 4: Wallet Loading & Filtering ────────────────────────────────────────

async function loadWalletData() {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  try {
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .select('*, WalletTransaction(*)')
      .eq('profileId', profile.id)
      .maybeSingle();

    if (wallet) {
      const balance = wallet.balance || 0;
      const escrow = wallet.escrowBalance || 0;
      const lifetime = wallet.lifetimeEarned || 0;

      const wBal = document.getElementById('wallet-balance');
      const wEsc = document.getElementById('wallet-escrow');
      const wLife = document.getElementById('wallet-lifetime');
      const mBal = document.getElementById('modal-withdraw-balance');

      if (wBal) wBal.textContent = formatNairaDecimals(balance);
      if (mBal) mBal.textContent = formatNairaDecimals(balance);
      if (wEsc) wEsc.textContent  = formatNaira(escrow);
      if (wLife) wLife.textContent = formatNaira(lifetime);

      allWalletTxs = wallet.WalletTransaction || [];
      renderWalletTransactions('all');
    }
  } catch (err) {
    console.error('loadWalletData error:', err);
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

async function renderProfileTab() {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || 'U';
  
  const bigAv = document.getElementById('profile-big-avatar');
  const fName = document.getElementById('profile-full-name');
  const roleBadge = document.getElementById('profile-role-badge');
  const pEmail = document.getElementById('profile-email-val');
  const pPhone = document.getElementById('profile-phone-val');
  const pUser = document.getElementById('profile-username-val');
  const pVer = document.getElementById('profile-verified-val');

  if (bigAv) bigAv.textContent = initials;
  if (fName) fName.textContent = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile';
  if (roleBadge) roleBadge.textContent = profile.role === 'TASKER' ? 'Tasker (Earn money)' : 'Task Poster (Hire people)';

  if (pEmail) pEmail.textContent = profile.email || 'Not set';
  if (pPhone) pPhone.textContent = profile.phone || 'Not set';
  if (pUser) pUser.textContent = profile.username ? `@${profile.username}` : 'Not set';
  if (pVer) pVer.textContent = profile.isVerified ? '✓ Identity Verified' : 'Unverified';
}

// ─── Task Modal & Application (Unified for ALL users) ──────────────────────────

async function openTaskModal(taskId, tasks) {
  if (tasks) cachedTasks = tasks;
  const task = cachedTasks.find(t => t.id === taskId);
  if (!task) return;

  currentTaskId = taskId;
  const profile = window.getTaskaProfile();

  document.getElementById('modal-category').textContent = task.category || 'General';
  document.getElementById('modal-title').textContent = task.title;
  
  const posterName = task.Profile ? `${task.Profile.firstName || ''} ${task.Profile.lastName || ''}`.trim() : 'Poster';
  document.getElementById('modal-poster').textContent = posterName;
  document.getElementById('modal-desc').textContent = task.description || 'No detailed description provided.';

  const budget = task.budget != null ? formatNaira(task.budget) : task.budgetMin ? `${formatNaira(task.budgetMin)} - ${formatNaira(task.budgetMax)}` : 'Open Bid';
  document.getElementById('modal-budget').textContent = budget;
  document.getElementById('modal-location').textContent = task.location || 'Remote';

  const applyBtn = document.getElementById('modal-apply-btn');

  if (profile && profile.id === task.posterId) {
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = 'You posted this task';
    }
  } else if (profile && window.supabaseClient) {
    // Check if user already applied
    const { data: existingApp } = await window.supabaseClient
      .from('Application')
      .select('id')
      .eq('taskId', taskId)
      .eq('taskerId', profile.id)
      .maybeSingle();

    if (applyBtn) {
      if (existingApp) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Applied ✓';
      } else {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply for this task';
      }
    }
  } else if (applyBtn) {
    applyBtn.disabled = false;
    applyBtn.textContent = 'Apply for this task';
  }

  const modal = document.getElementById('task-modal');
  if (modal) modal.style.display = 'flex';
}

document.getElementById('modal-close')?.addEventListener('click', () => {
  const modal = document.getElementById('task-modal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('modal-apply-btn')?.addEventListener('click', async () => {
  if (window.TaskaRateLimiter && !window.TaskaRateLimiter.canExecute('apply-task', 3000)) {
    if (window.showToast) window.showToast('Please wait before applying again.');
    return;
  }

  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient || !currentTaskId) {
    if (window.showToast) window.showToast('Please sign in to apply.');
    return;
  }

  const applyBtn = document.getElementById('modal-apply-btn');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Submitting application…';
  }

  try {
    const { error } = await window.supabaseClient
      .from('Application')
      .insert({
        taskId: currentTaskId,
        taskerId: profile.id,
        status: 'PENDING'
      });

    if (error) {
      if (error.code === '23505') {
        if (window.showToast) window.showToast('You have already applied for this task.');
      } else {
        throw error;
      }
    } else {
      if (window.showToast) window.showToast('Application submitted successfully!');
      if (applyBtn) applyBtn.textContent = 'Applied ✓';
      setTimeout(() => {
        const modal = document.getElementById('task-modal');
        if (modal) modal.style.display = 'none';
      }, 1000);
    }
  } catch (err) {
    console.error('Apply task error:', err);
    if (window.showToast) window.showToast('Could not submit application.');
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply for this task';
    }
  }
});

// ─── TAB 6: Settings & Profile Edit (with Media Upload) ─────────────────────────

async function renderSettingsTab() {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  const fname = document.getElementById('settingsFname');
  const lname = document.getElementById('settingsLname');
  const phone = document.getElementById('settingsPhone');
  const loc = document.getElementById('settingsLocation');
  const bio = document.getElementById('settingsBio');

  if (fname) fname.value = profile.firstName || '';
  if (lname) lname.value = profile.lastName || '';

  const rawPhone = profile.phone || '';
  const digitsOnly = rawPhone.replace(/\D/g, '').replace(/^234/, '').replace(/^\+234/, '');
  if (phone) phone.value = digitsOnly;

  if (loc) loc.value = profile.location || '';
  if (bio) bio.value = profile.bio || '';
}

// Save Profile Form Submission
document.getElementById('settingsProfileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (window.TaskaRateLimiter && !window.TaskaRateLimiter.canExecute('save-profile', 2000)) {
    return;
  }

  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const btn = document.getElementById('settingsSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  const rawPhone = document.getElementById('settingsPhone').value.trim();
  const digitsOnly = rawPhone.replace(/\D/g, '').replace(/^0/, '');
  const fullPhone = digitsOnly ? '+234' + digitsOnly : '';

  const firstName = document.getElementById('settingsFname').value.trim();
  const lastName = document.getElementById('settingsLname').value.trim();
  const location = document.getElementById('settingsLocation').value.trim();
  const bio = document.getElementById('settingsBio').value.trim();

  try {
    const { data: updated, error } = await window.supabaseClient
      .from('Profile')
      .update({ firstName, lastName, phone: fullPhone, location, bio })
      .eq('id', profile.id)
      .select()
      .single();

    if (error || !updated) throw error || new Error('Update failed');

    window.__taskaProfile = { ...window.__taskaProfile, ...updated };
    if (window.populateSidebar) {
      populateSidebar(window.__taskaProfile);
    }

    if (window.showToast) window.showToast('Profile updated successfully!');
  } catch (err) {
    console.error('Settings save profile error:', err);
    if (window.showToast) window.showToast('Failed to update profile.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  }
});

// Delete Account Action
document.getElementById('settingsDeleteBtn')?.addEventListener('click', async () => {
  const confirmed = confirm('WARNING: Are you absolutely sure you want to delete your Taska account? This action is permanent.');
  if (!confirmed) return;

  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const btn = document.getElementById('settingsDeleteBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Deleting Account...';
  }

  try {
    const { data: wallet } = await window.supabaseClient.from('Wallet').select('id').eq('profileId', profile.id).maybeSingle();
    if (wallet) {
      await window.supabaseClient.from('WalletTransaction').delete().eq('walletId', wallet.id);
      await window.supabaseClient.from('Wallet').delete().eq('id', wallet.id);
    }
    await window.supabaseClient.from('Application').delete().eq('taskerId', profile.id);
    await window.supabaseClient.from('Task').delete().eq('posterId', profile.id);
    await window.supabaseClient.from('Profile').delete().eq('id', profile.id);

    if (window.showToast) window.showToast('Account deleted. Signing out...');
    await window.Clerk.signOut();
    window.location.replace('../Auth/login.html');
  } catch (err) {
    console.error('Delete account error:', err);
    if (window.showToast) window.showToast('Failed to delete account.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Delete Account';
    }
  }
});

// Boot SPA
function bootSPA() {
  initPostTask();
  const initialHash = window.location.hash.replace('#', '') || 'dashboard';
  window.switchTab(initialHash);
}

if (window.__taskaReady) {
  bootSPA();
} else {
  window.addEventListener('taska:ready', bootSPA, { once: true });
}
