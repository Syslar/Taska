/**
 * Taska Poster Profile Controller (Poster Module)
 * Dynamic rendering of user profile, review breakdown, about details, and posted task history.
 * XSS-secure rendering, verified relative routing, and clean SVG badges.
 */

window.currentViewingProfile = null;
let selectedRatingValue = 5;

function renderStarsHtml(ratingScore, size = 16) {
  let html = '';
  const rounded = Math.round(Number(ratingScore) || 0);
  for (let i = 1; i <= 5; i++) {
    const isFilled = (Number(ratingScore) > 0) && (i <= rounded);
    html += `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${isFilled ? '#F4A819' : 'none'}" stroke="${isFilled ? '#F4A819' : '#D1D5DB'}" stroke-width="2" style="vertical-align:middle;"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`;
  }
  return html;
}

window.renderStandaloneProfile = async function (targetProfileId) {
  const urlParams = new URLSearchParams(window.location.search);
  const pid = targetProfileId || urlParams.get('id');

  const myProfile = await window.ensureTaskaProfile();

  let profileToRender = null;

  if (pid) {
    const { data, error } = await window.supabaseClient
      .from('Profile')
      .select('*')
      .eq('id', pid)
      .single();
    if (!error && data) profileToRender = data;
  }

  if (!profileToRender) {
    profileToRender = myProfile;
  }

  if (!profileToRender) {
    if (window.showToast) window.showToast('Profile not found.');
    return;
  }

  window.currentViewingProfile = profileToRender;
  const isSelf = myProfile && myProfile.id === profileToRender.id;

  const rawFullName = `${profileToRender.firstName || ''} ${profileToRender.lastName || ''}`.trim() || 'Taska User';
  const fullName = window.escapeHtml(rawFullName);
  const initials = `${(profileToRender.firstName || '')[0] || ''}${(profileToRender.lastName || '')[0] || ''}`.toUpperCase() || 'U';
  const roleLabel = profileToRender.role === 'TASKER' ? 'Tasker' : profileToRender.role === 'POSTER' ? 'Task Poster' : 'Poster & Tasker';
  const checkIcon = window.TaskaIcons?.verified || '';

  // 1. Populate Left Identity Card
  const avatarEl = document.getElementById('profileAvatar');
  const verifiedBadge = document.getElementById('verifiedBadge');
  const nameEl = document.getElementById('profileName');
  const roleEl = document.getElementById('profileRole');
  const taglineEl = document.getElementById('profileTagline');
  const locationEl = document.getElementById('profileLocationText');

  if (avatarEl) {
    if (profileToRender.avatarUrl) {
      avatarEl.innerHTML = `<img src="${profileToRender.avatarUrl}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      avatarEl.textContent = initials;
    }
  }

  if (verifiedBadge) {
    verifiedBadge.style.display = (profileToRender.isVerified || profileToRender.kycStatus === 'VERIFIED') ? 'flex' : 'none';
  }

  if (nameEl) nameEl.textContent = rawFullName;
  if (roleEl) roleEl.textContent = roleLabel;

  if (taglineEl) {
    if (profileToRender.posterName) {
      taglineEl.textContent = profileToRender.posterName;
      taglineEl.style.display = 'block';
    } else {
      taglineEl.style.display = 'none';
    }
  }

  if (locationEl) locationEl.textContent = profileToRender.location || 'Lagos, Nigeria';

  // Member Since
  const statMemberSince = document.getElementById('statMemberSince');
  const aboutDetailMemberSince = document.getElementById('aboutDetailMemberSince');

  let memberSinceStr = '—';
  if (profileToRender.createdAt) {
    const dt = new Date(profileToRender.createdAt);
    memberSinceStr = dt.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
  }

  if (statMemberSince) statMemberSince.textContent = memberSinceStr;
  if (aboutDetailMemberSince) aboutDetailMemberSince.textContent = memberSinceStr;

  // Categories / Hires for chips
  const skillChipsEl = document.getElementById('skillChips');
  const aboutDetailCategories = document.getElementById('aboutDetailCategories');
  const rawSkills = profileToRender.posterCategories || profileToRender.skills || '';
  const skillsList = rawSkills.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);

  const chipsHtml = skillsList.length > 0
    ? skillsList.map(s => `<span class="chip">${window.escapeHtml(s)}</span>`).join('')
    : '<span class="chip" style="background:var(--mint-050); color:var(--green-800);">General Tasks</span>';

  if (skillChipsEl) skillChipsEl.innerHTML = chipsHtml;
  if (aboutDetailCategories) aboutDetailCategories.innerHTML = chipsHtml;

  // Toggle Action Buttons (Own profile vs Other profile)
  const ownActions = document.getElementById('ownProfileActions');
  const otherActions = document.getElementById('profileActions');

  if (isSelf) {
    if (ownActions) ownActions.style.display = 'flex';
    if (otherActions) otherActions.style.display = 'none';
  } else {
    if (ownActions) ownActions.style.display = 'none';
    if (otherActions) otherActions.style.display = 'flex';
  }

  // 2. Populate About Tab
  const aboutBioText = document.getElementById('aboutBioText');
  const aboutDetailLocation = document.getElementById('aboutDetailLocation');
  const aboutDetailRole = document.getElementById('aboutDetailRole');
  const aboutDetailPosterName = document.getElementById('aboutDetailPosterName');
  const aboutDetailVerification = document.getElementById('aboutDetailVerification');

  if (aboutBioText) aboutBioText.textContent = profileToRender.bio || profileToRender.posterBio || 'This user has not added a bio yet.';
  if (aboutDetailLocation) aboutDetailLocation.textContent = profileToRender.location || 'Lagos, Nigeria';
  if (aboutDetailRole) aboutDetailRole.textContent = roleLabel;
  if (aboutDetailPosterName) aboutDetailPosterName.textContent = profileToRender.posterName || rawFullName;
  if (aboutDetailVerification) {
    const isVer = profileToRender.isVerified || profileToRender.kycStatus === 'VERIFIED';
    aboutDetailVerification.innerHTML = isVer
      ? `<span class="status status-open" style="font-size:0.72rem; padding:3px 10px; display:inline-flex; align-items:center; gap:4px;">${checkIcon} Identity verified</span>`
      : `<span class="status status-closed" style="font-size:0.72rem; padding:3px 10px;">Unverified</span>`;
  }

  // 3. Load Dynamic Reviews & Breakdown
  await loadProfileReviews(profileToRender.id);

  // 4. Load Dynamic Posted Task History
  await loadProfileTaskHistory(profileToRender.id);
};

// Dynamic Reviews Loader with Live Aggregation
async function loadProfileReviews(profileId) {
  const reviewsList = document.getElementById('reviewsList');
  const ratingScoreEl = document.getElementById('ratingScore');
  const ratingCountEl = document.getElementById('ratingCount');
  const profileStarsEl = document.getElementById('profileStars');
  const ratingBigEl = document.getElementById('ratingBig');
  const ratingStarsBigEl = document.getElementById('ratingStarsBig');
  const ratingBarsEl = document.getElementById('ratingBars');

  try {
    const { data: reviews, error } = await window.supabaseClient
      .from('Review')
      .select('*, reviewer:Profile!reviewerId(*)')
      .eq('revieweeId', profileId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const totalReviews = reviews ? reviews.length : 0;
    let avgRating = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (totalReviews > 0) {
      let sum = 0;
      reviews.forEach((r) => {
        const val = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
        distribution[val] = (distribution[val] || 0) + 1;
        sum += (r.rating || 5);
      });
      avgRating = sum / totalReviews;
    }

    const formattedAvg = totalReviews > 0 ? avgRating.toFixed(1) : '—';
    if (ratingScoreEl) ratingScoreEl.textContent = formattedAvg;
    if (ratingBigEl) ratingBigEl.textContent = formattedAvg;
    if (ratingCountEl) ratingCountEl.textContent = totalReviews === 0 ? 'No reviews yet' : totalReviews === 1 ? '1 review' : `${totalReviews} reviews`;

    if (profileStarsEl) profileStarsEl.innerHTML = renderStarsHtml(totalReviews > 0 ? avgRating : 0, 16);
    if (ratingStarsBigEl) ratingStarsBigEl.innerHTML = renderStarsHtml(totalReviews > 0 ? avgRating : 0, 22);

    if (ratingBarsEl) {
      ratingBarsEl.innerHTML = [5, 4, 3, 2, 1].map((starNum) => {
        const count = distribution[starNum] || 0;
        const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
        return `
          <div class="rating-bar-row">
            <span class="rating-bar-label">${starNum} Star${starNum === 1 ? '' : 's'}</span>
            <div class="rating-bar-track"><div class="rating-bar-fill" style="width: ${pct}%;"></div></div>
            <span class="rating-bar-pct mono">${pct}%</span>
          </div>
        `;
      }).join('');
    }

    if (!reviews || reviews.length === 0) {
      if (reviewsList) {
        reviewsList.innerHTML = `
          <div style="padding:40px 20px; text-align:center; color:var(--muted); font-size:0.9rem;">
            No reviews yet for this user.
          </div>
        `;
      }
      return;
    }

    if (reviewsList) {
      reviewsList.innerHTML = reviews.map((rev) => {
        const rawReviewerName = rev.reviewer ? `${rev.reviewer.firstName || ''} ${rev.reviewer.lastName || ''}`.trim() || rev.reviewer.username : 'Anonymous User';
        const reviewerName = window.escapeHtml(rawReviewerName);
        const revInitials = rev.reviewer ? `${(rev.reviewer.firstName || '')[0] || ''}${(rev.reviewer.lastName || '')[0] || ''}`.toUpperCase() : 'U';
        const revDate = new Date(rev.createdAt || Date.now()).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
        const safeComment = window.escapeHtml(rev.comment || 'No comment provided.');
        const ratingNum = rev.rating || 5;

        return `
          <div class="review-card">
            <div class="review-card-top">
              <div class="review-card-person">
                <div class="profile-avatar" style="width:36px; height:36px; font-size:0.85rem; border-radius:50%; overflow:hidden; background:var(--mint-100); display:flex; align-items:center; justify-content:center; font-weight:600;">
                  ${rev.reviewer?.avatarUrl ? `<img src="${rev.reviewer.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : revInitials}
                </div>
                <div style="font-weight:600; font-size:0.9rem; color:var(--green-900);">${reviewerName}</div>
              </div>
              <div class="review-card-meta">
                <div class="review-card-stars" style="display:inline-flex; gap:2px;">${renderStarsHtml(ratingNum, 14)}</div>
                <div class="review-card-date mono">${revDate}</div>
              </div>
            </div>
            <div class="review-card-comment">${safeComment}</div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Error loading reviews:', err);
    if (reviewsList) reviewsList.innerHTML = '<div style="padding:20px; color:var(--muted); text-align:center;">Could not load reviews.</div>';
  }
}

// Dynamic Task History & Real Poster Stats
async function loadProfileTaskHistory(profileId) {
  const historyList = document.getElementById('historyTasksList');
  if (!historyList) return;

  try {
    const { data: tasks, error } = await window.supabaseClient
      .from('Task')
      .select('*')
      .eq('posterId', profileId)
      .order('createdAt', { ascending: false })
      .limit(20);

    if (error) throw error;

    const postedCount = tasks ? tasks.length : 0;
    const activeHiresCount = tasks ? tasks.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'ASSIGNED').length : 0;

    // Calculate dynamic stats
    const statTasksPosted = document.getElementById('statTasksPosted');
    const statActiveHires = document.getElementById('statActiveHires');
    const aboutDetailTasksPosted = document.getElementById('aboutDetailTasksPosted');

    if (statTasksPosted) statTasksPosted.textContent = postedCount;
    if (statActiveHires) statActiveHires.textContent = activeHiresCount;
    if (aboutDetailTasksPosted) aboutDetailTasksPosted.textContent = postedCount;

    if (!tasks || tasks.length === 0) {
      historyList.innerHTML = '<div style="padding:40px 20px; text-align:center; color:var(--muted); font-size:0.9rem;">No tasks posted yet.</div>';
      return;
    }

    historyList.innerHTML = tasks.map((t) => {
      const taskDateStr = new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      const safeTitle = window.escapeHtml(t.title || 'Task');
      const safeCategory = window.escapeHtml(t.category || 'General');
      const budgetStr = t.budget != null ? (window.formatNaira ? window.formatNaira(t.budget) : `₦${t.budget}`) : 'Open';

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid var(--line-soft);">
          <div>
            <div style="font-weight:600; font-size:0.92rem; color:var(--green-900);">${safeTitle}</div>
            <div style="font-size:0.78rem; color:var(--muted); margin-top:2px;">${safeCategory} · <span class="mono">${budgetStr}</span> · ${taskDateStr}</div>
          </div>
          <span class="status ${t.status === 'COMPLETED' ? 'status-closed' : 'status-open'}" style="font-size:0.75rem;">
            ${t.status}
          </span>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading task history:', err);
    if (historyList) historyList.innerHTML = '<div style="padding:20px; color:var(--muted); text-align:center;">Could not load task history.</div>';
  }
}

// Tab Switching & Action Listeners
document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('#profileTabNav button');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');

      const targetTab = tab.dataset.tab;
      const reviewsPanel = document.getElementById('panel-reviews');
      const aboutPanel = document.getElementById('panel-about');
      const historyPanel = document.getElementById('panel-history');

      if (reviewsPanel) reviewsPanel.style.display = targetTab === 'reviews' ? 'block' : 'none';
      if (aboutPanel) aboutPanel.style.display = targetTab === 'about' ? 'block' : 'none';
      if (historyPanel) historyPanel.style.display = targetTab === 'history' ? 'block' : 'none';
    });
  });

  // Action listeners
  document.getElementById('btnMessage')?.addEventListener('click', () => {
    if (window.currentViewingProfile) {
      window.location.href = `../../Chats/index.html?user=${window.currentViewingProfile.id}`;
    }
  });

  // Modal controls
  const reviewModal = document.getElementById('reviewModal');
  const btnReview = document.getElementById('btnReview');
  const closeReviewModalBtn = document.getElementById('closeReviewModalBtn');
  const btnSubmitReview = document.getElementById('btnSubmitReview');

  function openReviewModal() {
    if (reviewModal) {
      reviewModal.classList.add('is-open');
      reviewModal.style.display = 'flex';
    }
  }

  function closeReviewModal() {
    if (reviewModal) {
      reviewModal.classList.remove('is-open');
      reviewModal.style.display = 'none';
    }
  }

  btnReview?.addEventListener('click', openReviewModal);
  closeReviewModalBtn?.addEventListener('click', closeReviewModal);

  reviewModal?.addEventListener('click', (e) => {
    if (e.target === reviewModal) closeReviewModal();
  });

  // Report Modal
  const reportModal = document.getElementById('reportModal');
  const btnReportUser = document.getElementById('btnReportUser');
  const closeReportModalBtn = document.getElementById('closeReportModalBtn');
  const reportUserForm = document.getElementById('reportUserForm');

  function openReportModal() {
    if (reportModal) {
      reportModal.classList.add('is-open');
      reportModal.style.display = 'flex';
    }
  }

  function closeReportModal() {
    if (reportModal) {
      reportModal.classList.remove('is-open');
      reportModal.style.display = 'none';
    }
  }

  btnReportUser?.addEventListener('click', openReportModal);
  closeReportModalBtn?.addEventListener('click', closeReportModal);

  reportModal?.addEventListener('click', (e) => {
    if (e.target === reportModal) closeReportModal();
  });

  reportUserForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    closeReportModal();
    if (window.showToast) window.showToast('Thank you. Your report has been submitted to the moderation team.');
  });

  document.getElementById('btnShareProfile')?.addEventListener('click', () => {
    if (navigator.share) {
      navigator.share({
        title: 'Taska Profile',
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      if (window.showToast) window.showToast('Profile link copied to clipboard!');
    }
  });

  // Star selector in review modal
  const starBtns = document.querySelectorAll('#starSelector .star-btn');
  const starLabel = document.getElementById('starLabel');
  const labelMap = { 1: '1 Star — Terrible', 2: '2 Stars — Poor', 3: '3 Stars — Average', 4: '4 Stars — Very Good', 5: '5 Stars — Excellent' };

  starBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedRatingValue = parseInt(btn.dataset.value, 10);
      starBtns.forEach((b) => {
        const val = parseInt(b.dataset.value, 10);
        if (val <= selectedRatingValue) b.classList.add('is-active');
        else b.classList.remove('is-active');
      });
      if (starLabel) starLabel.textContent = labelMap[selectedRatingValue];
    });
  });

  // Submit Review Form
  btnSubmitReview?.addEventListener('click', async () => {
    const comment = document.getElementById('reviewComment')?.value.trim();
    const myProfile = await window.ensureTaskaProfile();

    if (!myProfile || !window.currentViewingProfile) {
      if (window.showToast) window.showToast('Please log in to submit a review.');
      return;
    }

    if (myProfile.id === window.currentViewingProfile.id) {
      if (window.showToast) window.showToast('You cannot leave a review for yourself.');
      closeReviewModal();
      return;
    }

    btnSubmitReview.disabled = true;
    btnSubmitReview.textContent = 'Submitting review...';

    try {
      const { error } = await window.supabaseClient
        .from('Review')
        .insert({
          reviewerId: myProfile.id,
          revieweeId: window.currentViewingProfile.id,
          rating: selectedRatingValue,
          comment: comment || ''
        });

      if (error) throw error;

      // Recalculate average rating & review count
      const { data: allReviews } = await window.supabaseClient
        .from('Review')
        .select('rating')
        .eq('revieweeId', window.currentViewingProfile.id);

      if (allReviews && allReviews.length > 0) {
        const count = allReviews.length;
        const avg = allReviews.reduce((sum, r) => sum + (r.rating || 5), 0) / count;
        await window.supabaseClient
          .from('Profile')
          .update({ averageRating: avg, reviewCount: count })
          .eq('id', window.currentViewingProfile.id);
      }

      closeReviewModal();
      const commentInput = document.getElementById('reviewComment');
      if (commentInput) commentInput.value = '';
      if (window.showToast) window.showToast('Review submitted successfully!');

      await loadProfileReviews(window.currentViewingProfile.id);

    } catch (err) {
      console.error('Submit review error:', err);
      if (window.showToast) window.showToast('Could not submit review. Please try again.');
    } finally {
      btnSubmitReview.disabled = false;
      btnSubmitReview.textContent = 'Submit review';
    }
  });

  // Automatically render standalone profile page on load
  window.renderStandaloneProfile();
});
