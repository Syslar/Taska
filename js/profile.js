// js/profile.js

window.renderProfileTab = async function() {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || 'U';
  
  const bigAv = document.getElementById('profile-big-avatar');
  const fName = document.getElementById('profile-full-name');
  const roleBadge = document.getElementById('profile-role-badge');
  const pEmail = document.getElementById('profile-email-val');
  const pPhone = document.getElementById('profile-phone-val');
  const pUser = document.getElementById('profile-username-val');
  const pVer = document.getElementById('profile-verified-val');
  const pLoc = document.getElementById('profile-location-val');

  if (bigAv) {
    if (profile.avatarUrl) {
      bigAv.outerHTML = `<img src="${profile.avatarUrl}" id="profile-big-avatar" style="width:72px; height:72px; border-radius:50%; object-fit:cover; border:2px solid var(--green-700); margin:0 auto 12px auto; display:block;">`;
    } else {
      bigAv.outerHTML = `<div class="profile-big-avatar" id="profile-big-avatar" style="width:72px; height:72px; font-size:2rem; background:var(--green-100); color:var(--green-800); display:flex; align-items:center; justify-content:center; border-radius:50%; margin:0 auto 12px auto; font-weight:700;">${initials}</div>`;
    }
  }
  if (fName) fName.textContent = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile';
  if (roleBadge) roleBadge.textContent = profile.role === 'TASKER' ? 'Tasker (Earn money)' : 'Task Poster (Hire people)';

  if (pEmail) pEmail.textContent = profile.email || 'Not set';
  if (pPhone) pPhone.textContent = profile.phone || 'Not set';
  if (pUser) pUser.textContent = profile.username ? `@${profile.username}` : 'Not set';
  if (pVer) pVer.textContent = profile.isVerified ? '✓ Identity Verified' : 'Unverified';
  if (pLoc) pLoc.textContent = profile.location || 'Not specified';
};

window.currentViewingProfileId = null;

