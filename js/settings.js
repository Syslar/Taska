/**
 * Taska Settings Page Controller
 * Unified Profile Management: Live preview, Editing, Reviews & Ratings, and Task History.
 * Pure SVG icons, zero emojis, verified relative navigation.
 */

function renderSettingsStarsHtml(ratingScore, size = 15) {
  let html = '';
  const rounded = Math.round(Number(ratingScore) || 0);
  for (let i = 1; i <= 5; i++) {
    const isFilled = (Number(ratingScore) > 0) && (i <= rounded);
    html += `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${isFilled ? '#F4A819' : 'none'}" stroke="${isFilled ? '#F4A819' : '#D1D5DB'}" stroke-width="2" style="vertical-align:middle;"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`;
  }
  return html;
}

window.renderSettingsPage = async function () {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  // 1. Populate form fields
  const fname = document.getElementById('settingsFname');
  const lname = document.getElementById('settingsLname');
  const phone = document.getElementById('settingsPhone');
  const loc = document.getElementById('settingsLocation');
  const bio = document.getElementById('settingsBio');
  const genderEl = document.getElementById('settingsGender');
  const dobEl = document.getElementById('settingsDob');
  const ageHint = document.getElementById('settingsAgeHint');

  if (fname) fname.value = profile.firstName || '';
  if (lname) lname.value = profile.lastName || '';
  if (genderEl) genderEl.value = profile.gender || '';
  if (dobEl) {
    dobEl.value = profile.dateOfBirth || '';
    if (profile.dateOfBirth && ageHint) {
      const birthYear = new Date(profile.dateOfBirth).getFullYear();
      const age = new Date().getFullYear() - birthYear;
      ageHint.textContent = `Declared Age: ~${age} years old`;
      ageHint.style.color = 'var(--green-700)';
    }
  }

  const rawPhone = profile.phone || '';
  const digitsOnly = rawPhone.replace(/\D/g, '').replace(/^234/, '').replace(/^\+234/, '');
  if (phone) phone.value = digitsOnly;

  if (loc) loc.value = profile.location || '';
  if (bio) bio.value = profile.bio || profile.taskerBio || profile.posterBio || '';

  // 2. Populate live profile card preview
  const avatarEl = document.getElementById('profile-big-avatar');
  const nameEl = document.getElementById('profile-full-name');
  const usernameEl = document.getElementById('profile-username-val');
  const roleEl = document.getElementById('profile-role-badge');
  const verifiedEl = document.getElementById('profile-verified-val');
  const emailEl = document.getElementById('profile-email-val');

  if (avatarEl) {
    if (profile.avatarUrl) {
      avatarEl.innerHTML = `<img src="${profile.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      const initial = (profile.firstName || 'U')[0].toUpperCase();
      avatarEl.textContent = initial;
    }
  }

  const checkIcon = window.TaskaIcons?.verified || '';

  if (nameEl) nameEl.textContent = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile';
  if (usernameEl) usernameEl.textContent = `@${profile.username || 'user'}`;
  if (roleEl) roleEl.textContent = profile.role === 'TASKER' ? 'Tasker' : profile.role === 'POSTER' ? 'Task Poster' : 'Poster & Tasker';
  if (emailEl) emailEl.textContent = profile.email || '—';

  if (verifiedEl) {
    const isVer = profile.isVerified || profile.kycStatus === 'VERIFIED';
    verifiedEl.innerHTML = isVer ? `<span style="color:var(--green-700); display:inline-flex; align-items:center; gap:3px;">${checkIcon} Verified</span>` : 'Unverified';
  }

  // Setup View Public Profile Button
  const btnViewLive = document.getElementById('btnViewLiveProfile');
  if (btnViewLive) {
    const isTasker = profile.role === 'TASKER';
    btnViewLive.href = isTasker ? `../Tasker/Profile/index.html?id=${profile.id}` : `../Poster/Profile/index.html?id=${profile.id}`;
  }

  // Real-time input updates for Live Preview
  const updateLiveName = () => {
    const fn = (fname ? fname.value : '').trim();
    const ln = (lname ? lname.value : '').trim();
    const combined = `${fn} ${ln}`.trim();
    if (nameEl) nameEl.textContent = combined || 'User Profile';
    if (avatarEl && !avatarEl.querySelector('img')) {
      avatarEl.textContent = (fn || 'U')[0].toUpperCase();
    }
  };

  if (fname && !fname._hasLiveListener) {
    fname.addEventListener('input', updateLiveName);
    fname._hasLiveListener = true;
  }
  if (lname && !lname._hasLiveListener) {
    lname.addEventListener('input', updateLiveName);
    lname._hasLiveListener = true;
  }

  // Avatar upload preview listener
  const avatarUploadInput = document.getElementById('settingsAvatarUpload');
  if (avatarUploadInput) {
    avatarUploadInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        if (window.showToast) window.showToast('Maximum size for media is 5MB.');
        avatarUploadInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (avatarEl) {
          avatarEl.innerHTML = `<img src="${ev.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        }
      };
      reader.readAsDataURL(file);
    };
  }

  // 3. Populate KYC Status Banner
  const kycSection = document.getElementById('settings-kyc-section');
  if (kycSection) {
    const isVer = profile.isVerified || profile.kycStatus === 'VERIFIED';
    if (isVer) {
      kycSection.innerHTML = `
        <div style="background:var(--mint-050); border:1px solid var(--mint-150); border-radius:var(--radius-md); padding:18px; color:var(--green-900); display:flex; align-items:center; gap:16px;">
          <div style="width:40px; height:40px; border-radius:50%; background:var(--mint-150); color:var(--green-700); display:flex; align-items:center; justify-content:center; flex-shrink:0;">${checkIcon}</div>
          <div>
            <div style="font-weight:700; font-size:0.98rem;">Identity Verified</div>
            <div style="font-size:0.84rem; color:var(--green-700); margin-top:2px;">Your government identity is verified. You have a verified badge across Taska.</div>
          </div>
        </div>
      `;
    } else {
      kycSection.innerHTML = `
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md); padding:18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
          <div>
            <div style="font-weight:700; font-size:0.98rem; color:var(--green-900);">Verify Your Identity</div>
            <div style="font-size:0.84rem; color:var(--muted); margin-top:2px; max-width:480px;">Complete quick identity verification using NIN, Voter's Card, or Driver's License.</div>
          </div>
          <a href="kyc.html" class="btn btn-primary btn-sm" style="border-radius:20px; text-decoration:none;">Verify Identity Now</a>
        </div>
      `;
    }
  }

  // 4. Setup Internal Module Tab Navigation
  setupProfileInnerTabs(profile.id);

  // Load Reviews & History for the user
  loadSettingsReviews(profile.id);
  loadSettingsHistory(profile.id);
};

