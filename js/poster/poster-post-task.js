/**
 * Taska Poster Post Task Controller (Poster Module)
 * 5-Step Slide Wizard with Validation, Optional Skipping, Draft Saving/Loading,
 * Future Date Selection, and Allow Direct Messages toggle.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const currentRole = window.getTaskaRole ? window.getTaskaRole() : 'POSTER';
  if (currentRole === 'TASKER') {
    if (window.showToast) window.showToast('Taskers cannot post tasks. Switch to Poster mode to post.');
    window.location.href = '../../Tasker/BrowseTasks/index.html';
    return;
  }

  const form = document.getElementById('postTaskForm');
  const mediaInput = document.getElementById('task-media-input');
  const dropzone = document.getElementById('task-media-dropzone');
  const previewWrap = document.getElementById('task-media-preview-wrap');
  const filenameEl = document.getElementById('task-media-filename');
  const removeBtn = document.getElementById('task-media-remove-btn');
  const draftBanner = document.getElementById('draft-loaded-banner');
  const discardDraftBtn = document.getElementById('btn-discard-draft');

  let selectedMediaFile = null;
  let activeTaskType = 'physical';
  let activeBudgetType = 'fixed';
  let activeDraftId = null;
  let currentStep = 1;
  const totalSteps = 5;

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
  const taskTypeHint = document.getElementById('taskTypeHint');

  // Allow picking today or any future date (2026, 2027, etc.)
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateInput) {
    dateInput.min = todayStr;
  }

  const fmt = (n) => '₦' + Number(n).toLocaleString('en-NG');

  // ── WIZARD STEP NAVIGATION ──────────────────────────────────────────────────
  function goToStep(step) {
    if (step < 1 || step > totalSteps) return;

    // Hide all panels, show target step
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('is-active'));
    const targetPanel = document.getElementById(`step-panel-${step}`);
    if (targetPanel) targetPanel.classList.add('is-active');

    // Update Stepper node states
    document.querySelectorAll('.wizard-step-node').forEach(node => {
      const s = parseInt(node.dataset.step, 10);
      node.classList.remove('is-active', 'is-completed');
      if (s === step) {
        node.classList.add('is-active');
      } else if (s < step) {
        node.classList.add('is-completed');
      }
    });

    currentStep = step;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Stepper node clicks (only allowed if moving backward or if current step valid)
  document.querySelectorAll('.wizard-step-node').forEach(node => {
    node.addEventListener('click', () => {
      const targetStep = parseInt(node.dataset.step, 10);
      if (targetStep < currentStep) {
        goToStep(targetStep);
      } else if (targetStep > currentStep && validateStep(currentStep)) {
        goToStep(targetStep);
      }
    });
  });

  function validateStep(step) {
    if (step === 1) {
      const title = document.getElementById('taskTitle')?.value.trim();
      const category = document.getElementById('taskCategory')?.value;
      const desc = document.getElementById('taskDesc')?.value.trim();
      if (!title) {
        if (window.showToast) window.showToast('Please enter a task title.');
        document.getElementById('taskTitle')?.focus();
        return false;
      }
      if (!category) {
        if (window.showToast) window.showToast('Please select a category.');
        document.getElementById('taskCategory')?.focus();
        return false;
      }
      if (!desc) {
        if (window.showToast) window.showToast('Please provide a task description.');
        document.getElementById('taskDesc')?.focus();
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (dateInput && dateInput.value) {
        if (dateInput.value < todayStr) {
          if (window.showToast) window.showToast('Task deadline date cannot be in the past.');
          return false;
        }
      }
      return true;
    }

    if (step === 3) {
      let budget = 0;
      if (activeBudgetType === 'fixed') {
        budget = parseFloat(document.getElementById('taskBudget')?.value || '0');
      } else {
        budget = parseFloat(document.getElementById('budgetMax')?.value || document.getElementById('budgetMin')?.value || '0');
      }
      if (budget <= 0) {
        if (window.showToast) window.showToast('Please enter a valid budget amount.');
        document.getElementById('taskBudget')?.focus();
        return false;
      }
      return true;
    }

    return true;
  }

  // Step button bindings
  document.getElementById('btn-next-1')?.addEventListener('click', () => {
    if (validateStep(1)) goToStep(2);
  });
  document.getElementById('btn-back-2')?.addEventListener('click', () => goToStep(1));
  document.getElementById('btn-next-2')?.addEventListener('click', () => {
    if (validateStep(2)) goToStep(3);
  });
  document.getElementById('btn-back-3')?.addEventListener('click', () => goToStep(2));
  document.getElementById('btn-next-3')?.addEventListener('click', () => {
    if (validateStep(3)) goToStep(4);
  });
  document.getElementById('btn-back-4')?.addEventListener('click', () => goToStep(3));
  document.getElementById('btn-skip-4')?.addEventListener('click', () => goToStep(5));
  document.getElementById('btn-skip-4-alt')?.addEventListener('click', () => goToStep(5));
  document.getElementById('btn-next-4')?.addEventListener('click', () => goToStep(5));
  document.getElementById('btn-back-5')?.addEventListener('click', () => goToStep(4));
  document.getElementById('btn-skip-5')?.addEventListener('click', () => {
    // Reset criteria to default
    if (document.getElementById('criteriaKycOnly')) document.getElementById('criteriaKycOnly').checked = false;
    if (document.getElementById('criteriaGender')) document.getElementById('criteriaGender').value = 'ANY';
    if (document.getElementById('criteriaMinAge')) document.getElementById('criteriaMinAge').value = '';
    if (document.getElementById('criteriaMaxAge')) document.getElementById('criteriaMaxAge').value = '';
    if (document.getElementById('criteriaLocation')) document.getElementById('criteriaLocation').value = 'ANY';
    if (window.showToast) window.showToast('Criteria set to open for all Taskers.');
  });

  // Budget calculations
  if (budgetInput) {
    budgetInput.addEventListener('input', () => {
      const v = parseFloat(budgetInput.value) || 0;
      const fee = v * 0.1;
      if (sumBudget) sumBudget.textContent = v ? fmt(v) : '—';
      if (sumFee) sumFee.textContent = v ? fmt(fee.toFixed(0)) : '—';
      if (sumTotal) sumTotal.textContent = v ? fmt(v) : '—';
    });
  }

  // Category selection summary
  if (categoryInput) {
    categoryInput.addEventListener('change', () => {
      if (sumCategory) sumCategory.textContent = categoryInput.options[categoryInput.selectedIndex]?.text || '—';
    });
  }

  // Date selection summary (without destructive auto-resetting!)
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      if (dateInput.value) {
        const d = new Date(dateInput.value);
        if (!isNaN(d.getTime())) {
          if (sumDate) sumDate.textContent = d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        }
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
        if (taskTypeHint) taskTypeHint.textContent = 'Remote tasks can be completed from anywhere over the internet.';
      } else {
        if (locWrap) locWrap.style.display = 'block';
        if (remWrap) remWrap.style.display = 'none';
        if (sumType) sumType.textContent = 'Physical';
        if (taskTypeHint) taskTypeHint.textContent = 'Physical tasks require the Tasker to be present at a location.';
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
      if (window.showToast) {
        window.showToast('Maximum size for file attachment is 5MB.');
      } else if (window.showAlertDialog) {
        window.showAlertDialog({ title: 'File Too Large', message: 'Maximum size for file attachment is 5MB.' });
      }
      if (mediaInput) mediaInput.value = '';
      return;
    }
    selectedMediaFile = file;
    if (previewWrap && filenameEl) {
      filenameEl.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
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

  // ── DRAFT RECOVERY & INITIALIZATION ──────────────────────────────────────────
  const urlParams = new URLSearchParams(window.location.search);
  const paramDraftId = urlParams.get('draftId');

  async function loadDraftData() {
    let draftData = null;

    if (paramDraftId && window.supabaseClient) {
      try {
        const { data, error } = await window.supabaseClient
          .from('Task')
          .select('*')
          .eq('id', paramDraftId)
          .maybeSingle();

        if (data) {
          draftData = data;
          activeDraftId = data.id;
        }
      } catch (err) {
        console.warn('Failed to load DB draft:', err);
      }
    }

    if (!draftData) {
      try {
        const rawLocal = localStorage.getItem('taska_post_task_draft');
        if (rawLocal) draftData = JSON.parse(rawLocal);
      } catch (_) {}
    }

    if (draftData) {
      populateFormFromDraft(draftData);
      if (draftBanner) draftBanner.style.display = 'flex';
    }
  }

  function populateFormFromDraft(data) {
    if (data.title) document.getElementById('taskTitle').value = data.title;
    if (data.category && categoryInput) {
      categoryInput.value = data.category;
      if (sumCategory) sumCategory.textContent = categoryInput.options[categoryInput.selectedIndex]?.text || data.category;
    }
    if (data.description) document.getElementById('taskDesc').value = data.description;
    if (data.location && document.getElementById('taskLocation')) document.getElementById('taskLocation').value = data.location;
    if (data.deadline && dateInput) {
      const dStr = data.deadline.split('T')[0];
      if (dStr >= todayStr) {
        dateInput.value = dStr;
        if (sumDate) sumDate.textContent = new Date(dStr).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }
    }
    if (data.preferredTime && document.getElementById('taskTime')) document.getElementById('taskTime').value = data.preferredTime;
    if (data.budget && budgetInput) {
      budgetInput.value = data.budget;
      const fee = data.budget * 0.1;
      if (sumBudget) sumBudget.textContent = fmt(data.budget);
      if (sumFee) sumFee.textContent = fmt(fee.toFixed(0));
      if (sumTotal) sumTotal.textContent = fmt(data.budget);
    }
    if (data.allowPriceProposals !== undefined && document.getElementById('allowPriceProposals')) {
      document.getElementById('allowPriceProposals').checked = data.allowPriceProposals === true;
    }
    if (data.allowDirectMessages !== undefined && document.getElementById('allowDirectMessages')) {
      document.getElementById('allowDirectMessages').checked = data.allowDirectMessages === true;
    }
    if (data.criteriaKycOnly !== undefined && document.getElementById('criteriaKycOnly')) {
      document.getElementById('criteriaKycOnly').checked = data.criteriaKycOnly === true;
    }
    if (data.criteriaGender && document.getElementById('criteriaGender')) {
      document.getElementById('criteriaGender').value = data.criteriaGender;
    }
    if (data.criteriaMinAge && document.getElementById('criteriaMinAge')) {
      document.getElementById('criteriaMinAge').value = data.criteriaMinAge;
    }
    if (data.criteriaMaxAge && document.getElementById('criteriaMaxAge')) {
      document.getElementById('criteriaMaxAge').value = data.criteriaMaxAge;
    }
    if (data.criteriaLocation && document.getElementById('criteriaLocation')) {
      document.getElementById('criteriaLocation').value = data.criteriaLocation;
    }
    if (data.taskType) {
      const isRemote = String(data.taskType).toUpperCase() === 'REMOTE';
      activeTaskType = isRemote ? 'remote' : 'physical';
      taskTypeButtons.forEach(b => {
        if (b.dataset.type === activeTaskType) b.classList.add('is-active');
        else b.classList.remove('is-active');
      });
      const locWrap = document.getElementById('locationWrap');
      const remWrap = document.getElementById('remoteWrap');
      if (isRemote) {
        if (locWrap) locWrap.style.display = 'none';
        if (remWrap) remWrap.style.display = 'block';
        if (sumType) sumType.textContent = 'Remote';
      }
    }
  }

  if (discardDraftBtn) {
    discardDraftBtn.addEventListener('click', async () => {
      localStorage.removeItem('taska_post_task_draft');
      if (activeDraftId && window.supabaseClient) {
        await window.supabaseClient.from('Task').delete().eq('id', activeDraftId);
      }
      activeDraftId = null;
      if (form) form.reset();
      if (draftBanner) draftBanner.style.display = 'none';
      goToStep(1);
      if (window.showToast) window.showToast('Draft discarded.');
    });
  }

  await loadDraftData();

  // ── SAVE AS DRAFT HANDLER ───────────────────────────────────────────────────
  async function handleSaveDraft() {
    const profile = await window.ensureTaskaProfile();
    if (!profile) {
      if (window.showToast) window.showToast('Please log in to save a draft.');
      return;
    }

    const title = document.getElementById('taskTitle')?.value.trim() || 'Untitled Draft Task';
    const category = document.getElementById('taskCategory')?.value || 'GENERAL';
    const description = document.getElementById('taskDesc')?.value.trim() || '';
    const locationInput = document.getElementById('taskLocation')?.value.trim() || '';
    const taskDate = document.getElementById('taskDate')?.value || null;
    const taskTime = document.getElementById('taskTime')?.value || 'Flexible';
    const allowPriceProposals = document.getElementById('allowPriceProposals')?.checked ?? false;
    const allowDirectMessages = document.getElementById('allowDirectMessages')?.checked ?? false;
    const criteriaKycOnly = document.getElementById('criteriaKycOnly')?.checked ?? false;
    const criteriaGender = document.getElementById('criteriaGender')?.value || 'ANY';
    const minAgeVal = parseInt(document.getElementById('criteriaMinAge')?.value, 10);
    const maxAgeVal = parseInt(document.getElementById('criteriaMaxAge')?.value, 10);
    const criteriaLocation = document.getElementById('criteriaLocation')?.value || 'ANY';

    let budget = parseFloat(document.getElementById('taskBudget')?.value || '0') || null;

    const locationString = activeTaskType === 'remote' ? 'Remote / Online' : (locationInput || 'In-person / Physical');

    const draftPayload = {
      posterId: profile.id,
      title,
      category,
      description,
      taskType: activeTaskType.toUpperCase() === 'REMOTE' ? 'REMOTE' : 'PHYSICAL',
      location: locationString,
      deadline: taskDate ? new Date(taskDate).toISOString() : null,
      preferredTime: taskTime,
      budgetType: activeBudgetType.toUpperCase() === 'OPEN' ? 'OPEN_BID' : 'FIXED',
      budget: budget,
      allowPriceProposals,
      allowDirectMessages,
      criteriaKycOnly,
      criteriaGender,
      criteriaMinAge: isNaN(minAgeVal) ? null : minAgeVal,
      criteriaMaxAge: isNaN(maxAgeVal) ? null : maxAgeVal,
      criteriaLocation,
      status: 'DRAFT'
    };

    try {
      localStorage.setItem('taska_post_task_draft', JSON.stringify(draftPayload));

      if (window.supabaseClient) {
        if (activeDraftId) {
          await window.supabaseClient.from('Task').update(draftPayload).eq('id', activeDraftId);
        } else {
          const { data: createdDraft } = await window.supabaseClient.from('Task').insert(draftPayload).select().single();
          if (createdDraft) activeDraftId = createdDraft.id;
        }
      }

      if (draftBanner) draftBanner.style.display = 'flex';
      if (window.showToast) window.showToast('Draft saved successfully! You can resume anytime.');
    } catch (err) {
      console.warn('Save draft notice:', err);
      if (window.showToast) window.showToast('Draft saved locally.');
    }
  }

  // Hook all draft buttons across slides
  [1, 2, 3, 4, 5].forEach(num => {
    document.getElementById(`save-draft-btn-${num}`)?.addEventListener('click', handleSaveDraft);
  });

  // ── PUBLISH TASK FORM SUBMIT ─────────────────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;

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
      const allowPriceProposals = document.getElementById('allowPriceProposals')?.checked ?? false;
      const allowDirectMessages = document.getElementById('allowDirectMessages')?.checked ?? false;

      // Validate past dates
      if (taskDate) {
        const selected = new Date(taskDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selected < today) {
          if (window.showToast) window.showToast('Task deadline date cannot be in the past.');
          goToStep(2);
          return;
        }
      }

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

      const criteriaKycOnly = document.getElementById('criteriaKycOnly')?.checked === true;
      const criteriaGender = document.getElementById('criteriaGender')?.value || 'ANY';
      const minAgeVal = parseInt(document.getElementById('criteriaMinAge')?.value, 10);
      const maxAgeVal = parseInt(document.getElementById('criteriaMaxAge')?.value, 10);
      const criteriaMinAge = isNaN(minAgeVal) ? null : minAgeVal;
      const criteriaMaxAge = isNaN(maxAgeVal) ? null : maxAgeVal;
      const criteriaLocation = document.getElementById('criteriaLocation')?.value || 'ANY';

      const taskPayload = {
        posterId: profile.id,
        title,
        category,
        description: description,
        taskType: activeTaskType.toUpperCase() === 'REMOTE' ? 'REMOTE' : 'PHYSICAL',
        location: locationString,
        deadline: taskDate ? new Date(taskDate).toISOString() : null,
        preferredTime: taskTime || 'Flexible',
        budgetType: activeBudgetType.toUpperCase() === 'OPEN' ? 'OPEN_BID' : 'FIXED',
        budget: budget ? parseFloat(budget) : null,
        allowPriceProposals: allowPriceProposals,
        allowDirectMessages: allowDirectMessages,
        criteriaKycOnly: criteriaKycOnly,
        criteriaGender: criteriaGender,
        criteriaMinAge: criteriaMinAge,
        criteriaMaxAge: criteriaMaxAge,
        criteriaLocation: criteriaLocation,
        proofUrls: imageUrl ? [imageUrl] : [],
        status: 'OPEN'
      };

      try {
        if (activeDraftId && window.supabaseClient) {
          const { error } = await window.supabaseClient
            .from('Task')
            .update(taskPayload)
            .eq('id', activeDraftId);
          if (error) throw error;
        } else {
          const { error } = await window.supabaseClient
            .from('Task')
            .insert(taskPayload);
          if (error) throw error;
        }

        localStorage.removeItem('taska_post_task_draft');

        if (window.showToast) window.showToast('Task posted successfully!');
        window.location.href = '../MyPostedTasks/index.html';
      } catch (err) {
        console.error('Post task error:', err);
        const msg = err?.message || 'Failed to post task. Please check all fields.';
        if (window.showToast) window.showToast(msg);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Post Task Now 🚀';
        }
      }
    });
  }
});
