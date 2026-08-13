/* ==========================================================================
   tasker-my-applications.js — Dedicated Controller for Tasker My Applications
   Fetches submitted bids, offers, shortlisted statuses, and active contracts.
   ========================================================================== */

let myApplicationsData = [];
let currentFilter = 'ALL';

async function initMyApplicationsPage() {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) {
    console.warn('Profile or Supabase client not ready yet.');
    return;
  }

  // Bind filter buttons
  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentFilter = chip.dataset.filter;
      renderApplicationsList();
    });
  });

  await fetchMyApplications();
}

async function fetchMyApplications() {
  const profile = await window.ensureTaskaProfile();
  const container = document.getElementById('my-tasks-list');
  if (!profile || !window.supabaseClient || !container) return;

  try {
    const { data: applications, error } = await window.supabaseClient
      .from('Application')
      .select('*, task:taskId(*, poster:posterId(id, firstName, lastName, username, avatarUrl, isVerified, averageRating))')
      .eq('taskerId', profile.id)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    myApplicationsData = applications || [];
    renderApplicationsList();
  } catch (err) {
    console.error('fetchMyApplications error:', err);
    if (container) {
      container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--red);">Failed to load your submitted applications. Please refresh the page.</div>`;
    }
  }
}

function renderApplicationsList() {
  const container = document.getElementById('my-tasks-list');
  if (!container) return;

  let filtered = myApplicationsData;
  if (currentFilter === 'OPEN') {
    filtered = myApplicationsData.filter(a => !a.isSelected && a.task?.status === 'OPEN');
  } else if (currentFilter === 'ASSIGNED') {
    filtered = myApplicationsData.filter(a => (a.isSelected || a.task?.assignedTo === a.taskerId) && a.task?.status !== 'COMPLETED' && a.task?.status !== 'CLOSED');
  } else if (currentFilter === 'COMPLETED') {
    filtered = myApplicationsData.filter(a => a.task?.status === 'COMPLETED' || a.task?.status === 'CLOSED');
  }

  const clipboardIcon = window.TaskaIcons?.clipboard || '';
  const checkIcon = window.TaskaIcons?.verified || '';
  const starIcon = window.TaskaIcons?.star || '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding:48px 24px; text-align:center; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md);">
        <div style="color:var(--muted);">${clipboardIcon}</div>
        <h3 style="font-size:1.2rem; color:var(--green-900); margin-bottom:6px;">No applications found</h3>
        <p style="color:var(--muted); font-size:0.9rem; margin-bottom:20px;">You haven't submitted any bids matching this filter.</p>
        <a href="../BrowseTasks/index.html" class="btn btn-primary">Browse Open Tasks</a>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(app => {
    const task = app.task || {};
    const poster = task.poster || {};
    const isSelected = app.isSelected || task.assignedTo === app.taskerId;
    const isCompleted = task.status === 'COMPLETED' || task.status === 'CLOSED';

    let statusClass = 'status-pending';
    let statusLabel = 'Application Pending';

    if (isCompleted) {
      statusClass = 'status-done';
      statusLabel = 'Task Completed';
    } else if (isSelected) {
      statusClass = 'status-open';
      statusLabel = 'Hired / In Progress';
    } else if (task.status !== 'OPEN') {
      statusClass = 'status-closed';
      statusLabel = 'Task Closed';
    }

    const rawTitle = task.title || 'Untitled Task';
    const safeTitle = window.escapeHtml(rawTitle);
    const safeDesc = window.escapeHtml(task.description || '');
    const safeCategory = window.escapeHtml(task.category || 'General');

    const rawPosterName = `${poster.firstName || ''} ${poster.lastName || ''}`.trim() || poster.username || 'Task Poster';
    const safePosterName = window.escapeHtml(rawPosterName);
    const posterInitials = `${(poster.firstName || 'P')[0] || 'P'}${(poster.lastName || '')[0] || ''}`.toUpperCase();
    const posterAvatar = poster.avatarUrl ? `<img src="${poster.avatarUrl}" alt="${safePosterName}">` : posterInitials;

    const budgetVal = app.bidAmount || task.budget || 0;
    const budgetStr = `₦${budgetVal.toLocaleString()}`;
    const appliedDate = new Date(app.createdAt).toLocaleDateString();

    return `
      <div class="task-manage-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
              <span class="status ${statusClass}">${statusLabel}</span>
              <span style="font-size:0.8rem; color:var(--muted);">${safeCategory} · Applied ${appliedDate}</span>
            </div>
            <h2 style="font-size:1.25rem; color:var(--green-900); margin-bottom:6px;">${safeTitle}</h2>
            <p style="color:var(--ink-soft); font-size:0.9rem; line-height:1.5; margin-bottom:12px;">${safeDesc}</p>
            
            <!-- Poster info strip -->
            <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
              <div class="sidebar-user-avatar" style="width:32px; height:32px; font-size:0.8rem;">${posterAvatar}</div>
              <div>
                <div style="font-weight:600; font-size:0.88rem; color:var(--green-900); display:flex; align-items:center; gap:6px;">
                  Posted by ${safePosterName} ${poster.isVerified ? `<span style="color:var(--green-700); font-size:0.8rem; display:inline-flex; align-items:center;">${checkIcon}</span>` : ''}
                </div>
                <div style="font-size:0.75rem; color:var(--muted);">${task.location || 'Remote / Anywhere'}</div>
              </div>
            </div>
          </div>

          <div style="text-align:right;">
            <div class="mono" style="font-size:1.3rem; font-weight:700; color:var(--green-700);">${budgetStr}</div>
            <div style="font-size:0.78rem; color:var(--muted); margin-top:2px;">${app.bidAmount ? 'Your Bid' : 'Task Budget'}</div>
            
            <div style="display:flex; gap:8px; margin-top:16px; justify-content:flex-end; flex-wrap:wrap;">
              ${poster.id ? `
                <button class="btn btn-secondary btn-sm" onclick="window.location.href='../../Chats/index.html?user=${poster.id}'">Message Poster</button>
                <a href="../../Poster/Profile/index.html?id=${poster.id}" class="btn btn-ghost btn-sm">View Poster</a>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('taska:ready', initMyApplicationsPage);
  if (window.__taskaReady) initMyApplicationsPage();
});
