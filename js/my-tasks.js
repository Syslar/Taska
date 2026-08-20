/* ==========================================================================
   my-tasks.js — Dedicated Controller for My Posted Tasks Page (Poster)
   XSS-secure rendering, verified relative routing, and clean SVG badges.
   ========================================================================== */

let myTasksData = [];
let currentFilter = 'ALL';

async function initMyTasksPage() {
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
      renderMyTasksList();
    });
  });

  await fetchMyTasks();
}

async function fetchMyTasks() {
  const profile = await window.ensureTaskaProfile();
  const container = document.getElementById('my-tasks-list');
  if (!profile || !window.supabaseClient || !container) return;

  try {
    const { data: tasks, error } = await window.supabaseClient
      .from('Task')
      .select('*, applications:Application(*, tasker:taskerId(id, firstName, lastName, username, avatarUrl, averageRating, totalReviews, isVerified, location))')
      .eq('posterId', profile.id)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    myTasksData = tasks || [];
    renderMyTasksList();
  } catch (err) {
    console.error('fetchMyTasks error:', err);
    if (container) {
      container.innerHTML = `<div style="padding:40px; text-align:center; color:var(--red);">Failed to load your posted tasks. Please refresh the page.</div>`;
    }
  }
}

function renderMyTasksList() {
  const container = document.getElementById('my-tasks-list');
  if (!container) return;

  let filtered = myTasksData;
  if (currentFilter === 'OPEN') {
    filtered = myTasksData.filter(t => t.status === 'OPEN');
  } else if (currentFilter === 'ASSIGNED') {
    filtered = myTasksData.filter(t => t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS' || t.status === 'PROOF_SUBMITTED');
  } else if (currentFilter === 'COMPLETED') {
    filtered = myTasksData.filter(t => t.status === 'COMPLETED');
  }

  const clipboardIcon = window.TaskaIcons?.clipboard || '';
  const checkIcon = window.TaskaIcons?.verified || '';
  const starIcon = window.TaskaIcons?.star || '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="padding:48px 24px; text-align:center; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md);">
        <div style="color:var(--muted);">${clipboardIcon}</div>
        <h3 style="font-size:1.2rem; color:var(--green-900); margin-bottom:6px;">No tasks found</h3>
        <p style="color:var(--muted); font-size:0.9rem; margin-bottom:20px;">You haven't posted any tasks matching this filter.</p>
        <a href="../PostTask/index.html" class="btn btn-primary">+ Post a Task Now</a>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const apps = t.applications || [];
    const appCount = apps.length;
    const statusClass = t.status === 'OPEN' ? 'status-open' : (t.status === 'COMPLETED' ? 'status-closed' : 'status-pending');
    const budgetStr = t.budget ? `₦${t.budget.toLocaleString()}` : (t.budgetMin && t.budgetMax ? `₦${t.budgetMin.toLocaleString()} – ₦${t.budgetMax.toLocaleString()}` : 'Open Bid');
    const createdDate = new Date(t.createdAt).toLocaleDateString();

    const safeTitle = window.escapeHtml(t.title || 'Untitled Task');
    const safeDesc = window.escapeHtml(t.description || '');
    const safeCategory = window.escapeHtml(t.category || 'General');

    const applicantsHTML = apps.length === 0 ? `
      <div style="padding:16px; text-align:center; color:var(--muted); font-size:0.85rem; background:var(--paper); border-radius:var(--radius-sm); margin-top:14px;">
        No Taskers have applied for this task yet.
      </div>
    ` : apps.map(app => {
      const tasker = app.tasker || {};
      const rawName = `${tasker.firstName || ''} ${tasker.lastName || ''}`.trim() || 'Tasker';
      const tName = window.escapeHtml(rawName);
      const tUsername = window.escapeHtml(tasker.username ? `@${tasker.username}` : '@user');
      const tInit = `${(tasker.firstName || '')[0] || ''}${(tasker.lastName || '')[0] || ''}`.toUpperCase() || 'T';
      const tRating = tasker.averageRating != null ? tasker.averageRating.toFixed(1) : '5.0';
      const isSelected = app.isSelected || t.assignedTo === tasker.id;
      const avHTML = tasker.avatarUrl ? `<img src="${tasker.avatarUrl}" alt="${tName}">` : tInit;
      const safeAppMsg = app.message ? window.escapeHtml(app.message) : '';

      return `
        <div class="applicant-card">
          <div class="applicant-info" onclick="window.location.href='../../Tasker/Profile/index.html?id=${tasker.id}'">
            <div class="applicant-avatar">${avHTML}</div>
            <div>
              <div style="font-weight:700; font-size:0.95rem; color:var(--green-900); display:flex; align-items:center; gap:6px;">
                ${tName} ${tasker.isVerified ? `<span style="color:var(--green-700); font-size:0.8rem; display:inline-flex; align-items:center; gap:3px;">${checkIcon} Verified</span>` : ''}
              </div>
              <div class="mono" style="font-size:0.78rem; color:var(--muted); display:flex; align-items:center; gap:4px;">${tUsername} · ${starIcon} ${tRating}</div>
              ${safeAppMsg ? `<div style="font-size:0.84rem; color:var(--ink-soft); margin-top:4px;">"${safeAppMsg}"</div>` : ''}
            </div>
          </div>
          <div class="applicant-actions">
            ${isSelected ? `
              <span class="badge-hired" style="display:inline-flex; align-items:center; gap:4px;">Selected Tasker ${checkIcon}</span>
            ` : (t.status === 'OPEN' ? `
              <button class="btn btn-primary btn-sm btn-accept-tasker" 
                data-task-id="${t.id}" 
                data-app-id="${app.id}" 
                data-tasker-id="${tasker.id}" 
                data-tasker-name="${tName}">Accept / Hire</button>
            ` : '')}
            <button class="btn btn-secondary btn-sm" onclick="window.location.href='../../Chats/index.html?user=${tasker.id}'">Message</button>
            <a href="../../Tasker/Profile/index.html?id=${tasker.id}" class="btn btn-ghost btn-sm">View Profile</a>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="task-manage-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
          <div>
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
              <span class="status ${statusClass}">${t.status}</span>
              <span style="font-size:0.8rem; color:var(--muted);">${safeCategory} · Posted ${createdDate}</span>
            </div>
            <h2 style="font-size:1.3rem; color:var(--green-900);">${safeTitle}</h2>
            <p style="color:var(--ink-soft); font-size:0.92rem; margin-top:6px; line-height:1.5; max-width:640px;">${safeDesc}</p>
          </div>
          <div style="text-align:right;">
            <div class="mono" style="font-size:1.3rem; font-weight:700; color:var(--green-700);">${budgetStr}</div>
            <div style="font-size:0.8rem; color:var(--muted); margin-top:2px;">${appCount} ${appCount === 1 ? 'Tasker Interested' : 'Taskers Interested'}</div>
          </div>
        </div>

        <div style="margin-top:20px; border-top:1px dashed var(--line); padding-top:16px;">
          <h4 style="font-size:0.92rem; font-weight:600; color:var(--ink); margin-bottom:10px;">
            Interested Taskers (${appCount})
          </h4>
          ${applicantsHTML}
        </div>
      </div>
    `;
  }).join('');

  // Bind Accept/Hire button event listeners safely
  container.querySelectorAll('.btn-accept-tasker').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.taskId;
      const appId = btn.dataset.appId;
      const taskerId = btn.dataset.taskerId;
      const taskerName = btn.dataset.taskerName;
      acceptTasker(taskId, appId, taskerId, taskerName);
    });
  });
}

