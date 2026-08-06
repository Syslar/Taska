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
  const validTabs = ['dashboard', 'browse', 'post', 'wallet', 'profile', 'settings', 'messages'];
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
  } else if (tabName === 'messages') {
    loadMessagesData();
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
  const posterName = task.Profile ? `${task.Profile.firstName || ''} ${task.Profile.lastName || ''}`.trim() || 'Poster' : 'Poster';
  const posterUsername = task.Profile?.username ? `@${task.Profile.username}` : '@user';
  const posterInitials = `${(task.Profile?.firstName || '')[0] || ''}${(task.Profile?.lastName || '')[0] || ''}`.toUpperCase() || 'P';
  const isVerified = task.Profile?.isVerified;
  const budget = task.budget != null ? formatNaira(task.budget) : task.budgetMin ? `${formatNaira(task.budgetMin)} - ${formatNaira(task.budgetMax)}` : 'Open Bid';

  return `
    <div class="gig-card" data-task-id="${task.id}" style="cursor:pointer; transition:transform 0.15s, box-shadow 0.15s;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid var(--line);">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="gig-author-avatar" style="width:38px; height:38px; font-size:0.9rem; border:1.5px solid var(--green-700);">${posterInitials}</div>
          <div>
            <div style="font-weight:700; font-size:0.9rem; color:var(--body); display:flex; align-items:center; gap:4px;">
              ${posterName} ${isVerified ? '<span style="color:var(--green-700); font-size:0.75rem;">✓</span>' : ''}
            </div>
            <div class="mono" style="font-size:0.76rem; color:var(--muted);">${posterUsername}</div>
          </div>
        </div>
        <span class="gig-budget mono" style="font-weight:700; font-size:1.05rem; color:var(--green-900);">${budget}</span>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span class="gig-category">${task.category || 'General'}</span>
        <span style="font-size:0.78rem; color:var(--muted);">${task.taskType === 'REMOTE' ? '🌐 Remote' : `📍 ${task.location || 'Lagos'}`}</span>
      </div>

      <h3 class="gig-title" style="margin-bottom:6px; font-size:1.05rem;">${task.title}</h3>
      <p class="gig-desc" style="color:var(--ink-soft); font-size:0.88rem; line-height:1.5; margin-bottom:14px;">${task.description || ''}</p>

      <div class="gig-footer" style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:var(--muted); border-top:1px dashed var(--line); padding-top:10px;">
        <span>Posted ${timeAgo(task.createdAt)}</span>
        <span class="btn btn-sm btn-secondary" style="pointer-events:none; border-radius:16px;">View & Apply →</span>
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

  // Live update helper for the right-side summary card
  function updateTaskSummaryPreview() {
    const categoryVal = document.getElementById('taskCategory')?.value || '—';
    const sumCategory = document.getElementById('sumCategory');
    if (sumCategory) sumCategory.textContent = categoryVal;

    const sumType = document.getElementById('sumType');
    if (sumType) sumType.textContent = selectedTaskType === 'REMOTE' ? 'Remote (Online)' : 'Physical (In Person)';

    const sumBudget = document.getElementById('sumBudget');
    const sumFee = document.getElementById('sumFee');
    const sumTotal = document.getElementById('sumTotal');

    if (selectedBudgetType === 'FIXED') {
      const bVal = parseFloat(document.getElementById('taskBudget')?.value) || 0;
      if (bVal > 0) {
        const fee = bVal * 0.10; // 10% platform cut
        if (sumBudget) sumBudget.textContent = formatNaira(bVal);
        if (sumFee) sumFee.textContent = formatNaira(fee);
        if (sumTotal) sumTotal.textContent = formatNaira(bVal);
      } else {
        if (sumBudget) sumBudget.textContent = '—';
        if (sumFee) sumFee.textContent = '—';
        if (sumTotal) sumTotal.textContent = '—';
      }
    } else {
      const bMin = parseFloat(document.getElementById('budgetMin')?.value) || 0;
      const bMax = parseFloat(document.getElementById('budgetMax')?.value) || 0;
      if (bMin > 0 || bMax > 0) {
        if (sumBudget) sumBudget.textContent = `${formatNaira(bMin)} - ${formatNaira(bMax)}`;
      } else {
        if (sumBudget) sumBudget.textContent = 'Open to bids';
      }
      if (sumFee) sumFee.textContent = '10% on accepted bid';
      if (sumTotal) sumTotal.textContent = 'Pending bids';
    }

    const dVal = document.getElementById('taskDate')?.value;
    const tVal = document.getElementById('taskTime')?.value || 'Flexible';
    const sumDate = document.getElementById('sumDate');
    if (sumDate) {
      sumDate.textContent = dVal ? `${dVal} (${tVal})` : tVal;
    }
  }

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
      updateTaskSummaryPreview();
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
      updateTaskSummaryPreview();
    });
  });

  // Attach live preview listeners to all inputs
  ['taskCategory', 'taskBudget', 'budgetMin', 'budgetMax', 'taskDate', 'taskTime'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateTaskSummaryPreview);
    document.getElementById(id)?.addEventListener('change', updateTaskSummaryPreview);
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

  // Message Poster Handler
  const msgBtn = document.getElementById('modal-message-btn');
  if (msgBtn) {
    if (profile && profile.id === task.posterId) {
      msgBtn.style.display = 'none';
    } else {
      msgBtn.style.display = 'inline-flex';
      msgBtn.onclick = () => {
        const modal = document.getElementById('task-modal');
        if (modal) modal.style.display = 'none';
        if (window.switchTab) window.switchTab('messages');
        if (window.selectChatThread && task.Profile) {
          window.selectChatThread(task.Profile);
        }
      };
    }
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

// Settings Subtabs Handler
document.querySelectorAll('[data-settings-subtab]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-settings-subtab]').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const target = btn.dataset.settingsSubtab;
    document.querySelectorAll('.settings-subpanel').forEach(p => p.style.display = 'none');
    const activeSubpanel = document.getElementById(`settings-subpanel-${target}`);
    if (activeSubpanel) activeSubpanel.style.display = 'block';
  });
});

// Public Profile & Live Reviews Modal Controller
let currentViewingProfileId = null;

async function openPublicProfileModal(targetProfileOrId) {
  let profile = window.getTaskaProfile();
  if (targetProfileOrId) {
    if (typeof targetProfileOrId === 'string') {
      const { data } = await window.supabaseClient.from('Profile').select('*').eq('id', targetProfileOrId).single();
      if (data) profile = data;
    } else if (typeof targetProfileOrId === 'object') {
      profile = targetProfileOrId;
    }
  }

  if (!profile) return;
  currentViewingProfileId = profile.id;
  const myProfile = window.getTaskaProfile();
  const isSelf = myProfile && myProfile.id === profile.id;

  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || 'U';
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User';
  const username = `@${profile.username || 'user'}`;
  const roleLabel = profile.role === 'TASKER' ? 'Tasker' : profile.role === 'POSTER' ? 'Task Poster' : 'Poster & Tasker';

  const avatarEl   = document.getElementById('pub-modal-avatar');
  const nameEl     = document.getElementById('pub-modal-name');
  const usernameEl = document.getElementById('pub-modal-username');
  const roleEl     = document.getElementById('pub-modal-role');
  const bioEl      = document.getElementById('pub-modal-bio');
  const locationEl = document.getElementById('pub-modal-location');
  const ratingEl   = document.getElementById('pub-modal-rating');
  const verifiedEl = document.getElementById('pub-modal-verified');
  const editContainer = document.getElementById('pub-modal-edit-container');

  if (avatarEl)   avatarEl.textContent   = initials;
  if (nameEl)     nameEl.textContent     = fullName;
  if (usernameEl) usernameEl.textContent = username;
  if (roleEl)     roleEl.textContent     = roleLabel;
  if (bioEl)      bioEl.textContent      = profile.bio || 'No bio provided yet.';
  if (locationEl) locationEl.textContent = profile.location || 'Lagos, Nigeria';
  if (ratingEl)   ratingEl.textContent   = `★ ${profile.averageRating != null ? profile.averageRating.toFixed(1) : '5.0'} (${profile.reviewCount || 0} reviews)`;
  if (verifiedEl) verifiedEl.textContent = profile.isVerified ? '✓ Verified' : 'Standard Member';
  if (editContainer) editContainer.style.display = isSelf ? 'block' : 'none';

  // Fetch live reviews for this user
  const reviewsList = document.getElementById('pub-modal-reviews-list');
  if (reviewsList && window.supabaseClient) {
    try {
      const { data: reviews } = await window.supabaseClient
        .from('Review')
        .select('*, reviewer:reviewerId(firstName, lastName, username)')
        .eq('revieweeId', profile.id)
        .order('createdAt', { ascending: false });

      if (!reviews || reviews.length === 0) {
        reviewsList.innerHTML = `<div style="color:var(--muted); font-size:0.85rem; text-align:center; padding:10px;">No reviews yet for this user. Be the first to leave one!</div>`;
      } else {
        reviewsList.innerHTML = reviews.map(r => {
          const rName = r.reviewer ? `${r.reviewer.firstName || ''} ${r.reviewer.lastName || ''}`.trim() : 'Anonymous';
          const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
          return `
            <div style="background:var(--surface); padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--line);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-weight:600; font-size:0.85rem;">${rName}</span>
                <span style="color:#f59e0b; font-size:0.8rem;">${stars}</span>
              </div>
              <p style="font-size:0.84rem; color:var(--ink-soft); margin:0;">${r.comment || ''}</p>
              <div style="font-size:0.72rem; color:var(--muted); margin-top:4px; text-align:right;">${timeAgo(r.createdAt)}</div>
            </div>`;
        }).join('');
      }
    } catch (_) {
      reviewsList.innerHTML = `<div style="color:var(--muted); font-size:0.85rem; text-align:center; padding:10px;">No reviews yet.</div>`;
    }
  }

  const modal = document.getElementById('public-profile-modal');
  if (modal) modal.style.display = 'flex';
}

// Leave a Review Form Handler
document.getElementById('leave-review-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const myProfile = await window.ensureTaskaProfile();
  if (!myProfile || !currentViewingProfileId || !window.supabaseClient) {
    if (window.showToast) window.showToast('Please sign in to leave a review.');
    return;
  }

  if (myProfile.id === currentViewingProfileId) {
    if (window.showToast) window.showToast('You cannot leave a review for yourself.');
    return;
  }

  const rating = parseInt(document.getElementById('reviewRatingSelect')?.value || '5');
  const comment = document.getElementById('reviewCommentText')?.value.trim();
  const btn = document.getElementById('submitReviewBtn');

  if (!comment) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Submitting...';
  }

  try {
    const { error: reviewErr } = await window.supabaseClient
      .from('Review')
      .insert({
        reviewerId: myProfile.id,
        revieweeId: currentViewingProfileId,
        rating,
        comment
      });

    if (reviewErr) throw reviewErr;

    // Recalculate average rating & review count for reviewee
    const { data: allReviews } = await window.supabaseClient
      .from('Review')
      .select('rating')
      .eq('revieweeId', currentViewingProfileId);

    if (allReviews && allReviews.length > 0) {
      const count = allReviews.length;
      const sum = allReviews.reduce((acc, r) => acc + (r.rating || 5), 0);
      const avg = parseFloat((sum / count).toFixed(1));

      await window.supabaseClient
        .from('Profile')
        .update({ averageRating: avg, reviewCount: count })
        .eq('id', currentViewingProfileId);
    }

    document.getElementById('reviewCommentText').value = '';
    if (window.showToast) window.showToast('Review submitted successfully!');
    openPublicProfileModal(currentViewingProfileId);

  } catch (err) {
    console.error('Leave review error:', err);
    if (window.showToast) window.showToast('Failed to submit review.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  }
});

document.getElementById('sidebar-user-btn')?.addEventListener('click', () => openPublicProfileModal());
document.getElementById('mobile-avatar')?.addEventListener('click', () => openPublicProfileModal());

document.getElementById('public-profile-close')?.addEventListener('click', () => {
  const modal = document.getElementById('public-profile-modal');
  if (modal) modal.style.display = 'none';
});

document.getElementById('pub-modal-edit-btn')?.addEventListener('click', () => {
  const modal = document.getElementById('public-profile-modal');
  if (modal) modal.style.display = 'none';
  if (window.switchTab) window.switchTab('settings');
});

// Mobile Hamburger Menu Handler
const hamburgerBtn = document.getElementById('mobile-hamburger-btn');
if (hamburgerBtn) {
  hamburgerBtn.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.toggle('is-mobile-open');
    }
  });
}

// ─── TAB 6: Messaging & Chats Controller ─────────────────────────────────────
let activeChatPeer = null;

async function loadMessagesData() {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const threadsList = document.getElementById('chat-threads-list');
  if (!threadsList) return;

  try {
    const { data: messages, error } = await window.supabaseClient
      .from('Message')
      .select('*, sender:senderId(id, firstName, lastName, username, avatarUrl), receiver:receiverId(id, firstName, lastName, username, avatarUrl)')
      .or(`senderId.eq.${profile.id},receiverId.eq.${profile.id}`)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const peerMap = new Map();
    (messages || []).forEach(msg => {
      const peer = msg.senderId === profile.id ? msg.receiver : msg.sender;
      if (peer && !peerMap.has(peer.id)) {
        peerMap.set(peer.id, { peer, lastMessage: msg });
      }
    });

    const threads = Array.from(peerMap.values());

    if (threads.length === 0) {
      threadsList.innerHTML = `<div style="padding:20px; text-align:center; color:var(--muted); font-size:0.85rem;">No active chats yet. Click "Message Poster" on any task to start chatting!</div>`;
    } else {
      threadsList.innerHTML = threads.map(t => {
        const pName = `${t.peer.firstName || ''} ${t.peer.lastName || ''}`.trim() || 'User';
        const pInit = `${(t.peer.firstName || '')[0] || ''}${(t.peer.lastName || '')[0] || ''}`.toUpperCase() || 'U';
        const isSelected = activeChatPeer && activeChatPeer.id === t.peer.id;
        return `
          <div class="chat-thread-item ${isSelected ? 'is-active' : ''}" data-peer-id="${t.peer.id}" style="padding:10px 12px; border-radius:var(--radius-sm); cursor:pointer; display:flex; gap:10px; align-items:center; background:${isSelected ? 'var(--mint-050)' : 'transparent'}; border:1px solid ${isSelected ? 'var(--mint-150)' : 'transparent'};">
            <div class="sidebar-user-avatar" style="width:36px; height:36px; font-size:0.85rem;">${pInit}</div>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:0.86rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pName}</div>
              <div style="font-size:0.78rem; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${t.lastMessage.content || ''}</div>
            </div>
          </div>`;
      }).join('');

      threadsList.querySelectorAll('.chat-thread-item').forEach(item => {
        item.addEventListener('click', () => {
          const peerId = item.dataset.peerId;
          const found = threads.find(t => t.peer.id === peerId);
          if (found) selectChatThread(found.peer);
        });
      });

      if (!activeChatPeer && threads.length > 0) {
        selectChatThread(threads[0].peer);
      }
    }
  } catch (err) {
    console.error('loadMessagesData error:', err);
  }
}

window.openPublicProfileModal = openPublicProfileModal;

async function selectChatThread(peer) {
  activeChatPeer = peer;
  const profile = window.getTaskaProfile();
  if (!profile || !peer) return;

  const pName = `${peer.firstName || ''} ${peer.lastName || ''}`.trim() || 'User';
  const pUsername = `@${peer.username || 'user'}`;
  const pInit = `${(peer.firstName || '')[0] || ''}${(peer.lastName || '')[0] || ''}`.toUpperCase() || 'U';

  const avatarEl = document.getElementById('chat-peer-avatar');
  const nameEl = document.getElementById('chat-peer-name');
  const usernameEl = document.getElementById('chat-peer-username');
  if (avatarEl) avatarEl.textContent = pInit;
  if (nameEl) nameEl.textContent = pName;
  if (usernameEl) usernameEl.textContent = pUsername;

  await loadChatMessages();
}

window.selectChatThread = selectChatThread;

async function loadChatMessages() {
  const profile = window.getTaskaProfile();
  const bodyEl = document.getElementById('chat-messages-body');
  if (!profile || !activeChatPeer || !bodyEl) return;

  try {
    const { data: msgs, error } = await window.supabaseClient
      .from('Message')
      .select('*')
      .or(`and(senderId.eq.${profile.id},receiverId.eq.${activeChatPeer.id}),and(senderId.eq.${activeChatPeer.id},receiverId.eq.${profile.id})`)
      .order('createdAt', { ascending: true });

    if (error) throw error;

    if (!msgs || msgs.length === 0) {
      bodyEl.innerHTML = `<div style="margin:auto; text-align:center; color:var(--muted); font-size:0.85rem;">Say hello to start the conversation!</div>`;
    } else {
      bodyEl.innerHTML = msgs.map(m => {
        const isMine = m.senderId === profile.id;
        return `
          <div style="align-self:${isMine ? 'flex-end' : 'flex-start'}; max-width:75%; background:${isMine ? 'var(--green-700)' : 'var(--paper)'}; color:${isMine ? '#fff' : 'var(--body)'}; padding:10px 14px; border-radius:14px; border:${isMine ? 'none' : '1px solid var(--line)'}; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="font-size:0.88rem; line-height:1.4;">${m.content}</div>
            <div style="font-size:0.7rem; color:${isMine ? 'rgba(255,255,255,0.7)' : 'var(--muted)'}; margin-top:4px; text-align:right;">${timeAgo(m.createdAt)}</div>
          </div>`;
      }).join('');
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }
  } catch (err) {
    console.error('loadChatMessages error:', err);
  }
}

document.getElementById('chat-send-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chatInputText');
  const content = input?.value.trim();
  const profile = await window.ensureTaskaProfile();

  if (!content || !profile || !activeChatPeer || !window.supabaseClient) return;

  input.value = '';
  try {
    const { error } = await window.supabaseClient
      .from('Message')
      .insert({
        senderId: profile.id,
        receiverId: activeChatPeer.id,
        content
      });

    if (error) throw error;
    loadChatMessages();
    loadMessagesData();
  } catch (err) {
    console.error('Send message error:', err);
    if (window.showToast) window.showToast('Failed to send message.');
  }
});

// Settings Logout Button Handler
document.getElementById('settings-logout-btn')?.addEventListener('click', async () => {
  if (window.showToast) window.showToast('Signing out...');
  await window.Clerk.signOut();
  window.location.replace('../Auth/login.html');
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
