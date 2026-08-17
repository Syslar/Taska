/* ==========================================================================
   poster-my-tasks.js — Full Task Lifecycle Controller (Poster Module)
   Hiring with Escrow Locking, Payout Release, Review Prompt, and Task Management.
   ========================================================================== */

let myTasksData = [];
let currentFilter = 'ALL';
let currentPendingAction = null; // Stores data for active modals
let posterSelectedRating = 0;

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

  // Bind modal close buttons
  setupModalListeners();

  await fetchMyTasks();
}

async function fetchMyTasks() {
  const profile = await window.ensureTaskaProfile();
  const container = document.getElementById('my-tasks-list');
  if (!profile || !window.supabaseClient || !container) return;

  try {
    const { data: tasks, error } = await window.supabaseClient
      .from('Task')
      .select('*, applications:Application(*, tasker:taskerId(*))')
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
    filtered = myTasksData.filter(t => t.status === 'COMPLETED' || t.status === 'CLOSED');
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
    
    let statusClass = 'status-open';
    let statusLabel = t.status;

    if (t.status === 'COMPLETED' || t.status === 'CLOSED') {
      statusClass = 'status-closed';
      statusLabel = 'Completed';
    } else if (t.status === 'PROOF_SUBMITTED') {
      statusClass = 'status-pending';
      statusLabel = 'Work Submitted — Review Pending';
    } else if (t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED') {
      statusClass = 'status-open';
      statusLabel = 'In Progress (Escrow Secured)';
    }

    const budgetVal = t.budget || (apps.find(a => a.isSelected)?.bidAmount) || 0;
    const budgetStr = budgetVal > 0 ? (window.formatNaira ? window.formatNaira(budgetVal) : `₦${budgetVal.toLocaleString()}`) : (t.budgetMin && t.budgetMax ? `₦${t.budgetMin.toLocaleString()} – ₦${t.budgetMax.toLocaleString()}` : 'Open Bid');
    const createdDate = new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

    const safeTitle = window.escapeHtml(t.title || 'Untitled Task');
    const safeDesc = window.escapeHtml(t.description || '');
    const safeCategory = window.escapeHtml(t.category || 'General');

    // Find hired tasker if any
    const hiredApp = apps.find(a => a.isSelected || t.assignedTo === a.taskerId);
    const hiredTasker = hiredApp?.tasker;
    const hiredTaskerName = hiredTasker ? `${hiredTasker.firstName || ''} ${hiredTasker.lastName || ''}`.trim() || hiredTasker.username : 'Hired Tasker';

    // Build Applicants Section
    let applicantsHTML = '';
    if (t.status === 'OPEN') {
      if (apps.length === 0) {
        applicantsHTML = `
          <div style="padding:20px; text-align:center; color:var(--muted); font-size:0.86rem; background:var(--paper); border-radius:var(--radius-sm); margin-top:14px;">
            No Taskers have applied for this task yet. It is currently visible to Taskers across Nigeria.
          </div>
        `;
      } else {
        applicantsHTML = apps.map(app => {
          const tasker = app.tasker || {};
          const rawName = `${tasker.firstName || ''} ${tasker.lastName || ''}`.trim() || tasker.username || 'Tasker';
          const tName = window.escapeHtml(rawName);
          const tUsername = window.escapeHtml(tasker.username ? `@${tasker.username}` : '@user');
          const tInit = `${(tasker.firstName || 'T')[0] || 'T'}${(tasker.lastName || '')[0] || ''}`.toUpperCase();
          const tRating = tasker.averageRating != null && tasker.averageRating > 0 ? tasker.averageRating.toFixed(1) : '0';
          const avHTML = tasker.avatarUrl ? `<img src="${tasker.avatarUrl}" alt="${tName}">` : tInit;
          const safeAppMsg = app.message ? window.escapeHtml(app.message) : '';
          const appBid = app.bidAmount || t.budget || 0;
          const appBidStr = window.formatNaira ? window.formatNaira(appBid) : `₦${appBid.toLocaleString()}`;

          return `
            <div class="applicant-card">
              <div class="applicant-info" onclick="window.location.href='../../Tasker/Profile/index.html?id=${tasker.id}'">
                <div class="applicant-avatar">${avHTML}</div>
                <div>
                  <div style="font-weight:700; font-size:0.95rem; color:var(--green-900); display:flex; align-items:center; gap:6px;">
                    ${tName} ${tasker.isVerified ? `<span style="color:var(--green-700); font-size:0.8rem; display:inline-flex; align-items:center; gap:3px;">${checkIcon} Verified</span>` : ''}
                  </div>
                  <div class="mono" style="font-size:0.78rem; color:var(--muted); display:flex; align-items:center; gap:4px;">
                    ${tUsername} · ${starIcon} ${tRating} (${tasker.reviewCount || 0} reviews)
                  </div>
                  <div style="font-size:0.84rem; color:var(--ink-soft); margin-top:4px;">
                    Bid: <strong style="color:var(--green-800);">${appBidStr}</strong> ${safeAppMsg ? `· "${safeAppMsg}"` : ''}
                  </div>
                </div>
              </div>
              <div class="applicant-actions">
                <button class="btn btn-primary btn-sm btn-accept-tasker" 
                  data-task-id="${t.id}" 
                  data-app-id="${app.id}" 
                  data-tasker-id="${tasker.id}" 
                  data-tasker-name="${tName}"
                  data-budget="${appBid}">Accept & Lock Escrow</button>
                <button class="btn btn-secondary btn-sm" onclick="window.location.href='../../Chats/index.html?user=${tasker.id}'">Message</button>
                <a href="../../Tasker/Profile/index.html?id=${tasker.id}" class="btn btn-ghost btn-sm">View Profile</a>
              </div>
            </div>
          `;
        }).join('');
      }
    } else {
      // Task is assigned, proof submitted, or completed
      if (hiredTasker) {
        const rawHiredName = `${hiredTasker.firstName || ''} ${hiredTasker.lastName || ''}`.trim() || hiredTasker.username || 'Tasker';
        const safeHiredName = window.escapeHtml(rawHiredName);
        const tInit = `${(hiredTasker.firstName || 'T')[0] || 'T'}${(hiredTasker.lastName || '')[0] || ''}`.toUpperCase();
        const avHTML = hiredTasker.avatarUrl ? `<img src="${hiredTasker.avatarUrl}" alt="${safeHiredName}">` : tInit;

        applicantsHTML = `
          <div class="applicant-card" style="border-left: 3px solid var(--green-700); background:var(--mint-050);">
            <div class="applicant-info" onclick="window.location.href='../../Tasker/Profile/index.html?id=${hiredTasker.id}'">
              <div class="applicant-avatar">${avHTML}</div>
              <div>
                <div style="font-weight:700; font-size:0.95rem; color:var(--green-900); display:flex; align-items:center; gap:6px;">
                  ${safeHiredName} <span class="badge-hired">Hired Tasker ${checkIcon}</span>
                </div>
                <div style="font-size:0.82rem; color:var(--green-800); margin-top:2px;">
                  Secured in Escrow: <strong class="mono">${budgetStr}</strong>
                </div>
              </div>
            </div>
            <div class="applicant-actions">
              ${(t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED' || t.status === 'PROOF_SUBMITTED') ? `
                <button class="btn btn-primary btn-sm btn-release-payment"
                  data-task-id="${t.id}"
                  data-tasker-id="${hiredTasker.id}"
                  data-tasker-name="${safeHiredName}"
                  data-task-title="${safeTitle}"
                  data-budget="${budgetVal}">
                  ${t.status === 'PROOF_SUBMITTED' ? '★ Review & Release Payment' : 'Approve & Release Payment'}
                </button>
              ` : ''}
              <button class="btn btn-secondary btn-sm" onclick="window.location.href='../../Chats/index.html?user=${hiredTasker.id}'">Message Tasker</button>
              <a href="../../Tasker/Profile/index.html?id=${hiredTasker.id}" class="btn btn-ghost btn-sm">Profile</a>
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="task-manage-card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
              <span class="status ${statusClass}">${statusLabel}</span>
              <span style="font-size:0.8rem; color:var(--muted);">${safeCategory} · Posted ${createdDate}</span>
            </div>
            <h2 style="font-size:1.25rem; color:var(--green-900); margin-bottom:6px;">${safeTitle}</h2>
            <p style="color:var(--ink-soft); font-size:0.92rem; line-height:1.5; max-width:680px; margin-bottom:10px;">${safeDesc}</p>
          </div>
          <div style="text-align:right;">
            <div class="mono" style="font-size:1.35rem; font-weight:700; color:var(--green-700);">${budgetStr}</div>
            <div style="font-size:0.8rem; color:var(--muted); margin-top:2px;">
              ${t.status === 'OPEN' ? `${appCount} ${appCount === 1 ? 'Applicant' : 'Applicants'}` : 'Locked in Escrow'}
            </div>
            
            ${t.status === 'OPEN' ? `
              <button class="btn btn-ghost btn-sm btn-cancel-task" data-task-id="${t.id}" style="color:var(--red); margin-top:10px;">Cancel Task</button>
            ` : ''}
          </div>
        </div>

        <div style="margin-top:16px; border-top:1px dashed var(--line); padding-top:14px;">
          <h4 style="font-size:0.88rem; font-weight:600; color:var(--green-900); margin-bottom:8px;">
            ${t.status === 'OPEN' ? `Interested Taskers (${appCount})` : 'Active Contract'}
          </h4>
          ${applicantsHTML}
        </div>
      </div>
    `;
  }).join('');

  // Bind dynamic actions
  bindTaskActionButtons();
}

function bindTaskActionButtons() {
  const container = document.getElementById('my-tasks-list');
  if (!container) return;

  // 1. Accept & Lock Escrow Buttons
  container.querySelectorAll('.btn-accept-tasker').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.taskId;
      const appId = btn.dataset.appId;
      const taskerId = btn.dataset.taskerId;
      const taskerName = btn.dataset.taskerName;
      const budget = parseFloat(btn.dataset.budget) || 0;
      handleAcceptAndLockEscrow(taskId, appId, taskerId, taskerName, budget);
    });
  });

  // 2. Approve & Release Payment Buttons
  container.querySelectorAll('.btn-release-payment').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.taskId;
      const taskerId = btn.dataset.taskerId;
      const taskerName = btn.dataset.taskerName;
      const taskTitle = btn.dataset.taskTitle;
      const budget = parseFloat(btn.dataset.budget) || 0;
      promptReleasePayment(taskId, taskerId, taskerName, taskTitle, budget);
    });
  });

  // 3. Cancel Task Buttons
  container.querySelectorAll('.btn-cancel-task').forEach(btn => {
    btn.addEventListener('click', () => {
      const taskId = btn.dataset.taskId;
      handleCancelTask(taskId);
    });
  });
}

