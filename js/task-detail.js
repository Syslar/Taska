/* ==========================================================================
   task-detail.js — Standalone Public Task Details Page Controller
   Loads and renders task details from Supabase with RLS, enables sharing,
   copies link, and manages role-based application / chat navigation.
   ========================================================================== */

(function () {
  'use strict';

  let currentTask = null;
  let currentUserProfile = null;

  async function initTaskDetailPage() {
    // 1. Resolve taskId from URL
    const urlParams = new URLSearchParams(window.location.search);
    let taskId = urlParams.get('id') || urlParams.get('taskId');

    // Also support path-based /task/<uuid>
    if (!taskId) {
      const parts = window.location.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last !== 'task' && last !== 'index.html') {
        taskId = last;
      }
    }

    if (!taskId) {
      showError('No task specified. Please browse available tasks.');
      return;
    }

    // 2. Wait for Supabase client
    let attempts = 0;
    while (!window.supabaseClient && attempts < 40) {
      await new Promise((r) => setTimeout(r, 50));
      attempts++;
    }

    if (!window.supabaseClient) {
      showError('Unable to connect to the server. Please refresh the page.');
      return;
    }

    // 3. Check Clerk auth / cached profile in background
    checkAuthHeader();

    // 4. Fetch Task with Poster details
    try {
      const { data: task, error } = await window.supabaseClient
        .from('Task')
        .select('*, Profile!posterId(id, firstName, lastName, username, avatarUrl, averageRating, isVerified, createdAt)')
        .eq('id', taskId)
        .maybeSingle();

      if (error) throw error;
      if (!task) {
        showError('This task could not be found. It may have been completed, closed, or removed.');
        return;
      }

      currentTask = task;
      renderTask(task);
      loadRelatedTasks(task.category, task.id);
    } catch (err) {
      console.error('Fetch task error:', err);
      showError('Could not load task details. Please check your internet connection.');
    }
  }

  function showError(msg) {
    document.getElementById('task-loading-state').style.display = 'none';
    const errBox = document.getElementById('task-error-state');
    if (errBox) {
      errBox.style.display = 'block';
      const msgEl = document.getElementById('task-error-msg');
      if (msgEl && msg) msgEl.textContent = msg;
    }
  }

  function renderTask(task) {
    document.getElementById('task-loading-state').style.display = 'none';
    document.getElementById('task-content-layout').style.display = 'grid';

    // Page title
    const budgetStr = `₦${Number(task.budget || 0).toLocaleString()}`;
    document.title = `${task.title || 'Task Details'} (${budgetStr}) | Taska`;

    // Elements
    const titleEl = document.getElementById('task-detail-title');
    const catEl = document.getElementById('task-detail-category');
    const statusEl = document.getElementById('task-detail-status');
    const proposalBadge = document.getElementById('task-detail-proposal-badge');
    const locEl = document.getElementById('task-detail-location');
    const createdEl = document.getElementById('task-detail-created');
    const descEl = document.getElementById('task-detail-desc');
    const budgetEl = document.getElementById('task-detail-budget');
    const budgetNoteEl = document.getElementById('budget-proposal-note');
    const budgetHeadingEl = document.getElementById('budget-heading-label');
    const tagsEl = document.getElementById('task-detail-tags');

    if (titleEl) titleEl.textContent = task.title || 'Untitled Task';
    if (catEl) catEl.textContent = task.category || 'General';
    if (budgetEl) budgetEl.textContent = budgetStr;

    // Status pill
    if (statusEl) {
      statusEl.textContent = task.status || 'OPEN';
      if (task.status === 'OPEN') {
        statusEl.className = 'task-pill task-pill-open';
      } else {
        statusEl.className = 'task-pill task-pill-closed';
      }
    }

    // Price proposals badge
    if (task.allowPriceProposals) {
      if (proposalBadge) proposalBadge.style.display = 'inline-block';
      if (budgetNoteEl) budgetNoteEl.textContent = 'Price proposals allowed by poster';
      if (budgetHeadingEl) budgetHeadingEl.textContent = 'Poster Stated Budget';
    } else {
      if (proposalBadge) proposalBadge.style.display = 'none';
      if (budgetNoteEl) budgetNoteEl.textContent = 'Fixed budget stated by poster';
      if (budgetHeadingEl) budgetHeadingEl.textContent = 'Fixed Task Budget';
    }

    // Location
    if (locEl) {
      const loc = task.location || 'Remote / Anywhere';
      locEl.textContent = loc;
    }

    // Created timestamp
    if (createdEl && task.createdAt) {
      const timeStr = window.timeAgo ? window.timeAgo(task.createdAt) : '';
      const dateStr = window.formatDate ? window.formatDate(task.createdAt) : new Date(task.createdAt).toLocaleDateString();
      createdEl.textContent = `Posted ${dateStr} ${timeStr ? `(${timeStr})` : ''}`;
    }

    // Tags
    if (tagsEl) {
      if (Array.isArray(task.tags) && task.tags.length > 0) {
        tagsEl.innerHTML = task.tags
          .map((t) => `<span style="font-size:0.75rem; color:var(--green-800); background:#ECFDF5; border:1px solid #A7F3D0; padding:2px 10px; border-radius:12px; font-weight:600;">#${window.escapeHtml ? window.escapeHtml(t) : t}</span>`)
          .join('');
        tagsEl.style.display = 'flex';
      } else {
        tagsEl.style.display = 'none';
      }
    }

    // Description & Media Parsing
    const { cleanText, mediaUrls } = (window.parseTaskMediaAndText
      ? window.parseTaskMediaAndText(task.description, task.proofUrls)
      : { cleanText: task.description || '', mediaUrls: task.proofUrls || [] });

    if (descEl) {
      descEl.textContent = cleanText || 'No detailed description provided.';
    }

    // Media grid
    const mediaWrap = document.getElementById('task-detail-media-wrap');
    const mediaGrid = document.getElementById('task-detail-media-grid');
    if (mediaUrls && mediaUrls.length > 0 && mediaGrid && mediaWrap) {
      mediaGrid.innerHTML = mediaUrls
        .map((url) => `
          <div class="task-media-item" onclick="window.open('${url}','_blank')">
            <img src="${url}" alt="Attachment" loading="lazy">
          </div>
        `)
        .join('');
      mediaWrap.style.display = 'block';
    }

    // Criteria checklist
    renderCriteria(task);

    // Poster Info
    renderPoster(task.Profile);

    // Bind Action Buttons
    bindActions(task);
  }

  function renderCriteria(task) {
    const box = document.getElementById('task-detail-criteria-box');
    const list = document.getElementById('task-detail-criteria-list');
    if (!box || !list) return;

    const badges = [];
    if (task.criteriaKycOnly) {
      badges.push('<span class="criteria-tag">✓ Verified Taskers Only (KYC)</span>');
    }
    if (task.criteriaGender && task.criteriaGender !== 'ANY') {
      const g = task.criteriaGender === 'MALE' ? 'Male Taskers' : task.criteriaGender === 'FEMALE' ? 'Female Taskers' : 'Others';
      badges.push(`<span class="criteria-tag">⚥ ${g} Only</span>`);
    }
    if (task.criteriaMinAge || task.criteriaMaxAge) {
      const ageStr = (task.criteriaMinAge && task.criteriaMaxAge)
        ? `${task.criteriaMinAge}–${task.criteriaMaxAge} yrs`
        : task.criteriaMinAge ? `${task.criteriaMinAge}+ yrs` : `≤${task.criteriaMaxAge} yrs`;
      badges.push(`<span class="criteria-tag">🎂 Age: ${ageStr}</span>`);
    }
    if (task.criteriaLocation && task.criteriaLocation !== 'ANY') {
      badges.push(`<span class="criteria-tag">📍 Location Preference: ${window.escapeHtml ? window.escapeHtml(task.criteriaLocation) : task.criteriaLocation}</span>`);
    }

    if (badges.length > 0) {
      list.innerHTML = badges.join('');
      box.style.display = 'block';
    } else {
      box.style.display = 'none';
    }
  }

  function renderPoster(poster) {
    if (!poster) return;
    const name = `${poster.firstName || ''} ${poster.lastName || ''}`.trim() || poster.username || 'Task Poster';
    const safeName = window.escapeHtml ? window.escapeHtml(name) : name;
    const username = poster.username || 'poster';
    const safeUsername = window.escapeHtml ? window.escapeHtml(username) : username;
    const initials = `${(poster.firstName || 'U')[0]}${(poster.lastName || '')[0] || ''}`.toUpperCase();

    const nameEl = document.getElementById('poster-detail-name');
    const unameEl = document.getElementById('poster-detail-username');
    const avatarEl = document.getElementById('poster-detail-avatar');
    const verifiedEl = document.getElementById('poster-detail-verified');
    const linkEl = document.getElementById('poster-detail-profile-link');
    const joinedEl = document.getElementById('poster-detail-joined');

    if (nameEl) nameEl.textContent = name;
    if (unameEl) unameEl.textContent = `@${safeUsername}`;
    if (verifiedEl) verifiedEl.style.display = poster.isVerified ? 'inline-flex' : 'none';

    if (avatarEl) {
      if (poster.avatarUrl) {
        avatarEl.innerHTML = `<img src="${poster.avatarUrl}" alt="${safeName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
      } else {
        avatarEl.textContent = initials;
      }
    }

    if (joinedEl && poster.createdAt) {
      joinedEl.textContent = `Joined ${new Date(poster.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`;
    }

    if (linkEl) {
      linkEl.href = `/poster/profile?id=${poster.id}`;
    }
  }

  function bindActions(task) {
    const shareData = {
      taskId: task.id,
      title: task.title || 'Task',
      budget: task.budget || 0,
      category: task.category || 'General',
      location: task.location || 'Remote / Anywhere',
      description: task.description || ''
    };

    // Copy Link handlers
    const doCopy = () => {
      if (typeof window.copyTaskLink === 'function') {
        window.copyTaskLink(task.id, task.title);
      } else {
        const url = `${window.location.origin}/task/?id=${encodeURIComponent(task.id)}`;
        navigator.clipboard.writeText(url);
        if (window.showToast) window.showToast('Task link copied to clipboard!');
      }
    };

    document.getElementById('btn-top-copy')?.addEventListener('click', doCopy);
    document.getElementById('btn-side-copy')?.addEventListener('click', doCopy);

    // Share Modal handlers
    const doShare = () => {
      if (typeof window.openShareTaskModal === 'function') {
        window.openShareTaskModal(shareData);
      } else if (typeof window.openShareTaskPicker === 'function') {
        window.openShareTaskPicker(shareData);
      } else {
        doCopy();
      }
    };

    document.getElementById('btn-top-share')?.addEventListener('click', doShare);
    document.getElementById('btn-side-share')?.addEventListener('click', doShare);

    // Message poster button
    const msgBtn = document.getElementById('btn-side-message');
    if (msgBtn && task.allowDirectMessages && task.posterId) {
      msgBtn.style.display = 'inline-flex';
      msgBtn.onclick = () => {
        window.location.href = `/chats?user=${task.posterId}&task=${task.id}`;
      };
    }

    // Apply button
    const applyBtn = document.getElementById('btn-main-apply');
    if (applyBtn) {
      if (task.status !== 'OPEN') {
        applyBtn.disabled = true;
        applyBtn.textContent = `Task is ${task.status}`;
        applyBtn.style.background = 'var(--muted)';
        return;
      }

      applyBtn.onclick = () => {
        // Redirect into browse-tasks with modal automatically triggered
        window.location.href = `/tasker/browse-tasks?taskId=${encodeURIComponent(task.id)}`;
      };
    }
  }

  async function checkAuthHeader() {
    let profile = null;
    try {
      const cached = localStorage.getItem('taska_cached_profile');
      if (cached) profile = JSON.parse(cached);
    } catch (_) {}

    const authBtn = document.getElementById('nav-auth-btn');
    if (profile && profile.id && authBtn) {
      currentUserProfile = profile;
      const role = (profile.activeRole || profile.role || 'POSTER').toUpperCase();
      const targetUrl = role === 'TASKER' ? '/tasker/dashboard' : '/poster/dashboard';
      authBtn.textContent = 'Dashboard →';
      authBtn.href = targetUrl;

      // Adjust apply button if user is poster of this task
      const applyBtn = document.getElementById('btn-main-apply');
      if (applyBtn && currentTask && currentTask.posterId === profile.id) {
        applyBtn.textContent = 'Manage Your Task';
        applyBtn.style.background = 'var(--green-800)';
        applyBtn.onclick = () => {
          window.location.href = '/poster/my-posted-tasks';
        };
      }
    }
  }

  async function loadRelatedTasks(category, currentId) {
    if (!window.supabaseClient) return;
    try {
      let query = window.supabaseClient
        .from('Task')
        .select('id, title, budget, category, location, createdAt')
        .eq('status', 'OPEN')
        .neq('id', currentId)
        .order('createdAt', { ascending: false })
        .limit(3);

      if (category && category !== 'General') {
        query = query.eq('category', category);
      }

      const { data: related } = await query;
      if (related && related.length > 0) {
        const sec = document.getElementById('related-tasks-section');
        const grid = document.getElementById('related-tasks-grid');
        if (sec && grid) {
          grid.innerHTML = related
            .map((r) => `
              <div style="background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px; display:flex; flex-direction:column; justify-content:space-between; gap:10px; box-shadow:0 1px 4px rgba(0,0,0,0.03);">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span style="font-size:0.72rem; font-weight:700; color:var(--green-700); text-transform:uppercase;">${window.escapeHtml ? window.escapeHtml(r.category) : r.category}</span>
                    <span class="mono" style="font-size:1.05rem; font-weight:700; color:var(--green-800);">₦${Number(r.budget || 0).toLocaleString()}</span>
                  </div>
                  <div style="font-weight:700; font-size:0.95rem; color:var(--green-900); line-height:1.35; margin-bottom:4px;">${window.escapeHtml ? window.escapeHtml(r.title) : r.title}</div>
                  <div style="font-size:0.75rem; color:var(--muted);">📍 ${window.escapeHtml ? window.escapeHtml(r.location || 'Remote') : r.location}</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px dashed var(--line); padding-top:10px;">
                  <span style="font-size:0.74rem; color:var(--muted);">${window.timeAgo ? window.timeAgo(r.createdAt) : ''}</span>
                  <a href="/task/?id=${r.id}" class="btn btn-secondary btn-sm" style="font-size:0.78rem; padding:4px 12px; text-decoration:none;">View Task →</a>
                </div>
              </div>
            `)
            .join('');
          sec.style.display = 'block';
        }
      }
    } catch (_) {}
  }

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTaskDetailPage);
  } else {
    initTaskDetailPage();
  }
})();