// Renders the standalone profile page in App/Profile/index.html
window.renderStandaloneProfile = async function(targetProfileId) {
  if (!targetProfileId) {
    document.getElementById('profile-card-container').innerHTML = '<div style="padding:40px; color:var(--red); text-align:center;">User not found.</div>';
    return;
  }

  const { data: profile } = await window.supabaseClient.from('Profile').select('*').eq('id', targetProfileId).single();
  
  if (!profile) {
    document.getElementById('profile-card-container').innerHTML = '<div style="padding:40px; color:var(--red); text-align:center;">User not found.</div>';
    return;
  }

  window.currentViewingProfileId = profile.id;
  const myProfile = window.getTaskaProfile();
  const isSelf = myProfile && myProfile.id === profile.id;

  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || 'U';
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User';
  const username = `@${profile.username || 'user'}`;
  const roleLabel = profile.role === 'TASKER' ? 'Tasker' : profile.role === 'POSTER' ? 'Task Poster' : 'Poster & Tasker';
  const rating = profile.averageRating != null ? profile.averageRating.toFixed(1) : '5.0';

  let avatarHTML = '';
  if (profile.avatarUrl) {
    avatarHTML = `<img src="${profile.avatarUrl}" alt="${fullName}">`;
  } else {
    avatarHTML = `<div class="profile-avatar-placeholder">${initials}</div>`;
  }

  const badgesHTML = `
    <span class="badge verified">${profile.isVerified ? '✓ Verified' : 'Standard Member'}</span>
    <span class="badge rating">★ ${rating} (${profile.reviewCount || 0} reviews)</span>
    <span class="badge">📍 ${profile.location || 'Not specified'}</span>
    <span class="badge">💼 ${roleLabel}</span>
  `;

  document.getElementById('profile-card-container').innerHTML = `
    ${avatarHTML}
    <h1 class="profile-name">${fullName}</h1>
    <div class="profile-username mono">${username}</div>
    <div class="profile-badges">${badgesHTML}</div>
    <div class="profile-bio">${profile.bio || 'This user hasn\'t added a bio yet.'}</div>
  `;

  // Fetch reviews
  document.getElementById('reviews-section').style.display = 'block';
  const reviewsList = document.getElementById('reviews-list');
  const reviewForm = document.getElementById('leave-review-form');

  if (isSelf || !myProfile) {
    reviewForm.style.display = 'none';
  } else {
    reviewForm.style.display = 'block';
  }

  try {
    const { data: reviews } = await window.supabaseClient
      .from('Review')
      .select('*, reviewer:reviewerId(firstName, lastName, username, avatarUrl)')
      .eq('revieweeId', profile.id)
      .order('createdAt', { ascending: false });

    if (!reviews || reviews.length === 0) {
      reviewsList.innerHTML = `<div style="text-align:center; color:var(--muted); padding:20px;">No reviews yet for this user.</div>`;
    } else {
      reviewsList.innerHTML = reviews.map(r => {
        const rName = r.reviewer ? `${r.reviewer.firstName || ''} ${r.reviewer.lastName || ''}`.trim() : 'Anonymous';
        const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
        const rDate = new Date(r.createdAt).toLocaleDateString();
        return `
          <div class="review-item">
            <div class="review-header">
              <span class="review-name">${rName}</span>
              <span class="review-stars">${stars}</span>
            </div>
            <p class="review-text">${r.comment || ''}</p>
            <div class="review-date">${rDate}</div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    reviewsList.innerHTML = `<div style="text-align:center; color:var(--red); padding:20px;">Failed to load reviews.</div>`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // Check if we are on the standalone profile page
  if (window.location.pathname.toLowerCase().includes('/profile')) {
    const urlParams = new URLSearchParams(window.location.search);
    let targetId = urlParams.get('id');
    
    const bootProfile = async () => {
      if (!targetId) {
        const myProfile = await window.ensureTaskaProfile();
        if (myProfile) targetId = myProfile.id;
      }
      window.renderStandaloneProfile(targetId);
    };

    window.addEventListener('taska:ready', bootProfile);
    if (window.__taskaReady) bootProfile();
  }

  document.getElementById('leave-review-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const myProfile = await window.ensureTaskaProfile();
    if (!myProfile || !window.currentViewingProfileId || !window.supabaseClient) {
      alert('Please sign in to leave a review.');
      return;
    }

    if (myProfile.id === window.currentViewingProfileId) {
      alert('You cannot leave a review for yourself.');
      return;
    }

    const rating = parseInt(document.getElementById('review-rating')?.value || '5');
    const comment = document.getElementById('review-comment')?.value.trim();
    const btn = document.getElementById('submit-review-btn');

    if (!comment) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Submitting...';
    }

    try {
      const { error: reviewErr } = await window.supabaseClient
        .from('Review')
        .insert({
          reviewerId: myProfile.id,
          revieweeId: window.currentViewingProfileId,
          rating,
          comment
        });

      if (reviewErr) throw reviewErr;

      // Recalculate average rating & review count for reviewee
      const { data: allReviews } = await window.supabaseClient
        .from('Review')
        .select('rating')
        .eq('revieweeId', window.currentViewingProfileId);

      if (allReviews && allReviews.length > 0) {
        const count = allReviews.length;
        const sum = allReviews.reduce((acc, r) => acc + (r.rating || 5), 0);
        const avg = parseFloat((sum / count).toFixed(1));

        await window.supabaseClient
          .from('Profile')
          .update({ averageRating: avg, reviewCount: count })
          .eq('id', window.currentViewingProfileId);
      }

      document.getElementById('review-comment').value = '';
      alert('Review submitted successfully!');
      window.renderStandaloneProfile(window.currentViewingProfileId);

    } catch (err) {
      console.error('Leave review error:', err);
      alert('Failed to submit review.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Submit Review';
      }
    }
  });
});
