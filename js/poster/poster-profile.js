/**
 * Taska Poster Profile Controller (Poster Module)
 * Dynamic rendering of user profile, review breakdown, about details, and task history.
 * XSS-secure rendering, verified relative routing, and clean SVG badges.
 */

window.currentViewingProfile = null;
let selectedRatingValue = 5;

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
  const starIcon = window.TaskaIcons?.star || '';

  // 1. Populate Left Identity Card
  const avatarEl = document.getElementById('profileAvatar');
  const verifiedBadge = document.getElementById('verifiedBadge');
  const nameEl = document.getElementById('profileName');
  const roleEl = document.getElementById('profileRole');
  const locationEl = document.getElementById('profileLocationText');

  if (avatarEl) {
    if (profileToRender.avatarUrl) {
      avatarEl.innerHTML = `<img src="${profileToRender.avatarUrl}" alt="Avatar">`;
    } else {
      avatarEl.textContent = initials;
    }
  }

  if (verifiedBadge) {
    verifiedBadge.style.display = (profileToRender.isVerified || profileToRender.kycStatus === 'VERIFIED') ? 'flex' : 'none';
  }

  if (nameEl) nameEl.textContent = rawFullName;
  if (roleEl) roleEl.textContent = roleLabel;
  if (locationEl) locationEl.textContent = profileToRender.location || 'Lagos, Nigeria';

  // Stats
  const ratingScoreEl = document.getElementById('ratingScore');
  const ratingCountEl = document.getElementById('ratingCount');
  const ratingBigEl = document.getElementById('ratingBig');

  const rating = profileToRender.averageRating != null ? profileToRender.averageRating.toFixed(1) : '5.0';
  const reviewCount = profileToRender.reviewCount || 0;

  if (ratingScoreEl) ratingScoreEl.textContent = rating;
  if (ratingBigEl) ratingBigEl.textContent = rating;
  if (ratingCountEl) ratingCountEl.textContent = `${reviewCount} review${reviewCount === 1 ? '' : 's'}`;

  // Member Since
  const statMemberSince = document.getElementById('statMemberSince');
  const aboutDetailMemberSince = document.getElementById('aboutDetailMemberSince');

  let memberSinceStr = 'Aug 2026';
  if (profileToRender.createdAt) {
    const dt = new Date(profileToRender.createdAt);
    memberSinceStr = dt.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' });
  }

  if (statMemberSince) statMemberSince.textContent = memberSinceStr;
  if (aboutDetailMemberSince) aboutDetailMemberSince.textContent = memberSinceStr;

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
  const aboutDetailVerification = document.getElementById('aboutDetailVerification');

  if (aboutBioText) aboutBioText.textContent = profileToRender.bio || 'This user has not added a bio yet.';
  if (aboutDetailLocation) aboutDetailLocation.textContent = profileToRender.location || 'Lagos, Nigeria';
  if (aboutDetailRole) aboutDetailRole.textContent = roleLabel;
  if (aboutDetailVerification) {
    const isVer = profileToRender.isVerified || profileToRender.kycStatus === 'VERIFIED';
    aboutDetailVerification.innerHTML = isVer
      ? `<span class="status status-open" style="font-size:0.72rem; padding:3px 10px; display:inline-flex; align-items:center; gap:4px;">${checkIcon} Identity verified</span>`
      : `<span class="status status-closed" style="font-size:0.72rem; padding:3px 10px;">Unverified</span>`;
  }

  // 3. Load Reviews
  await loadProfileReviews(profileToRender.id);

  // 4. Load Task History
  await loadProfileTaskHistory(profileToRender.id);
};

