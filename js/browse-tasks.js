/**
 * Taska Browse Tasks Controller
 */

let allTasksData = [];
let currentCategoryFilter = 'ALL';
let currentSearchQuery = '';
let currentSort = 'NEWEST';
let activeModalTaskId = null;

async function initBrowseTasksPage() {
  await loadBrowseTasks();

  // Search input handler
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.oninput = (e) => {
      currentSearchQuery = e.target.value.toLowerCase().trim();
      renderTasksGrid();
    };
  }

  // Category filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentCategoryFilter = chip.dataset.category || 'ALL';
      renderTasksGrid();
    });
  });

  // Sort dropdown
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.onchange = (e) => {
      currentSort = e.target.value;
      renderTasksGrid();
    };
  }

  // Modal close handler
  document.getElementById('task-modal-close')?.addEventListener('click', closeTaskModal);
}

async function loadBrowseTasks() {
  const container = document.getElementById('gig-grid-container');
  if (!container) return;

  container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--muted); grid-column:1/-1;">Loading tasks…</div>';

  if (!window.supabaseClient) return;

  try {
    const { data: tasks, error } = await window.supabaseClient
      .from('Task')
      .select('*, Profile!posterId(id, firstName, lastName, username, avatarUrl, averageRating, isVerified)')
      .eq('status', 'OPEN')
      .order('createdAt', { ascending: false });

    if (error) throw error;

    allTasksData = tasks || [];
    renderTasksGrid();
  } catch (err) {
    console.error('Load browse tasks error:', err);
    container.innerHTML = '<div style="padding:40px; text-align:center; color:var(--red); grid-column:1/-1;">Could not load tasks. Please try again.</div>';
  }
}

function renderTasksGrid() {
  const container = document.getElementById('gig-grid-container');
  if (!container) return;

  let filtered = allTasksData.filter(task => {
    const matchesCat = currentCategoryFilter === 'ALL' || (task.category || '').toUpperCase() === currentCategoryFilter.toUpperCase();
    const titleMatch = (task.title || '').toLowerCase().includes(currentSearchQuery);
    const descMatch = (task.description || '').toLowerCase().includes(currentSearchQuery);
    const locMatch = (task.location || '').toLowerCase().includes(currentSearchQuery);
    return matchesCat && (titleMatch || descMatch || locMatch);
  });

  if (currentSort === 'HIGH') {
    filtered.sort((a, b) => (b.budget || 0) - (a.budget || 0));
  } else if (currentSort === 'LOW') {
    filtered.sort((a, b) => (a.budget || 0) - (b.budget || 0));
  } else {
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:60px; text-align:center; color:var(--muted); grid-column:1/-1;">No open tasks found matching your filter criteria.</div>';
    return;
  }

  let html = '';
  filtered.forEach(task => {
    const category = task.category || 'General';
    const title = task.title || 'Untitled Task';
    const desc = task.description ? (task.description.length > 110 ? task.description.slice(0, 110) + '…' : task.description) : '';
    const budget = (task.budget || 0).toLocaleString();
    const location = task.location || 'Remote / Anywhere';
    const poster = task.Profile;
    const posterName = poster ? `${poster.firstName || ''} ${poster.lastName || ''}`.trim() : 'Poster';

    html += `
      <div class="gig-card" onclick="openTaskModal('${task.id}')">
        <div class="gig-card-top">
          <span class="gig-category">${category}</span>
          <span class="gig-budget">₦${budget}</span>
        </div>
        <h3 style="font-size:1.05rem; margin:6px 0; color:var(--green-900);">${title}</h3>
        <p class="gig-desc">${desc}</p>
        <div class="gig-card-foot">
          <span class="gig-loc">📍 ${location}</span>
          <span style="font-size:0.78rem; color:var(--muted);">By ${posterName}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.openTaskModal = async function (taskId) {
  activeModalTaskId = taskId;
  const modal = document.getElementById('task-detail-modal');
  if (!modal) return;

  const task = allTasksData.find(t => t.id === taskId);
  if (!task) return;

  modal.style.display = 'flex';

  const poster = task.Profile;
  const posterName = poster ? `${poster.firstName || ''} ${poster.lastName || ''}`.trim() || poster.username : 'Task Poster';

  document.getElementById('modal-task-title').textContent = task.title || '';
  document.getElementById('modal-task-category').textContent = task.category || 'General';
  document.getElementById('modal-task-budget').textContent = `₦${(task.budget || 0).toLocaleString()}`;
  document.getElementById('modal-task-location').textContent = task.location || 'Remote / Anywhere';
  document.getElementById('modal-task-desc').textContent = task.description || '';
  
  const posterLink = document.getElementById('modal-poster-link');
  if (posterLink) {
    posterLink.href = `../Profile/index.html?id=${poster?.id || ''}`;
    posterLink.innerHTML = `${posterName} ${poster?.isVerified ? '<span style="color:var(--green-700); font-size:0.8rem;">✓ Verified</span>' : ''}`;
  }

  const msgBtn = document.getElementById('modal-message-poster-btn');
  if (msgBtn && poster?.id) {
    msgBtn.onclick = () => {
      window.location.href = `../Chats/index.html?user=${poster.id}`;
    };
  }

  // Check active role & application status
  const profile = await window.ensureTaskaProfile();
  const currentRole = window.getTaskaRole ? window.getTaskaRole() : 'POSTER';
  const applyBtn = document.getElementById('modal-apply-btn');

  if (applyBtn) {
    if (currentRole === 'POSTER') {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Switch to Tasker Mode to Apply';
      applyBtn.onclick = () => {
        if (window.showToast) window.showToast('Please switch to Tasker mode in the sidebar to apply for tasks.');
      };
    } else if (profile && window.supabaseClient) {
      const { data: existing } = await window.supabaseClient
        .from('Application')
        .select('id')
        .eq('taskId', taskId)
        .eq('taskerId', profile.id)
        .maybeSingle();

      if (existing) {
        applyBtn.disabled = true;
        applyBtn.textContent = 'Already Applied ✓';
      } else {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Apply for this task';
        applyBtn.onclick = () => submitApplication(taskId);
      }
    }
  }
};

async function submitApplication(taskId) {
  const profile = await window.ensureTaskaProfile();
  if (!profile) {
    if (window.showToast) window.showToast('Please log in to apply for tasks.');
    return;
  }

  const currentRole = window.getTaskaRole ? window.getTaskaRole() : 'POSTER';
  if (currentRole === 'POSTER') {
    if (window.showToast) window.showToast('Task Posters cannot apply for tasks. Switch to Tasker mode to apply.');
    return;
  }

  const applyBtn = document.getElementById('modal-apply-btn');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Submitting...';
  }

  try {
    const { error } = await window.supabaseClient
      .from('Application')
      .insert({
        taskId: taskId,
        taskerId: profile.id,
        isSelected: false
      });

    if (error) throw error;

    if (window.showToast) window.showToast('Application submitted successfully! Poster notified ✓');
    closeTaskModal();
    await loadBrowseTasks();
  } catch (err) {
    console.error('Submit application error:', err);
    if (window.showToast) window.showToast('Could not submit application.');
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply for this task';
    }
  }
}

function closeTaskModal() {
  const modal = document.getElementById('task-detail-modal');
  if (modal) modal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  initBrowseTasksPage();
});
