/**
 * Taska Tasker Browse Tasks Controller
 * XSS-secure rendering, verified relative routing, clean SVG badges,
 * attachment media display, poster-controlled custom price proposals,
 * and robust Tasker Eligibility Criteria checks (KYC, Gender, Age, Location).
 */

let allTasksData = [];
let currentCategoryFilter = 'ALL';
let currentSearchQuery = '';
let currentSort = 'NEWEST';
let activeModalTaskId = null;
let isCustomProposalActive = false;

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

  // Proposal toggle handlers
  const openPropBtn = document.getElementById('btn-open-proposal-wrap');
  const cancelPropBtn = document.getElementById('btn-cancel-proposal');
  const customPropWrap = document.getElementById('custom-proposal-wrap');
  const bidInput = document.getElementById('modal-bid-amount');

  if (openPropBtn) {
    openPropBtn.addEventListener('click', () => {
      isCustomProposalActive = true;
      if (customPropWrap) customPropWrap.style.display = 'block';
      openPropBtn.style.display = 'none';
      if (bidInput) {
        bidInput.focus();
        triggerFeeUpdate();
      }
    });
  }

  if (cancelPropBtn) {
    cancelPropBtn.addEventListener('click', () => {
      isCustomProposalActive = false;
      const currentTask = allTasksData.find(t => t.id === activeModalTaskId);
      if (customPropWrap) customPropWrap.style.display = 'none';
      if (openPropBtn && currentTask?.allowPriceProposals) openPropBtn.style.display = 'inline-flex';
      if (bidInput && currentTask) {
        bidInput.value = currentTask.budget || '';
        triggerFeeUpdate();
      }
    });
  }
}