// Reviews Loader
async function loadProfileReviews(profileId) {
  const reviewsList = document.getElementById('reviewsList');
  if (!reviewsList) return;

  try {
    const { data: reviews, error } = await window.supabaseClient
      .from('Review')
      .select('*, reviewer:Profile!reviewerId(*)')
      .eq('revieweeId', profileId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    if (!reviews || reviews.length === 0) {
      reviewsList.innerHTML = `
        <div style="padding:30px 20px; text-align:center; color:var(--muted); font-size:0.9rem;">
          No reviews yet for this user.
        </div>
      `;
      return;
    }

    reviewsList.innerHTML = reviews.map((rev) => {
      const rawReviewerName = rev.reviewer ? `${rev.reviewer.firstName || ''} ${rev.reviewer.lastName || ''}`.trim() || rev.reviewer.username : 'Anonymous User';
      const reviewerName = window.escapeHtml(rawReviewerName);
      const revInitials = rev.reviewer ? `${(rev.reviewer.firstName || '')[0] || ''}${(rev.reviewer.lastName || '')[0] || ''}`.toUpperCase() : 'U';
      const revDate = new Date(rev.createdAt || Date.now()).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      const safeComment = window.escapeHtml(rev.comment || 'No comment provided.');
      const ratingNum = rev.rating || 5;

      let starsHtml = '';
      for (let i = 0; i < 5; i++) {
        const isFilled = i < ratingNum;
        starsHtml += `<svg width="14" height="14" viewBox="0 0 24 24" fill="${isFilled ? '#F4A819' : 'none'}" stroke="${isFilled ? '#F4A819' : '#D1D5DB'}" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`;
      }

      return `
        <div class="review-card">
          <div class="review-card-top">
            <div class="review-card-person">
              <div class="profile-avatar" style="width:36px; height:36px; font-size:0.85rem;">${revInitials}</div>
              <div style="font-weight:600; font-size:0.9rem;">${reviewerName}</div>
            </div>
            <div class="review-card-meta">
              <div class="review-card-stars" style="display:inline-flex; gap:2px;">${starsHtml}</div>
              <div class="review-card-date">${revDate}</div>
            </div>
          </div>
          <div class="review-card-comment">${safeComment}</div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Error loading reviews:', err);
    reviewsList.innerHTML = '<div style="padding:20px; color:var(--muted); text-align:center;">Could not load reviews.</div>';
  }
}

// Task History Loader
async function loadProfileTaskHistory(profileId) {
  const historyList = document.getElementById('historyTasksList');
  if (!historyList) return;

  try {
    const { data: tasks, error } = await window.supabaseClient
      .from('Task')
      .select('*')
      .or(`posterId.eq.${profileId},assignedTo.eq.${profileId}`)
      .order('createdAt', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!tasks || tasks.length === 0) {
      historyList.innerHTML = '<div style="padding:30px 20px; text-align:center; color:var(--muted);">No completed tasks yet.</div>';
      return;
    }

    const statTasksDone = document.getElementById('statTasksDone');
    const aboutDetailTasks = document.getElementById('aboutDetailTasks');
    if (statTasksDone) statTasksDone.textContent = tasks.length;
    if (aboutDetailTasks) aboutDetailTasks.textContent = tasks.length;

    historyList.innerHTML = tasks.map((t) => {
      const taskDateStr = new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      const safeTitle = window.escapeHtml(t.title || 'Task');
      const safeCategory = window.escapeHtml(t.category || 'General');

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; border-bottom:1px solid var(--line-soft);">
          <div>
            <div style="font-weight:600; font-size:0.92rem; color:var(--green-900);">${safeTitle}</div>
            <div style="font-size:0.78rem; color:var(--muted); margin-top:2px;">${safeCategory} · ${taskDateStr}</div>
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
      document.getElementById('panel-reviews').style.display = targetTab === 'reviews' ? 'block' : 'none';
      document.getElementById('panel-about').style.display = targetTab === 'about' ? 'block' : 'none';
      document.getElementById('panel-history').style.display = targetTab === 'history' ? 'block' : 'none';
    });
  });

  // Action listeners
  document.getElementById('btnMessage')?.addEventListener('click', () => {
    if (window.currentViewingProfile) {
      window.location.href = `../../Chats/index.html?user=${window.currentViewingProfile.id}`;
    }
  });

  document.getElementById('btnReview')?.addEventListener('click', () => {
    const modal = document.getElementById('reviewModal');
    if (modal) modal.style.display = 'flex';
  });

  document.getElementById('closeReviewModalBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('reviewModal');
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('btnReportUser')?.addEventListener('click', () => {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'flex';
  });

  document.getElementById('closeReportModalBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('reportModal');
    if (modal) modal.style.display = 'none';
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
  document.getElementById('btnSubmitReview')?.addEventListener('click', async () => {
    const comment = document.getElementById('reviewComment')?.value.trim();
    const myProfile = await window.ensureTaskaProfile();

    if (!myProfile || !window.currentViewingProfile) return;

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

      document.getElementById('reviewModal').style.display = 'none';
      if (window.showToast) window.showToast('Review submitted successfully!');
      loadProfileReviews(window.currentViewingProfile.id);

    } catch (err) {
      console.error('Submit review error:', err);
      if (window.showToast) window.showToast('Could not submit review.');
    }
  });

  // Automatically render standalone profile page on load
  window.renderStandaloneProfile();
});
