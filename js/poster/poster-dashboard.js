/* ==========================================================================
   poster-dashboard.js — Dedicated Controller for Poster Dashboard
   Fetches active posted tasks, applicants count, escrow holds, and metrics.
   Pure SVG icons, XSS-protected DOM rendering.
   ========================================================================== */

async function loadDashboardData() {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  try {
    // 1. Greeting
    const firstName = profile.firstName || 'there';
    const greetingEl = document.getElementById('greeting');
    if (greetingEl) {
      greetingEl.textContent = `Good ${getGreetingTimeOfDay()}, ${firstName}`;
    }

    // 2. Fetch Wallet directly
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .select('*, WalletTransaction(*)')
      .eq('profileId', profile.id)
      .maybeSingle();

    const balanceEl = document.getElementById('stat-balance');
    const escrowEl = document.getElementById('stat-escrow');

    if (wallet) {
      if (balanceEl) balanceEl.textContent = window.formatNaira(wallet.balance || 0);
      if (escrowEl) escrowEl.textContent = (wallet.escrowBalance > 0) ? `${window.formatNaira(wallet.escrowBalance)} in escrow` : 'Verified Escrow';
    } else {
      if (balanceEl) balanceEl.textContent = '₦0';
      if (escrowEl) escrowEl.textContent = 'Verified Escrow';
    }

    // 3. Fetch Active Posted Tasks
    const { data: activeTasks } = await window.supabaseClient
      .from('Task')
      .select('id, title, status, budget, budgetType, assignedTo, createdAt, category')
      .eq('posterId', profile.id)
      .in('status', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PROOF_SUBMITTED'])
      .order('createdAt', { ascending: false })
      .limit(6);

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
        : `5.0<span style="font-size:0.9rem; color:var(--muted);"> / 5</span>`;
    }

    if (reviewsEl) {
      reviewsEl.textContent = (profile.totalReviews > 0)
        ? `From ${profile.totalReviews} review${profile.totalReviews > 1 ? 's' : ''}`
        : 'Verified Identity';
    }

    renderActiveTasksList(activeTasks || []);

  } catch (err) {
    console.error('loadDashboardData error:', err);
  }
}

function getGreetingTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function getStatusLabel(status) {
  const map = {
    OPEN:            'Open for Bids',
    ASSIGNED:        'Tasker Assigned',
    IN_PROGRESS:     'In Progress',
    PROOF_SUBMITTED: 'Awaiting Review',
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

function renderActiveTasksList(tasks) {
  const el = document.getElementById('active-tasks-list');
  if (!el) return;
  
  if (!tasks || tasks.length === 0) {
    el.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">No active tasks yet. <a href="../PostTask/index.html" style="color:var(--green-700); font-weight:600;">Post a task now.</a></div>';
    return;
  }

  el.innerHTML = tasks.map(task => {
    const budget = task.budget != null ? window.formatNaira(task.budget) : 'Open bid';
    const safeTitle = window.escapeHtml(task.title || 'Untitled Task');
    const safeCategory = window.escapeHtml(task.category || 'General');

    return `
      <div class="task-row" style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--line-soft);">
        <div style="flex:1; min-width:0;">
          <div class="task-row-title" style="font-weight:600; font-size:0.92rem; color:var(--green-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${safeTitle}</div>
          <div class="task-row-meta" style="font-size:0.78rem; color:var(--muted); margin-top:2px; display:flex; align-items:center; gap:8px;">
            <span>${safeCategory}</span>
            <span>·</span>
            <span class="status ${getStatusClass(task.status)}" style="font-size:0.72rem; padding:2px 8px;">${getStatusLabel(task.status)}</span>
          </div>
        </div>
        <div class="task-row-amt mono" style="font-weight:700; font-size:0.95rem; color:var(--green-700); margin-left:12px;">${budget}</div>
      </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('taska:ready', loadDashboardData);
  if (window.__taskaReady) loadDashboardData();
  loadDashboardData();
});
