/* ==========================================================================
   tasker-my-applications.js — Full Tasker Applications & Jobs Controller
   Offers, Active Escrow Contracts, Work Submission, and Completed Payouts.
   ========================================================================== */

let myApplicationsData = [];
let currentFilter = 'ALL';
let pendingSubmitTask = null;
let taskerSelectedRating = 0;
let myReviewedTaskIds = new Set();
let currentPendingReviewAction = null;

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

  // Setup modal listeners
  setupSubmitWorkModal();

  await fetchMyApplications();
}

async function fetchMyApplications() {
  const profile = await window.ensureTaskaProfile();
  const container = document.getElementById('my-tasks-list');
  if (!profile || !window.supabaseClient || !container) return;

  if (window.TaskaSkeleton) {
    window.TaskaSkeleton.render(container, 'card', 3);
  }

  try {
    const { data: applications, error } = await window.supabaseClient
      .from('Application')
      .select('*, task:taskId(*, poster:posterId(*))')
      .eq('taskerId', profile.id)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const { data: myReviews, err: revErr } = await window.supabaseClient
      .from('Review')
      .select('taskId')
      .eq('reviewerId', profile.id)
      .eq('revieweeRole', 'POSTER');
    
    if (myReviews) {
      myReviewedTaskIds = new Set(myReviews.map(r => r.taskId).filter(id => id));
    }

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
    filtered = myApplicationsData.filter(a => (a.isSelected || a.task?.assignedTo === a.taskerId) && (a.task?.status === 'ASSIGNED' || a.task?.status === 'IN_PROGRESS' || a.task?.status === 'PROOF_SUBMITTED'));
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
        <a href="/tasker/browse-tasks" class="btn btn-primary">Browse Open Tasks</a>
      </div>`;
    return;
  }

  container.innerHTML = filtered.map(app => {
    const task = app.task || {};
    const poster = task.poster || {};
    const isHired = app.isSelected || task.assignedTo === app.taskerId;
    const isCompleted = task.status === 'COMPLETED' || task.status === 'CLOSED';
    const isProofSubmitted = task.status === 'PROOF_SUBMITTED';
    const isInProgress = (task.status === 'IN_PROGRESS' || task.status === 'ASSIGNED') && isHired;

    let statusClass = 'status-pending';
    let statusLabel = 'Offer Submitted';

    if (isCompleted) {
      statusClass = 'status-closed';
      statusLabel = 'Completed & Paid';
    } else if (isProofSubmitted) {
      statusClass = 'status-pending';
      statusLabel = 'Work Submitted (Awaiting Approval)';
    } else if (isInProgress) {
      statusClass = 'status-open';
      statusLabel = task.revisionNotes ? 'Revisions Requested' : 'Hired — In Progress (Escrow Secured)';
    } else if (task.status !== 'OPEN') {
      statusClass = 'status-closed';
      statusLabel = 'Task Closed';
    }

    const { cleanText, mediaUrls } = window.parseTaskMediaAndText
      ? window.parseTaskMediaAndText(task.description, task.proofUrls)
      : { cleanText: task.description || '', mediaUrls: task.proofUrls || [] };

    const rawTitle = task.title || 'Untitled Task';
    const safeTitle = window.escapeHtml(rawTitle);
    const safeDesc = window.escapeHtml(cleanText);
    const mediaHTML = window.renderTaskMediaHTML ? window.renderTaskMediaHTML(mediaUrls) : '';
    const safeCategory = window.escapeHtml(task.category || 'General');

    const rawPosterName = `${poster.firstName || ''} ${poster.lastName || ''}`.trim() || poster.username || 'Task Poster';
    const safePosterName = window.escapeHtml(rawPosterName);
    const posterInitials = `${(poster.firstName || 'P')[0] || 'P'}${(poster.lastName || '')[0] || ''}`.toUpperCase();
    const posterAvatar = poster.avatarUrl ? `<img src="${poster.avatarUrl}" alt="${safePosterName}">` : posterInitials;

    const budgetVal = app.bidAmount || task.budget || 0;
    const budgetStr = window.formatNaira ? window.formatNaira(budgetVal) : `₦${budgetVal.toLocaleString()}`;
    const appliedDate = new Date(app.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

    // Review / Submission status box
    let statusBoxHTML = '';
    if (isProofSubmitted) {
      const submittedDate = task.proofSubmittedAt ? new Date(task.proofSubmittedAt) : new Date(task.updatedAt);
      const autoReleaseDate = new Date(submittedDate.getTime() + 7 * 86400000);
      const daysRemaining = Math.max(0, Math.ceil((autoReleaseDate.getTime() - Date.now()) / 86400000));
      const autoReleaseDateStr = autoReleaseDate.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });

      statusBoxHTML = `
        <div style="background:#FFFBEB; border:1px solid #FCD34D; border-radius:var(--radius-sm); padding:12px 14px; margin-top:12px; font-size:0.85rem; color:#92400E;">
          <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Deliverable Submitted for Review
          </div>
          ${task.proofNotes ? `<div style="color:var(--ink); margin-bottom:4px;"><strong>Your Notes:</strong> ${window.escapeHtml(task.proofNotes)}</div>` : ''}
          <div style="font-size:0.8rem; color:#B45309; margin-top:4px;">
            ⏳ <strong>7-Day Auto-Release:</strong> If the poster takes no action, payment automatically releases in <strong>${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}</strong> (${autoReleaseDateStr}).
          </div>
        </div>
      `;
    } else if (isInProgress && task.revisionNotes) {
      statusBoxHTML = `
        <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:var(--radius-sm); padding:12px 14px; margin-top:12px; font-size:0.85rem; color:#991B1B;">
          <div style="font-weight:700; margin-bottom:4px;">Revision Requested by Poster:</div>
          <div style="margin-bottom:6px;">"${window.escapeHtml(task.revisionNotes)}"</div>
          <div style="font-size:0.8rem; color:#B91C1C;">Please make the requested adjustments and click "Resubmit Completed Work" below.</div>
        </div>
      `;
    }

    return `
      <div class="task-manage-card" style="${isInProgress ? 'border-left: 4px solid var(--green-700);' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
              <span class="status ${statusClass}">${statusLabel}</span>
              <span style="font-size:0.8rem; color:var(--muted);">${safeCategory} · Applied ${appliedDate}</span>
            </div>
            <h2 style="font-size:1.25rem; color:var(--green-900); margin-bottom:6px;">${safeTitle}</h2>
            <p style="color:var(--ink-soft); font-size:0.9rem; line-height:1.5; margin-bottom:6px;">${safeDesc}</p>
            ${mediaHTML}
            
            <!-- Poster info strip -->
            <div style="display:flex; align-items:center; gap:10px; margin-top:8px;">
              <div class="sidebar-user-avatar" style="width:32px; height:32px; font-size:0.8rem;">${posterAvatar}</div>
              <div>
                <div style="font-weight:600; font-size:0.88rem; color:var(--green-900); display:flex; align-items:center; gap:6px;">
                  Posted by ${safePosterName} ${poster.isVerified ? `<span title="Identity Verified" style="display:inline-flex; align-items:center; vertical-align:middle;">${checkIcon}</span>` : ''}
                </div>
                <div style="font-size:0.75rem; color:var(--muted);">${task.location || 'Remote / Anywhere'}</div>
              </div>
            </div>

            ${app.message ? `
              <div style="margin-top:12px; padding:10px 14px; background:var(--paper); border-radius:var(--radius-sm); font-size:0.85rem; color:var(--ink-soft);">
                <strong>Your Cover Letter / Pitch:</strong> "${window.escapeHtml(app.message)}"
              </div>
            ` : ''}

            ${statusBoxHTML}
          </div>

          <div style="text-align:right;">
            <div class="mono" style="font-size:1.35rem; font-weight:700; color:var(--green-700);">${budgetStr}</div>
            <div style="font-size:0.78rem; color:var(--muted); margin-top:2px;">${app.bidAmount ? 'Your Agreed Rate' : 'Task Budget'}</div>
            
            <div style="display:flex; gap:8px; margin-top:16px; justify-content:flex-end; flex-wrap:wrap;">
              ${isInProgress ? `
                <button class="btn btn-primary btn-sm btn-submit-work"
                  data-task-id="${task.id}"
                  data-task-title="${safeTitle}">
                  ${task.revisionNotes ? '✓ Resubmit Completed Work' : '✓ Submit Completed Work'}
                </button>
              ` : ''}

              ${isProofSubmitted ? `
                <span class="badge-hired" style="display:inline-flex; align-items:center; gap:4px; font-size:0.8rem;">
                  Proof Sent · Awaiting Review
                </span>
              ` : ''}

              ${isCompleted ? `
                ${myReviewedTaskIds.has(task.id) 
                  ? `<div class="btn btn-ghost btn-sm" style="color:var(--green-700); cursor:default;">${checkIcon} Review Submitted</div>` 
                  : `<button class="btn btn-primary btn-sm btn-rate-poster"
                      data-task-id="${task.id}"
                      data-poster-id="${poster.id}"
                      data-poster-name="${safePosterName}">Rate Poster</button>`
                }
              ` : ''}

              ${poster.id ? `
                <button class="btn btn-secondary btn-sm" onclick="window.location.href='/chats?user=${poster.id}&task=${task.id}'">Message Poster</button>
                <a href="/poster/profile${poster.username ? `/@${encodeURIComponent(poster.username)}` : `?id=${poster.id}`}" class="btn btn-ghost btn-sm">View Poster</a>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Bind Submit Work buttons
  container.querySelectorAll('.btn-submit-work').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.taskId;
      const taskTitle = btn.dataset.taskTitle;
      openSubmitWorkModal(taskId, taskTitle);
    });
  });

  const rateBtns = container.querySelectorAll('.btn-rate-poster');
  rateBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const taskId = btn.getAttribute('data-task-id');
      const posterId = btn.getAttribute('data-poster-id');
      const posterName = btn.getAttribute('data-poster-name');
      openTaskReviewModal(taskId, posterId, posterName);
    });
  });
}

function openSubmitWorkModal(taskId, taskTitle) {
  pendingSubmitTask = { taskId, taskTitle };
  const modal = document.getElementById('submitWorkModal');
  const titleText = document.getElementById('submitWorkTaskTitleText');
  const notesInput = document.getElementById('workProofNotes');

  if (titleText) {
    titleText.innerHTML = `You are submitting your deliverable for <strong>${window.escapeHtml(taskTitle)}</strong>. The Poster will be notified immediately to review and release your payout (auto-releases in 7 days if inactive).`;
  }
  if (notesInput) notesInput.value = '';

  if (modal) {
    modal.classList.add('is-open');
    modal.style.display = 'flex';
  }
}

async function handleConfirmSubmitWork() {
  if (!pendingSubmitTask) return;
  const { taskId, taskTitle } = pendingSubmitTask;
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const notes = document.getElementById('workProofNotes')?.value.trim() || '';
  const confirmBtn = document.getElementById('confirmSubmitWorkBtn');

  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Submitting…';
  }

  try {
    const { error } = await window.supabaseClient
      .from('Task')
      .update({
        status: 'PROOF_SUBMITTED',
        proofNotes: notes,
        revisionNotes: null,
        proofSubmittedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    if (error) throw error;

    // Send Email & In-App Notification to Poster via Resend
    const appObj = myApplicationsData.find(a => a.taskId === taskId || a.task?.id === taskId);
    const posterId = appObj?.task?.posterId || appObj?.task?.poster?.id;

    if (window.sendTaskaNotification && posterId) {
      window.sendTaskaNotification({
        type: 'DELIVERABLE_SUBMITTED',
        profileId: posterId,
        data: {
          taskTitle: taskTitle || 'Task',
          taskerName: profile.firstName || profile.username || 'Your Tasker',
        },
      });
    }

    const modal = document.getElementById('submitWorkModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.style.display = 'none';
    }

    if (window.showToast) {
      window.showToast(`Work submitted for "${taskTitle}"! The Poster has been notified.`);
    }

    await fetchMyApplications();

  } catch (err) {
    console.error('handleConfirmSubmitWork error:', err);
    if (window.showToast) window.showToast('Could not submit completed work. Please try again.');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Submit for Poster Approval';
    }
  }
}

function setupSubmitWorkModal() {
  const modal = document.getElementById('submitWorkModal');
  document.getElementById('closeSubmitWorkBtn')?.addEventListener('click', () => {
    if (modal) {
      modal.classList.remove('is-open');
      modal.style.display = 'none';
    }
  });
  document.getElementById('cancelSubmitWorkBtn')?.addEventListener('click', () => {
    if (modal) {
      modal.classList.remove('is-open');
      modal.style.display = 'none';
    }
  });
  document.getElementById('confirmSubmitWorkBtn')?.addEventListener('click', handleConfirmSubmitWork);
}

// ─── STEP 4: POST-COMPLETION REVIEW MODAL ────────────────────────────────────
function openTaskReviewModal(taskId, posterId, posterName) {
  currentPendingReviewAction = { taskId, posterId, posterName };
  taskerSelectedRating = 0;

  const modal = document.getElementById('taskReviewModal');
  const subText = document.getElementById('taskReviewSubText');
  const commentInput = document.getElementById('posterReviewComment');
  const starLabel = document.getElementById('posterStarLabel');

  if (subText) subText.textContent = `How did ${posterName} perform on this task?`;
  if (commentInput) commentInput.value = '';
  if (starLabel) starLabel.textContent = 'Select a rating (1 to 5 stars)';

  if (modal) {
    const starBtns = modal.querySelectorAll('#posterStarSelector .star-btn');
    starBtns.forEach(b => {
      b.classList.remove('is-active');
      b.style.color = 'var(--muted)';
    });
    // Bind star click events once
    if (!modal.dataset.starsBound) {
      const labelMap = { 1: '1 Star — Terrible', 2: '2 Stars — Poor', 3: '3 Stars — Average', 4: '4 Stars — Very Good', 5: '5 Stars — Excellent' };
      starBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          taskerSelectedRating = parseInt(btn.dataset.value, 10);
          starBtns.forEach((b) => {
            const val = parseInt(b.dataset.value, 10);
            if (val <= taskerSelectedRating) {
              b.classList.add('is-active');
              b.style.color = '#F4A819';
            } else {
              b.classList.remove('is-active');
              b.style.color = 'var(--muted)';
            }
          });
          if (starLabel) starLabel.textContent = labelMap[taskerSelectedRating];
        });
      });
      modal.dataset.starsBound = 'true';
    }

    modal.classList.add('is-open');
    modal.style.display = 'flex';
  }
}

async function submitTaskReview() {
  if (!currentPendingReviewAction) return;
  const { taskId, posterId, posterName } = currentPendingReviewAction;
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  if (!taskerSelectedRating || taskerSelectedRating < 1) {
    if (window.showToast) window.showToast('Please select a star rating (1 to 5 stars).');
    return;
  }

  const comment = document.getElementById('posterReviewComment')?.value.trim() || '';
  const submitBtn = document.getElementById('submitTaskReviewBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
  }

  try {
    // 1. Insert Review (Reviewing the Poster)
    await window.supabaseClient
      .from('Review')
      .insert({
        taskId: taskId,
        reviewerId: profile.id,
        revieweeId: posterId,
        revieweeRole: 'POSTER',
        rating: taskerSelectedRating,
        comment: comment
      });

    // 2. Recalculate Poster's rating in Profile table
    const { data: allReviews } = await window.supabaseClient
      .from('Review')
      .select('rating')
      .eq('revieweeId', posterId)
      .eq('revieweeRole', 'POSTER');

    const count = allReviews ? allReviews.length : 0;
    const avg = count > 0 ? allReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / count : null;
    await window.supabaseClient
      .from('Profile')
      .update({ posterRating: avg, posterReviewsCount: count, averageRating: avg, totalReviews: count })
      .eq('id', posterId);

    const modal = document.getElementById('taskReviewModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.style.display = 'none';
    }

    if (window.showToast) window.showToast('Review submitted successfully!');
    
    // Refresh to show the "Review Submitted" button state
    await fetchMyApplications();

  } catch (err) {
    console.error('submitTaskReview error:', err);
    if (window.showToast) window.showToast('Could not submit review. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit review';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('taska:ready', initMyApplicationsPage);
  if (window.__taskaReady) initMyApplicationsPage();
});
