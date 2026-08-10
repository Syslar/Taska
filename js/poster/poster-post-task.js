/**
 * Taska Post Task Controller
 * Handles post-task form submission, live summary updates, file attachments, and database insert.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const currentRole = window.getTaskaRole ? window.getTaskaRole() : 'POSTER';
  if (currentRole === 'TASKER') {
    if (window.showToast) window.showToast('Taskers cannot post tasks. Switch to Poster mode to post.');
    window.location.href = 'browse-tasks.html';
    return;
  }

  const form = document.getElementById('postTaskForm');
  const mediaInput = document.getElementById('task-media-input');
  const dropzone = document.getElementById('task-media-dropzone');
  const previewWrap = document.getElementById('task-media-preview-wrap');
  const filenameEl = document.getElementById('task-media-filename');
  const removeBtn = document.getElementById('task-media-remove-btn');

  let selectedMediaFile = null;
  let activeTaskType = 'physical';
  let activeBudgetType = 'fixed';

  // Live task summary elements
  const budgetInput = document.getElementById('taskBudget');
  const categoryInput = document.getElementById('taskCategory');
  const dateInput = document.getElementById('taskDate');
  const sumBudget = document.getElementById('sumBudget');
  const sumTotal = document.getElementById('sumTotal');
  const sumFee = document.getElementById('sumFee');
  const sumCategory = document.getElementById('sumCategory');
  const sumDate = document.getElementById('sumDate');
  const sumType = document.getElementById('sumType');

  const fmt = (n) => '₦' + Number(n).toLocaleString('en-NG');

  // Budget calculations
  if (budgetInput) {
    budgetInput.addEventListener('input', () => {
      const v = parseFloat(budgetInput.value) || 0;
      const fee = v * 0.1;
      const total = v + fee;
      if (sumBudget) sumBudget.textContent = v ? fmt(v) : '—';
      if (sumFee) sumFee.textContent = v ? fmt(fee.toFixed(0)) : '—';
      if (sumTotal) sumTotal.textContent = v ? fmt(total.toFixed(0)) : '—';
    });
  }

  // Category selection summary
  if (categoryInput) {
    categoryInput.addEventListener('change', () => {
      if (sumCategory) sumCategory.textContent = categoryInput.options[categoryInput.selectedIndex]?.text || '—';
    });
  }

  // Date selection summary
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      if (dateInput.value && sumDate) {
        const d = new Date(dateInput.value);
        sumDate.textContent = d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' });
      } else if (sumDate) {
        sumDate.textContent = '—';
      }
    });
  }

  // Task type toggle (Physical vs Remote)
  const taskTypeButtons = document.querySelectorAll('#taskTypeToggle button');
  taskTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      taskTypeButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeTaskType = btn.dataset.type;

      const locWrap = document.getElementById('locationWrap');
      const remWrap = document.getElementById('remoteWrap');

      if (activeTaskType === 'remote') {
        if (locWrap) locWrap.style.display = 'none';
        if (remWrap) remWrap.style.display = 'block';
        if (sumType) sumType.textContent = 'Remote';
      } else {
        if (locWrap) locWrap.style.display = 'block';
        if (remWrap) remWrap.style.display = 'none';
        if (sumType) sumType.textContent = 'Physical';
      }
    });
  });

  // Budget type toggle (Fixed vs Open)
  const budgetTypeButtons = document.querySelectorAll('#budgetTypeToggle button');
  budgetTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      budgetTypeButtons.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeBudgetType = btn.dataset.budgetType;

      const fixedWrap = document.getElementById('fixedBudgetWrap');
      const openWrap = document.getElementById('openBudgetWrap');

      if (activeBudgetType === 'open') {
        if (fixedWrap) fixedWrap.style.display = 'none';
        if (openWrap) openWrap.style.display = 'block';
      } else {
        if (fixedWrap) fixedWrap.style.display = 'block';
        if (openWrap) openWrap.style.display = 'none';
      }
    });
  });

  // File Upload / Dropzone triggers
  if (dropzone && mediaInput) {
    dropzone.addEventListener('click', () => mediaInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    mediaInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  function handleFileSelect(file) {
    if (file.size > 5 * 1024 * 1024) {
      alert('Maximum size for file attachment is 5MB.');
      if (mediaInput) mediaInput.value = '';
      return;
    }
    selectedMediaFile = file;
    if (previewWrap && filenameEl) {
      filenameEl.textContent = `📎 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
      previewWrap.style.display = 'flex';
    }
  }

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedMediaFile = null;
      if (mediaInput) mediaInput.value = '';
      if (previewWrap) previewWrap.style.display = 'none';
    });
  }

  // Form Submission
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const profile = await window.ensureTaskaProfile();
      if (!profile) {
        if (window.showToast) window.showToast('Please log in to post a task.');
        return;
      }

      const title = document.getElementById('taskTitle')?.value.trim();
      const category = document.getElementById('taskCategory')?.value;
      const description = document.getElementById('taskDesc')?.value.trim();
      const locationInput = document.getElementById('taskLocation')?.value.trim();
      const taskDate = document.getElementById('taskDate')?.value;
      const taskTime = document.getElementById('taskTime')?.value;

      let budget = 0;
      if (activeBudgetType === 'fixed') {
        budget = parseFloat(document.getElementById('taskBudget')?.value || '0');
      } else {
        budget = parseFloat(document.getElementById('budgetMax')?.value || document.getElementById('budgetMin')?.value || '0');
      }

      if (!title || !category || budget <= 0 || !description) {
        if (window.showToast) window.showToast('Please fill out all required task details (title, category, description, and budget).');
        return;
      }

      const submitBtn = document.getElementById('post-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting Task...';
      }

      let imageUrl = null;
      if (selectedMediaFile) {
        if (window.showToast) window.showToast('Uploading attachment...');
        imageUrl = await window.uploadTaskaMedia(selectedMediaFile);
      }

      const locationString = activeTaskType === 'remote'
        ? 'Remote / Online'
        : (locationInput || 'In-person / Physical');

      let fullDesc = taskDate
        ? `${description}\n\n[Deadline: ${taskDate} (${taskTime || 'Flexible'})]`
        : description;

      if (imageUrl) {
        fullDesc += `\n\n[Attachment: ${imageUrl}]`;
      }

      try {
        const { data: insertedTask, error } = await window.supabaseClient
          .from('Task')
          .insert({
            posterId: profile.id,
            title,
            category,
            description: fullDesc,
            taskType: activeTaskType.toUpperCase() === 'REMOTE' ? 'REMOTE' : 'PHYSICAL',
            location: locationString,
            deadline: taskDate ? new Date(taskDate).toISOString() : null,
            preferredTime: taskTime || 'Flexible',
            budgetType: activeBudgetType.toUpperCase() === 'OPEN' ? 'OPEN' : 'FIXED',
            budget: budget ? parseFloat(budget) : null,
            status: 'OPEN'
          })
          .select()
          .single();

        if (error) throw error;

        if (window.showToast) window.showToast('Task posted successfully! ✓');
        window.location.href = 'my-tasks.html';
      } catch (err) {
        console.error('Post task error:', err);
        if (window.showToast) window.showToast('Failed to post task. Please try again.');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Post task';
        }
      }
    });
  }
});