function setupProfileInnerTabs(profileId) {
  const tabBtns = document.querySelectorAll('#profileInnerTabNav button[data-inner-tab]');
  tabBtns.forEach((btn) => {
    btn.onclick = () => {
      tabBtns.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');

      const targetTab = btn.dataset.innerTab;
      const editPanel = document.getElementById('inner-panel-edit');
      const reviewsPanel = document.getElementById('inner-panel-reviews');
      const historyPanel = document.getElementById('inner-panel-history');

      if (editPanel) editPanel.style.display = targetTab === 'edit' ? 'block' : 'none';
      if (reviewsPanel) reviewsPanel.style.display = targetTab === 'reviews' ? 'block' : 'none';
      if (historyPanel) historyPanel.style.display = targetTab === 'history' ? 'block' : 'none';
    };
  });
}

// Load dynamic reviews in Settings
async function loadSettingsReviews(profileId) {
  const reviewsCountEl = document.getElementById('settingsReviewsCount');
  const ratingBigEl = document.getElementById('settingsRatingBig');
  const ratingStarsEl = document.getElementById('settingsRatingStars');
  const ratingCountEl = document.getElementById('settingsRatingCount');
  const ratingBarsEl = document.getElementById('settingsRatingBars');
  const reviewsListEl = document.getElementById('settingsReviewsList');

  try {
    const { data: reviews, error } = await window.supabaseClient
      .from('Review')
      .select('*, reviewer:Profile!reviewerId(*)')
      .eq('revieweeId', profileId)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const total = reviews ? reviews.length : 0;
    let avg = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (total > 0) {
      let sum = 0;
      reviews.forEach((r) => {
        const val = Math.min(5, Math.max(1, Math.round(r.rating || 5)));
        distribution[val] = (distribution[val] || 0) + 1;
        sum += (r.rating || 5);
      });
      avg = sum / total;
    }

    const formattedAvg = total > 0 ? avg.toFixed(1) : '0';
    if (reviewsCountEl) reviewsCountEl.textContent = total;
    if (ratingBigEl) ratingBigEl.textContent = formattedAvg;
    if (ratingStarsEl) ratingStarsEl.innerHTML = renderSettingsStarsHtml(total > 0 ? avg : 0, 16);
    if (ratingCountEl) ratingCountEl.textContent = total === 0 ? '0 reviews' : total === 1 ? '1 review' : `${total} reviews`;

    if (ratingBarsEl) {
      ratingBarsEl.innerHTML = [5, 4, 3, 2, 1].map((starNum) => {
        const count = distribution[starNum] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.75rem; color:var(--muted); min-width:48px; text-align:right; flex-shrink:0;">${starNum} Star${starNum === 1 ? '' : 's'}</span>
            <div style="flex:1; height:6px; background:var(--line-soft); border-radius:999px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:var(--green-700); border-radius:999px;"></div>
            </div>
            <span class="mono" style="font-size:0.72rem; color:var(--muted); min-width:30px;">${pct}%</span>
          </div>
        `;
      }).join('');
    }

    if (!reviews || reviews.length === 0) {
      if (reviewsListEl) {
        reviewsListEl.innerHTML = `<div style="padding:28px; text-align:center; color:var(--muted); font-size:0.88rem;">No reviews received yet.</div>`;
      }
      return;
    }

    if (reviewsListEl) {
      reviewsListEl.innerHTML = reviews.map((rev) => {
        const rawName = rev.reviewer ? `${rev.reviewer.firstName || ''} ${rev.reviewer.lastName || ''}`.trim() || rev.reviewer.username : 'User';
        const name = window.escapeHtml(rawName);
        const initials = rev.reviewer ? `${(rev.reviewer.firstName || '')[0] || ''}${(rev.reviewer.lastName || '')[0] || ''}`.toUpperCase() : 'U';
        const dateStr = new Date(rev.createdAt || Date.now()).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
        const comment = window.escapeHtml(rev.comment || 'No comment provided.');

        return `
          <div style="padding:14px; background:var(--paper); border:1px solid var(--line-soft); border-radius:var(--radius-sm);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:32px; height:32px; border-radius:50%; background:var(--mint-100); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem; overflow:hidden;">
                  ${rev.reviewer?.avatarUrl ? `<img src="${rev.reviewer.avatarUrl}" style="width:100%; height:100%; object-fit:cover;">` : initials}
                </div>
                <div style="font-weight:600; font-size:0.88rem; color:var(--green-900);">${name}</div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <div>${renderSettingsStarsHtml(rev.rating || 5, 13)}</div>
                <div class="mono" style="font-size:0.75rem; color:var(--muted);">${dateStr}</div>
              </div>
            </div>
            <div style="font-size:0.86rem; color:var(--ink-soft); line-height:1.5;">${comment}</div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('loadSettingsReviews error:', err);
  }
}

// Load dynamic task history in Settings
async function loadSettingsHistory(profileId) {
  const historyListEl = document.getElementById('settingsHistoryList');
  if (!historyListEl) return;

  try {
    const { data: tasks, error } = await window.supabaseClient
      .from('Task')
      .select('*')
      .or(`posterId.eq.${profileId},assignedTo.eq.${profileId}`)
      .order('createdAt', { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!tasks || tasks.length === 0) {
      historyListEl.innerHTML = `<div style="padding:28px; text-align:center; color:var(--muted); font-size:0.88rem;">No task history yet.</div>`;
      return;
    }

    historyListEl.innerHTML = tasks.map((t) => {
      const dateStr = new Date(t.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
      const safeTitle = window.escapeHtml(t.title || 'Task');
      const safeCategory = window.escapeHtml(t.category || 'General');
      const budgetStr = t.budget != null ? (window.formatNaira ? window.formatNaira(t.budget) : `₦${t.budget}`) : 'Open';

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--line-soft);">
          <div>
            <div style="font-weight:600; font-size:0.9rem; color:var(--green-900);">${safeTitle}</div>
            <div style="font-size:0.76rem; color:var(--muted); margin-top:2px;">${safeCategory} · <span class="mono">${budgetStr}</span> · ${dateStr}</div>
          </div>
          <span class="status ${t.status === 'COMPLETED' ? 'status-closed' : 'status-open'}" style="font-size:0.72rem;">
            ${t.status}
          </span>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('loadSettingsHistory error:', err);
  }
}

// Handle Settings Form Submission
document.getElementById('settingsProfileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (window.TaskaRateLimiter && !window.TaskaRateLimiter.canExecute('save-profile', 2000)) {
    return;
  }

  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const btn = document.getElementById('settingsSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  const rawPhone = document.getElementById('settingsPhone')?.value.trim() || '';
  const digitsOnly = rawPhone.replace(/\D/g, '').replace(/^0/, '');
  const fullPhone = digitsOnly ? '+234' + digitsOnly : '';

  const firstName = document.getElementById('settingsFname')?.value.trim() || '';
  const lastName = document.getElementById('settingsLname')?.value.trim() || '';
  const avatarFile = document.getElementById('settingsAvatarUpload')?.files[0];
  let newAvatarUrl = undefined;

  if (avatarFile) {
    if (window.showToast) window.showToast('Uploading avatar...');
    newAvatarUrl = await window.uploadTaskaMedia(avatarFile);
    if (newAvatarUrl && window.Clerk && window.Clerk.user) {
      try { await window.Clerk.user.setProfileImage({ file: avatarFile }); } catch(_) {}
    }
  }

  const location = document.getElementById('settingsLocation')?.value.trim() || '';
  const bio = document.getElementById('settingsBio')?.value.trim() || '';
  const gender = document.getElementById('settingsGender')?.value || null;
  const dateOfBirth = document.getElementById('settingsDob')?.value || null;

  try {
    const updatePayload = { firstName, lastName, phone: fullPhone, location, bio, gender, dateOfBirth };
    if (newAvatarUrl) updatePayload.avatarUrl = newAvatarUrl;

    const { error } = await window.supabaseClient
      .from('Profile')
      .update(updatePayload)
      .eq('id', profile.id);

    if (error) throw error;

    Object.assign(profile, updatePayload);
    window.__taskaProfile = profile;
    try {
      localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
    } catch (_) {}

    if (window.showToast) window.showToast('Profile updated successfully!');
    window.renderSettingsPage();
    if (typeof window.initSidebar === 'function') window.initSidebar();
  } catch (err) {
    console.error('Save profile error:', err);
    if (window.showToast) window.showToast('Could not save profile changes.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  }
});

// Run render on load
document.addEventListener('DOMContentLoaded', () => {
  window.renderSettingsPage();
});