// ─── STEP 1: ACCEPT TASKER & LOCK ESCROW ─────────────────────────────────────
async function handleAcceptAndLockEscrow(taskId, applicationId, taskerId, taskerName, budget) {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  try {
    // 1. Fetch Poster's Wallet
    let { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .select('*')
      .eq('profileId', profile.id)
      .maybeSingle();

    if (!wallet) {
      const { data: newW } = await window.supabaseClient
        .from('Wallet')
        .insert({ profileId: profile.id, balance: 0, escrowBalance: 0, lifetimeEarned: 0, lifetimeWithdrawn: 0 })
        .select()
        .single();
      wallet = newW;
    }

    const availableBal = wallet?.balance || 0;

    // Check if available balance covers the task budget
    if (availableBal < budget) {
      const modal = document.getElementById('insufficientFundsModal');
      const msgEl = document.getElementById('insufficientFundsMsg');
      const diff = budget - availableBal;
      const budgetStr = window.formatNaira ? window.formatNaira(budget) : `₦${budget.toLocaleString()}`;
      const balStr = window.formatNaira ? window.formatNaira(availableBal) : `₦${availableBal.toLocaleString()}`;
      const diffStr = window.formatNaira ? window.formatNaira(diff) : `₦${diff.toLocaleString()}`;

      if (msgEl) {
        msgEl.innerHTML = `
          To hire <strong>${window.escapeHtml(taskerName)}</strong>, <strong>${budgetStr}</strong> must be secured in Escrow.<br><br>
          Your available balance: <strong style="color:var(--green-700);">${balStr}</strong><br>
          Shortfall: <strong style="color:var(--red);">${diffStr}</strong>
        `;
      }
      if (modal) {
        modal.classList.add('is-open');
        modal.style.display = 'flex';
      }
      return;
    }

    if (!confirm(`Confirm hiring ${taskerName}? ₦${budget.toLocaleString()} will be locked from your available balance into Escrow until you approve the completed task.`)) {
      return;
    }

    // 2. Deduct from available balance & add to escrow
    const newBal = availableBal - budget;
    const newEscrow = (wallet.escrowBalance || 0) + budget;

    await window.supabaseClient
      .from('Wallet')
      .update({ balance: newBal, escrowBalance: newEscrow, updatedAt: new Date().toISOString() })
      .eq('id', wallet.id);

    // 3. Record Escrow Lock Transaction
    await window.supabaseClient
      .from('WalletTransaction')
      .insert({
        walletId: wallet.id,
        type: 'ESCROW_LOCK',
        amount: budget,
        reference: `ESCROW_${Date.now()}`,
        note: `Escrow locked for task hiring`
      });

    // 4. Update Application & Task
    await window.supabaseClient
      .from('Application')
      .update({ isSelected: true })
      .eq('id', applicationId);

    await window.supabaseClient
      .from('Task')
      .update({
        assignedTo: taskerId,
        budget: budget,
        status: 'IN_PROGRESS',
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    if (window.showToast) window.showToast(`Hired ${taskerName}! ₦${budget.toLocaleString()} secured in Taska Escrow.`);
    await fetchMyTasks();

  } catch (err) {
    console.error('handleAcceptAndLockEscrow error:', err);
    if (window.showToast) window.showToast('Could not complete hiring.');
  }
}

// ─── STEP 2: APPROVE WORK & RELEASE PAYMENT ─────────────────────────────────
function promptReleasePayment(taskId, taskerId, taskerName, taskTitle, budget) {
  currentPendingAction = { taskId, taskerId, taskerName, taskTitle, budget };
  const modal = document.getElementById('releasePaymentModal');
  const msgEl = document.getElementById('releasePaymentMsg');
  const budgetStr = window.formatNaira ? window.formatNaira(budget) : `₦${budget.toLocaleString()}`;

  if (msgEl) {
    msgEl.innerHTML = `
      Are you satisfied with the completed work on <strong>${window.escapeHtml(taskTitle)}</strong>?<br><br>
      Confirming will release <strong>${budgetStr}</strong> from Escrow directly into <strong>${window.escapeHtml(taskerName)}</strong>'s wallet.
    `;
  }

  if (modal) {
    modal.classList.add('is-open');
    modal.style.display = 'flex';
  }
}

async function executeReleasePayment() {
  if (!currentPendingAction) return;
  const { taskId, taskerId, taskerName, taskTitle, budget } = currentPendingAction;
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const modal = document.getElementById('releasePaymentModal');
  const confirmBtn = document.getElementById('confirmReleasePaymentBtn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Releasing Payout…';
  }

  try {
    // 1. Deduct from Poster's Escrow
    const { data: posterWallet } = await window.supabaseClient
      .from('Wallet')
      .select('*')
      .eq('profileId', profile.id)
      .single();

    if (posterWallet) {
      const newEscrow = Math.max(0, (posterWallet.escrowBalance || 0) - budget);
      await window.supabaseClient
        .from('Wallet')
        .update({ escrowBalance: newEscrow, updatedAt: new Date().toISOString() })
        .eq('id', posterWallet.id);

      await window.supabaseClient
        .from('WalletTransaction')
        .insert({
          walletId: posterWallet.id,
          type: 'ESCROW_RELEASE',
          amount: budget,
          reference: `RELEASE_${Date.now()}`,
          note: `Released escrow payout for: ${taskTitle}`
        });
    }

    // 2. Credit Tasker's Wallet (90% Net Payout after 10% Taska Service Fee)
    const taskaFee = Math.round(budget * 0.10);
    const netPayout = budget - taskaFee;

    let { data: taskerWallet } = await window.supabaseClient
      .from('Wallet')
      .select('*')
      .eq('profileId', taskerId)
      .maybeSingle();

    if (!taskerWallet) {
      const { data: newTW } = await window.supabaseClient
        .from('Wallet')
        .insert({ profileId: taskerId, balance: 0, escrowBalance: 0, lifetimeEarned: 0, lifetimeWithdrawn: 0 })
        .select()
        .single();
      taskerWallet = newTW;
    }

    if (taskerWallet) {
      const taskerNewBal = (taskerWallet.balance || 0) + netPayout;
      const taskerNewEarned = (taskerWallet.lifetimeEarned || 0) + netPayout;

      await window.supabaseClient
        .from('Wallet')
        .update({
          balance: taskerNewBal,
          lifetimeEarned: taskerNewEarned,
          updatedAt: new Date().toISOString()
        })
        .eq('id', taskerWallet.id);

      await window.supabaseClient
        .from('WalletTransaction')
        .insert({
          walletId: taskerWallet.id,
          type: 'TASK_PAYOUT',
          amount: netPayout,
          reference: `PAYOUT_${Date.now()}`,
          note: `Earnings payout for: ${taskTitle} (₦${budget.toLocaleString()} less 10% Taska fee)`
        });

      // Audit log: 10% platform commission on task payout
      // This stays in Taska's Paystack float (all money originated from Paystack deposits)
      try {
        await window.supabaseClient.from('PlatformRevenue').insert({
          type: 'TASK_COMMISSION',
          amount: taskaFee,
          grossAmount: budget,
          sourceProfileId: profile.id,
          reference: `COMMISSION_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
          note: `10% platform commission on task: ${taskTitle} — retained in Taska Paystack float`,
          createdAt: new Date().toISOString()
        });
      } catch (e) { console.warn('[Treasury] PlatformRevenue audit log failed:', e); }
    }

    // 3. Mark Task as COMPLETED
    await window.supabaseClient
      .from('Task')
      .update({
        status: 'COMPLETED',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      .eq('id', taskId);

    if (modal) {
      modal.classList.remove('is-open');
      modal.style.display = 'none';
    }

    if (window.showToast) {
      window.showToast(`Task completed! ₦${budget.toLocaleString()} released to ${taskerName}.`);
    }

    // 4. Launch Review Modal for Poster to rate Tasker
    openTaskReviewModal(taskId, taskerId, taskerName);

    await fetchMyTasks();

  } catch (err) {
    console.error('executeReleasePayment error:', err);
    if (window.showToast) window.showToast('Failed to release payout.');
  } finally {
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm & Release Payment';
    }
  }
}

// ─── STEP 3: POST-COMPLETION REVIEW MODAL ────────────────────────────────────
function openTaskReviewModal(taskId, taskerId, taskerName) {
  currentPendingAction = { taskId, taskerId, taskerName };
  posterSelectedRating = 0;

  const modal = document.getElementById('taskReviewModal');
  const subText = document.getElementById('taskReviewSubText');
  const commentInput = document.getElementById('posterReviewComment');
  const starLabel = document.getElementById('posterStarLabel');

  if (subText) subText.textContent = `How did ${taskerName} perform on this task?`;
  if (commentInput) commentInput.value = '';
  if (starLabel) starLabel.textContent = 'Select a rating (1 to 5 stars)';

  if (modal) {
    const starBtns = modal.querySelectorAll('#posterStarSelector .star-btn');
    starBtns.forEach(b => {
      b.classList.remove('is-active');
      b.style.color = 'var(--muted)';
    });
    modal.classList.add('is-open');
    modal.style.display = 'flex';
  }
}

async function submitTaskReview() {
  if (!currentPendingAction) return;
  const { taskId, taskerId, taskerName } = currentPendingAction;
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  if (!posterSelectedRating || posterSelectedRating < 1) {
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
    // 1. Insert Review
    await window.supabaseClient
      .from('Review')
      .insert({
        taskId: taskId,
        reviewerId: profile.id,
        revieweeId: taskerId,
        rating: posterSelectedRating,
        comment: comment
      });

    // 2. Recalculate Tasker's rating in Profile table
    const { data: allReviews } = await window.supabaseClient
      .from('Review')
      .select('rating')
      .eq('revieweeId', taskerId);

    if (allReviews && allReviews.length > 0) {
      const count = allReviews.length;
      const avg = allReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / count;
      await window.supabaseClient
        .from('Profile')
        .update({ averageRating: avg, reviewCount: count })
        .eq('id', taskerId);
    }

    const modal = document.getElementById('taskReviewModal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.style.display = 'none';
    }

    if (window.showToast) window.showToast(`Thank you! Review submitted for ${taskerName}.`);

  } catch (err) {
    console.error('submitTaskReview error:', err);
    if (window.showToast) window.showToast('Could not submit review.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
    }
  }
}

// ─── CANCEL TASK ─────────────────────────────────────────────────────────────
async function handleCancelTask(taskId) {
  if (!confirm('Are you sure you want to cancel this task? It will no longer be visible to Taskers.')) return;

  try {
    await window.supabaseClient
      .from('Task')
      .update({ status: 'CANCELLED', updatedAt: new Date().toISOString() })
      .eq('id', taskId);

    if (window.showToast) window.showToast('Task has been cancelled.');
    await fetchMyTasks();
  } catch (err) {
    console.error('handleCancelTask error:', err);
    if (window.showToast) window.showToast('Failed to cancel task.');
  }
}

// ─── MODAL SETUP & STAR BINDINGS ─────────────────────────────────────────────
function setupModalListeners() {
  // Insufficient Funds modal
  const fundsModal = document.getElementById('insufficientFundsModal');
  document.getElementById('closeInsufficientFundsBtn')?.addEventListener('click', () => {
    if (fundsModal) {
      fundsModal.classList.remove('is-open');
      fundsModal.style.display = 'none';
    }
  });

  // Release Payment modal
  const releaseModal = document.getElementById('releasePaymentModal');
  document.getElementById('closeReleasePaymentBtn')?.addEventListener('click', () => {
    if (releaseModal) {
      releaseModal.classList.remove('is-open');
      releaseModal.style.display = 'none';
    }
  });
  document.getElementById('cancelReleasePaymentBtn')?.addEventListener('click', () => {
    if (releaseModal) {
      releaseModal.classList.remove('is-open');
      releaseModal.style.display = 'none';
    }
  });
  document.getElementById('confirmReleasePaymentBtn')?.addEventListener('click', executeReleasePayment);

  // Review modal
  const reviewModal = document.getElementById('taskReviewModal');
  document.getElementById('closeTaskReviewModalBtn')?.addEventListener('click', () => {
    if (reviewModal) {
      reviewModal.classList.remove('is-open');
      reviewModal.style.display = 'none';
    }
  });
  document.getElementById('skipTaskReviewBtn')?.addEventListener('click', () => {
    if (reviewModal) {
      reviewModal.classList.remove('is-open');
      reviewModal.style.display = 'none';
    }
  });
  document.getElementById('submitTaskReviewBtn')?.addEventListener('click', submitTaskReview);

  // Star selector in Poster review modal
  const starBtns = document.querySelectorAll('#posterStarSelector .star-btn');
  const starLabel = document.getElementById('posterStarLabel');
  const labelMap = { 1: '1 Star — Terrible', 2: '2 Stars — Poor', 3: '3 Stars — Average', 4: '4 Stars — Very Good', 5: '5 Stars — Excellent' };

  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      posterSelectedRating = parseInt(btn.dataset.value, 10);
      starBtns.forEach(b => {
        const val = parseInt(b.dataset.value, 10);
        if (val <= posterSelectedRating) {
          b.classList.add('is-active');
          b.style.color = '#F4A819';
        } else {
          b.classList.remove('is-active');
          b.style.color = 'var(--muted)';
        }
      });
      if (starLabel) starLabel.textContent = labelMap[posterSelectedRating];
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('taska:ready', initMyTasksPage);
  if (window.__taskaReady) initMyTasksPage();
});