async function acceptTasker(taskId, applicationId, taskerId, taskerName) {
  const confirmed = window.showConfirmDialog ? await window.showConfirmDialog({
    title: `Hire ${taskerName}?`,
    message: `Are you sure you want to hire ${taskerName} for this task? Escrow will be secured.`,
    confirmText: 'Confirm Hiring',
    cancelText: 'Cancel',
    icon: 'check',
  }) : confirm(`Are you sure you want to hire ${taskerName} for this task?`);

  if (!confirmed) return;

  try {
    // 1. Update Application isSelected = true
    await window.supabaseClient
      .from('Application')
      .update({ isSelected: true })
      .eq('id', applicationId);

    // 2. Update Task assignedTo & status
    const { error } = await window.supabaseClient
      .from('Task')
      .update({
        assignedTo: taskerId,
        status: 'ASSIGNED'
      })
      .eq('id', taskId);

    if (error) throw error;

    if (window.showToast) window.showToast(`Hired ${taskerName} successfully!`);
    await fetchMyTasks();
  } catch (err) {
    console.error('acceptTasker error:', err);
    if (window.showToast) window.showToast('Failed to accept tasker.');
  }
}

window.acceptTasker = acceptTasker;

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('taska:ready', initMyTasksPage);
  if (window.__taskaReady) initMyTasksPage();
});