function triggerFeeUpdate() {
  const bidInput = document.getElementById('modal-bid-amount');
  const currentTask = allTasksData.find(t => t.id === activeModalTaskId);
  const feeValEl = document.getElementById('bid-fee-val');
  const takehomeValEl = document.getElementById('bid-takehome-val');
  const applyBtn = document.getElementById('modal-apply-btn');

  const baseBudget = currentTask?.budget || 0;
  const effectiveAmount = isCustomProposalActive
    ? (parseFloat(bidInput?.value || '0') || 0)
    : baseBudget;

  const fee = Math.round(effectiveAmount * 0.10);
  const netTakeHome = Math.max(0, effectiveAmount - fee);

  if (feeValEl) feeValEl.textContent = `-₦${fee.toLocaleString()}`;
  if (takehomeValEl) takehomeValEl.textContent = `₦${netTakeHome.toLocaleString()}`;

  if (applyBtn && !applyBtn.disabled && !applyBtn._isCriteriaBlocked) {
    if (isCustomProposalActive && effectiveAmount > 0 && effectiveAmount !== baseBudget) {
      applyBtn.textContent = `Submit Price Proposal (₦${effectiveAmount.toLocaleString()})`;
    } else {
      applyBtn.textContent = `Apply at Stated Budget (₦${baseBudget.toLocaleString()})`;
    }
  }
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

  const locIcon = window.TaskaIcons?.location || '';

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:60px; text-align:center; color:var(--muted); grid-column:1/-1;">No open tasks found matching your filter criteria.</div>';
    return;
  }

  let html = '';
  filtered.forEach(task => {
    const rawCat = task.category || 'General';
    const rawTitle = task.title || 'Untitled Task';
    
    // Parse media & clean text
    const { cleanText, mediaUrls } = window.parseTaskMediaAndText
      ? window.parseTaskMediaAndText(task.description, task.proofUrls)
      : { cleanText: task.description || '', mediaUrls: task.proofUrls || [] };

    const rawDesc = cleanText.length > 110 ? cleanText.slice(0, 110) + '…' : cleanText;
    const rawLoc = task.location || 'Remote / Anywhere';
    const poster = task.Profile;
    const rawPosterName = poster ? `${poster.firstName || ''} ${poster.lastName || ''}`.trim() || poster.username : 'Poster';

    const category = window.escapeHtml(rawCat);
    const title = window.escapeHtml(rawTitle);
    const desc = window.escapeHtml(rawDesc);
    const location = window.escapeHtml(rawLoc);
    const posterName = window.escapeHtml(rawPosterName);
    const budget = (task.budget || 0).toLocaleString();

    const hasAttachment = mediaUrls && mediaUrls.length > 0;
    const allowProposal = task.allowPriceProposals === true;

    // Criteria indicators
    const hasKycReq = task.criteriaKycOnly === true;
    const genderReq = task.criteriaGender && task.criteriaGender !== 'ANY' ? `${task.criteriaGender === 'MALE' ? 'Male' : 'Female'} Only` : null;
    const ageReq = (task.criteriaMinAge && task.criteriaMaxAge)
      ? `Age ${task.criteriaMinAge}–${task.criteriaMaxAge}`
      : task.criteriaMinAge ? `Age ${task.criteriaMinAge}+`
      : task.criteriaMaxAge ? `Age ≤${task.criteriaMaxAge}` : null;

    html += `
      <div class="gig-card" onclick="openTaskModal('${task.id}')">
        <div class="gig-card-top">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="gig-category">${category}</span>
            ${hasKycReq ? `<span style="font-size:0.72rem; color:#1E40AF; background:#EFF6FF; border:1px solid #BFDBFE; padding:2px 7px; border-radius:10px; font-weight:600;">Verified Only</span>` : ''}
            ${genderReq ? `<span style="font-size:0.72rem; color:#6B21A8; background:#FAF5FF; border:1px solid #E9D5FF; padding:2px 7px; border-radius:10px; font-weight:600;">${genderReq}</span>` : ''}
            ${ageReq ? `<span style="font-size:0.72rem; color:#065F46; background:#ECFDF5; border:1px solid #A7F3D0; padding:2px 7px; border-radius:10px; font-weight:600;">${ageReq}</span>` : ''}
            ${allowProposal ? `<span style="font-size:0.72rem; color:#92400E; background:#FEF3C7; border:1px solid #FCD34D; padding:2px 7px; border-radius:10px; font-weight:600;">Proposals Allowed</span>` : ''}
            ${hasAttachment ? `<span style="font-size:0.72rem; color:var(--green-800); background:var(--mint-050); border:1px solid var(--mint-150); padding:2px 7px; border-radius:10px; font-weight:600;">Attachment</span>` : ''}
          </div>
          <span class="gig-budget">₦${budget}</span>
        </div>
        <h3 style="font-size:1.05rem; margin:6px 0; color:var(--green-900);">${title}</h3>
        <p class="gig-desc">${desc}</p>
        <div class="gig-card-foot">
          <span class="gig-loc" style="display:inline-flex; align-items:center; gap:4px;">${locIcon} ${location}</span>
          <span style="font-size:0.78rem; color:var(--muted);">By ${posterName}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.openTaskModal = async function (taskId) {
  activeModalTaskId = taskId;
  isCustomProposalActive = false;

  const modal = document.getElementById('task-detail-modal');
  if (!modal) return;

  const task = allTasksData.find(t => t.id === taskId);
  if (!task) return;

  modal.style.display = 'flex';

  const poster = task.Profile;
  const rawPosterName = poster ? `${poster.firstName || ''} ${poster.lastName || ''}`.trim() || poster.username : 'Task Poster';
  const posterName = window.escapeHtml(rawPosterName);

  // Parse media and clean description
  const { cleanText, mediaUrls } = window.parseTaskMediaAndText
    ? window.parseTaskMediaAndText(task.description, task.proofUrls)
    : { cleanText: task.description || '', mediaUrls: task.proofUrls || [] };

  document.getElementById('modal-task-title').textContent = task.title || '';
  document.getElementById('modal-task-category').textContent = task.category || 'General';
  document.getElementById('modal-task-budget').textContent = `₦${(task.budget || 0).toLocaleString()}`;
  document.getElementById('modal-task-location').textContent = task.location || 'Remote / Anywhere';
  document.getElementById('modal-task-desc').textContent = cleanText || 'No detailed description provided.';

  // Render media attachments inside modal
  const mediaContainer = document.getElementById('modal-task-media');
  if (mediaContainer) {
    mediaContainer.innerHTML = window.renderTaskMediaHTML ? window.renderTaskMediaHTML(mediaUrls) : '';
  }

  // Populate Criteria Container
  const criteriaBox = document.getElementById('modal-task-criteria');
  const criteriaBadges = document.getElementById('modal-criteria-badges');
  if (criteriaBox && criteriaBadges) {
    const badges = [];
    if (task.criteriaKycOnly) badges.push('<span style="font-size:0.78rem; color:#1E40AF; background:#EFF6FF; border:1px solid #BFDBFE; padding:3px 9px; border-radius:12px; font-weight:600;">✓ KYC Verified Taskers Only</span>');
    if (task.criteriaGender && task.criteriaGender !== 'ANY') badges.push(`<span style="font-size:0.78rem; color:#6B21A8; background:#FAF5FF; border:1px solid #E9D5FF; padding:3px 9px; border-radius:12px; font-weight:600;">⚥ ${task.criteriaGender === 'MALE' ? 'Male Taskers' : 'Female Taskers'} Only</span>`);
    if (task.criteriaMinAge || task.criteriaMaxAge) {
      const ageStr = (task.criteriaMinAge && task.criteriaMaxAge)
        ? `${task.criteriaMinAge}–${task.criteriaMaxAge} years old`
        : task.criteriaMinAge ? `${task.criteriaMinAge}+ years old` : `Up to ${task.criteriaMaxAge} years old`;
      badges.push(`<span style="font-size:0.78rem; color:#065F46; background:#ECFDF5; border:1px solid #A7F3D0; padding:3px 9px; border-radius:12px; font-weight:600;">🎂 Age Requirement: ${ageStr}</span>`);
    }
    if (task.criteriaLocation && task.criteriaLocation !== 'ANY') {
      badges.push(`<span style="font-size:0.78rem; color:#374151; background:#F3F4F6; border:1px solid #E5E7EB; padding:3px 9px; border-radius:12px; font-weight:600;">📍 Location: ${task.criteriaLocation}</span>`);
    }

    if (badges.length > 0) {
      criteriaBadges.innerHTML = badges.join('');
      criteriaBox.style.display = 'block';
    } else {
      criteriaBox.style.display = 'none';
    }
  }

  // Budget display & proposal box management
  const fixedBudgetAmountEl = document.getElementById('fixed-budget-amount');
  const openPropBtn = document.getElementById('btn-open-proposal-wrap');
  const customPropWrap = document.getElementById('custom-proposal-wrap');
  const bidInput = document.getElementById('modal-bid-amount');
  const msgInput = document.getElementById('modal-bid-message');
  const budgetStatusLabel = document.getElementById('budget-status-label');

  if (fixedBudgetAmountEl) fixedBudgetAmountEl.textContent = `₦${(task.budget || 0).toLocaleString()}`;
  if (budgetStatusLabel) budgetStatusLabel.textContent = task.allowPriceProposals ? 'Poster Stated Budget' : 'Fixed Task Budget';

  // Toggle proposal button visibility strictly based on poster setting
  if (task.allowPriceProposals === true) {
    if (openPropBtn) openPropBtn.style.display = 'inline-flex';
  } else {
    if (openPropBtn) openPropBtn.style.display = 'none';
  }
  if (customPropWrap) customPropWrap.style.display = 'none';

  if (bidInput) {
    bidInput.value = task.budget || '';
    if (!bidInput._hasFeeListener) {
      bidInput.addEventListener('input', triggerFeeUpdate);
      bidInput._hasFeeListener = true;
    }
  }
  if (msgInput) msgInput.value = '';

  const posterLink = document.getElementById('modal-poster-link');
  const checkIcon = window.TaskaIcons?.verified || '';
  if (posterLink) {
    posterLink.href = `../../Poster/Profile/index.html?id=${poster?.id || ''}`;
    posterLink.innerHTML = `${posterName} ${poster?.isVerified ? `<span style="color:var(--green-700); font-size:0.8rem; display:inline-flex; align-items:center; gap:2px;">${checkIcon} Verified</span>` : ''}`;
  }

  const msgBtn = document.getElementById('modal-message-poster-btn');
  if (msgBtn) {
    if (task.allowDirectMessages === true && poster?.id) {
      msgBtn.style.display = 'inline-flex';
      msgBtn.onclick = () => {
        window.location.href = `../../Chats/index.html?user=${poster.id}`;
      };
    } else {
      msgBtn.style.display = 'none';
    }
  }

  // Check active role & application status
  const profile = await window.ensureTaskaProfile();
  const currentRole = window.getTaskaRole ? window.getTaskaRole() : 'POSTER';
  const applyBtn = document.getElementById('modal-apply-btn');

  if (applyBtn) {
    applyBtn._isCriteriaBlocked = false;
    applyBtn.style.background = '';

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
        applyBtn.textContent = 'Already Applied';
      } else {
        // Evaluate Criteria against Profile
        const isVerified = profile.isVerified || profile.kycStatus === 'VERIFIED';
        
        // 1. KYC Check
        if (task.criteriaKycOnly && !isVerified) {
          applyBtn._isCriteriaBlocked = true;
          applyBtn.disabled = false;
          applyBtn.textContent = 'KYC Required (Verify Identity)';
          applyBtn.style.background = 'var(--green-800)';
          applyBtn.onclick = () => window.showKycRequiredModal(task);
          return;
        }

        // 2. Gender Check
        if (task.criteriaGender && task.criteriaGender !== 'ANY') {
          if (!profile.gender || profile.gender.toUpperCase() !== task.criteriaGender.toUpperCase()) {
            applyBtn._isCriteriaBlocked = true;
            applyBtn.disabled = true;
            applyBtn.textContent = `Requires ${task.criteriaGender === 'MALE' ? 'Male' : 'Female'} Tasker`;
            return;
          }
        }

        // 3. Age Check
        if (task.criteriaMinAge || task.criteriaMaxAge) {
          if (!profile.dateOfBirth) {
            applyBtn._isCriteriaBlocked = true;
            applyBtn.disabled = true;
            applyBtn.textContent = 'Age Declaration Required (Set in Profile)';
            applyBtn.onclick = () => {
              if (window.showToast) window.showToast('Please declare your Date of Birth in Profile Settings before applying.');
            };
            return;
          } else {
            const birthYear = new Date(profile.dateOfBirth).getFullYear();
            const age = new Date().getFullYear() - birthYear;
            if (task.criteriaMinAge && age < task.criteriaMinAge) {
              applyBtn._isCriteriaBlocked = true;
              applyBtn.disabled = true;
              applyBtn.textContent = `Min Age ${task.criteriaMinAge} Required (You: ${age})`;
              return;
            }
            if (task.criteriaMaxAge && age > task.criteriaMaxAge) {
              applyBtn._isCriteriaBlocked = true;
              applyBtn.disabled = true;
              applyBtn.textContent = `Max Age ${task.criteriaMaxAge} Required (You: ${age})`;
              return;
            }
          }
        }

        // All criteria satisfied!
        applyBtn.disabled = false;
        triggerFeeUpdate();
        applyBtn.onclick = () => submitApplication(taskId, task.budget);
      }
    }
  }
};

async function submitApplication(taskId, defaultBudget) {
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

  const task = allTasksData.find(t => t.id === taskId);
  const bidInput = document.getElementById('modal-bid-amount');
  const msgInput = document.getElementById('modal-bid-message');

  // Final bid amount determination
  let finalBid = defaultBudget;
  if (task?.allowPriceProposals && isCustomProposalActive && bidInput && bidInput.value) {
    const parsed = parseFloat(bidInput.value);
    if (parsed > 0) finalBid = parsed;
  }

  const coverMsg = msgInput ? msgInput.value.trim() : '';

  const applyBtn = document.getElementById('modal-apply-btn');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Submitting Application...';
  }

  try {
    // Call server-side Postgres RPC which validates all criteria (KYC, Gender, Age)
    const { data: rpcResult, error: rpcErr } = await window.supabaseClient.rpc('apply_for_task_with_criteria', {
      p_task_id: taskId,
      p_tasker_id: profile.id,
      p_bid_amount: finalBid || defaultBudget || 0,
      p_message: coverMsg
    });

    if (rpcErr) throw rpcErr;

    if (!rpcResult || !rpcResult.success) {
      const msg = rpcResult?.message || 'Could not submit application.';
      if (rpcResult?.error === 'KYC_REQUIRED') {
        window.showKycRequiredModal(task);
      } else {
        if (window.showToast) window.showToast(msg);
      }
      if (applyBtn) {
        applyBtn.disabled = false;
        triggerFeeUpdate();
      }
      return;
    }

    if (window.showToast) window.showToast('Application submitted successfully! The Poster has been notified.');
    closeTaskModal();
    await loadBrowseTasks();
  } catch (err) {
    console.error('Submit application error:', err);
    if (window.showToast) window.showToast('Could not submit application.');
    if (applyBtn) {
      applyBtn.disabled = false;
      triggerFeeUpdate();
    }
  }
}

window.showKycRequiredModal = function (task) {
  document.querySelectorAll('.taska-kyc-prompt-backdrop').forEach(d => d.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'taska-kyc-prompt-backdrop';
  backdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.68); z-index: 999999;
    display: flex; align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(4px); opacity: 0; transition: opacity 0.2s ease;
  `;

  const taskTitle = window.escapeHtml ? window.escapeHtml(task?.title || 'this task') : (task?.title || 'this task');

  backdrop.innerHTML = `
    <div style="background: var(--paper, #fff); border: 1px solid var(--line, #e2e8f0); border-radius: 16px; max-width: 440px; width: 100%; padding: 28px; box-shadow: 0 20px 48px rgba(0,0,0,0.28); text-align: center; transform: scale(0.94); transition: transform 0.2s ease;">
      <div style="width: 56px; height: 56px; border-radius: 50%; background: #E6F4EA; color: var(--green-700); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </div>
      <h3 style="font-size: 1.22rem; color: var(--green-900); margin: 0 0 8px 0; font-weight: 700;">Identity Verification Required</h3>
      <p style="font-size: 0.9rem; color: var(--ink-soft); line-height: 1.55; margin: 0 0 24px 0;">The poster requires a KYC-verified Tasker for <strong>"${taskTitle}"</strong>. Complete your one-time identity verification using NIN, Voter's Card, or Government ID to apply.</p>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button type="button" class="btn btn-primary btn-kyc-now" style="flex: 1;">Verify Identity Now</button>
        <button type="button" class="btn btn-secondary btn-kyc-cancel" style="flex: 1;">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    const card = backdrop.querySelector('div');
    if (card) card.style.transform = 'scale(1)';
  });

  const close = () => {
    backdrop.style.opacity = '0';
    const card = backdrop.querySelector('div');
    if (card) card.style.transform = 'scale(0.94)';
    setTimeout(() => backdrop.remove(), 200);
  };

  backdrop.querySelector('.btn-kyc-cancel').onclick = close;
  backdrop.querySelector('.btn-kyc-now').onclick = () => {
    close();
    if (typeof window.launchDojahKyc === 'function') {
      window.launchDojahKyc();
    } else {
      window.location.href = '../../Settings/kyc.html';
    }
  };
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
};

function closeTaskModal() {
  const modal = document.getElementById('task-detail-modal');
  if (modal) modal.style.display = 'none';
  isCustomProposalActive = false;
}

document.addEventListener('DOMContentLoaded', () => {
  initBrowseTasksPage();
});
