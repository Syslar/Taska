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

  setupPhoneVerificationAndEditing(profile);

  if (loc) loc.value = profile.location || '';
  if (bio) bio.value = profile.bio || profile.taskerBio || profile.posterBio || '';

  // 2. Populate live profile card preview
  const avatarEl = document.getElementById('profile-big-avatar');
  const nameEl = document.getElementById('profile-full-name');
  const usernameEl = document.getElementById('profile-username-val');
  const roleEl = document.getElementById('profile-role-badge');
  const verifiedEl = document.getElementById('profile-verified-val');
  const emailEl = document.getElementById('profile-email-val');
  const phoneValEl = document.getElementById('profile-phone-val');

  if (avatarEl) {
    if (profile.avatarUrl) {
      avatarEl.innerHTML = `<img src="${profile.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      const initial = (profile.firstName || 'U')[0].toUpperCase();
      avatarEl.textContent = initial;
    }
  }

  const checkIcon = window.TaskaIcons?.verified || `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

  if (nameEl) nameEl.textContent = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile';
  if (usernameEl) usernameEl.textContent = `@${profile.username || 'user'}`;
  if (roleEl) roleEl.textContent = profile.role === 'TASKER' ? 'Tasker' : profile.role === 'POSTER' ? 'Task Poster' : 'Poster & Tasker';
  if (emailEl) emailEl.textContent = profile.email || '—';

  if (phoneValEl) {
    if (profile.phone && profile.isPhoneVerified) {
      phoneValEl.innerHTML = `<span style="color:var(--green-700); font-weight:600; display:inline-flex; align-items:center; gap:3px;">${checkIcon} ${profile.phone}</span>`;
    } else if (profile.phone) {
      phoneValEl.textContent = profile.phone;
    } else {
      phoneValEl.textContent = '—';
    }
  }

  if (verifiedEl) {
    const isVer = profile.isVerified || profile.kycStatus === 'VERIFIED';
    verifiedEl.innerHTML = isVer ? `<span style="color:var(--green-700); display:inline-flex; align-items:center; gap:3px;">${checkIcon} Verified</span>` : 'Unverified';
  }

  // Setup View Public Profile Button
  const btnViewLive = document.getElementById('btnViewLiveProfile');
  if (btnViewLive) {
    const isTasker = profile.role === 'TASKER';
    btnViewLive.href = isTasker ? `/tasker/profile?id=${profile.id}` : `/poster/profile?id=${profile.id}`;
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
          <a href="/settings/kyc" class="btn btn-primary btn-sm" style="border-radius:20px; text-decoration:none;">Verify Identity Now</a>
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

  const phoneInput = document.getElementById('settingsPhone');
  const rawEntered = phoneInput ? phoneInput.value.trim().replace(/\D/g, '') : '';
  const origDigits = (profile.phone || '').replace(/\D/g, '').replace(/^234/, '').replace(/^\+234/, '');

  // CRITICAL APP RULE:
  // If the user changed the phone number, they MUST verify they own it via SMS OTP first!
  if (rawEntered !== origDigits) {
    if (window.showToast) {
      window.showToast('You entered a new phone number. Please verify it via SMS first before saving.', 'error');
    }
    const verifyBtn = document.getElementById('btnVerifyPhoneTrigger');
    if (verifyBtn) {
      verifyBtn.click();
    }
    return; // Block saving with an unverified phone number
  }

  const btn = document.getElementById('settingsSaveBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

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
    // Security & Data Integrity:
    // Phone number and phone verification status are NEVER modified directly by client-side form updates.
    // They are updated exclusively by the verified Termii OTP Edge Function upon successful code check.
    const updatePayload = { firstName, lastName, location, bio, gender, dateOfBirth };
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

// Helper: Setup Phone Verification, Locked State, and Pencil Edit Button
function setupPhoneVerificationAndEditing(profile) {
  const phoneInput = document.getElementById('settingsPhone');
  const phoneWrap = document.getElementById('settingsPhoneWrap');
  const btnEdit = document.getElementById('btnEditPhone');
  const statusEl = document.getElementById('phoneVerifyStatus');
  const hintEl = document.getElementById('phoneHelperHint');

  if (!phoneInput) return;

  const isVerified = Boolean(profile.isPhoneVerified && profile.phone);
  const origDigits = (profile.phone || '').replace(/\D/g, '').replace(/^234/, '').replace(/^\+234/, '');

  let isEditing = false;

  function renderState() {
    const currentDigits = phoneInput.value.replace(/\D/g, '');
    const isDifferent = currentDigits !== origDigits;

    if (isVerified && !isEditing) {
      // ── LOCKED VERIFIED STATE ──
      phoneInput.value = origDigits;
      phoneInput.readOnly = true;
      if (phoneWrap) {
        phoneWrap.classList.add('is-verified-wrap');
        phoneWrap.classList.remove('is-editing-wrap');
      }

      if (statusEl) {
        statusEl.innerHTML = `
          <span style="font-size:0.75rem; font-weight:700; color:#059669; background:#ECFDF5; border:1px solid #A7F3D0; padding:2px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Verified
          </span>
        `;
      }

      if (btnEdit) {
        btnEdit.style.display = 'inline-flex';
        btnEdit.classList.remove('is-cancel');
        btnEdit.title = 'Change phone number';
        btnEdit.setAttribute('aria-label', 'Change phone number');
        btnEdit.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
        `;
      }

      if (hintEl) {
        hintEl.innerHTML = `<span style="color:var(--muted);">Phone number is verified. Click the pencil icon to change it.</span>`;
      }

    } else if (isVerified && isEditing) {
      // ── EDITING CURRENTLY VERIFIED NUMBER ──
      phoneInput.readOnly = false;
      if (phoneWrap) {
        phoneWrap.classList.remove('is-verified-wrap');
        phoneWrap.classList.add('is-editing-wrap');
      }

      if (btnEdit) {
        btnEdit.style.display = 'inline-flex';
        btnEdit.classList.add('is-cancel');
        btnEdit.title = 'Cancel change';
        btnEdit.setAttribute('aria-label', 'Cancel change');
        btnEdit.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        `;
      }

      if (!isDifferent) {
        if (statusEl) {
          statusEl.innerHTML = `
            <span style="font-size:0.75rem; font-weight:700; color:#059669; background:#ECFDF5; border:1px solid #A7F3D0; padding:2px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Verified
            </span>
          `;
        }
        if (hintEl) {
          hintEl.innerHTML = `<span style="color:var(--muted);">Type your new mobile number to change it, or click ✕ to cancel.</span>`;
        }
      } else {
        // Different number: Must verify ownership via SMS OTP before saving
        if (statusEl) {
          statusEl.innerHTML = `
            <span style="font-size:0.75rem; font-weight:700; color:#D97706; background:#FFFBEB; border:1px solid #FDE68A; padding:2px 8px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">
              Unverified
            </span>
            <button type="button" id="btnVerifyPhoneTrigger" style="background:#E1F5E8; border:1px solid #CDEEDA; color:#146C34; font-size:0.75rem; font-weight:700; cursor:pointer; padding:3px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; transition:background 0.15s ease;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              Verify via SMS
            </button>
          `;
          attachVerifyButtonListener();
        }
        if (hintEl) {
          hintEl.innerHTML = `<span style="color:#B45309; font-weight:600;">⚠️ You must verify this new number via SMS OTP before it will be saved to your account.</span>`;
        }
      }

    } else {
      // ── NEVER VERIFIED STATE ──
      phoneInput.readOnly = false;
      if (phoneWrap) {
        phoneWrap.classList.remove('is-verified-wrap');
        phoneWrap.classList.remove('is-editing-wrap');
      }
      if (btnEdit) btnEdit.style.display = 'none';

      if (statusEl) {
        statusEl.innerHTML = `
          <button type="button" id="btnVerifyPhoneTrigger" style="background:#E1F5E8; border:1px solid #CDEEDA; color:#146C34; font-size:0.75rem; font-weight:700; cursor:pointer; padding:3px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px; transition:background 0.15s ease;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Verify via SMS
          </button>
        `;
        attachVerifyButtonListener();
      }

      if (hintEl) {
        hintEl.innerHTML = `<span style="color:var(--muted);">Verify your mobile number to receive real-time task notifications.</span>`;
      }
    }
  }

  function attachVerifyButtonListener() {
    const trigger = document.getElementById('btnVerifyPhoneTrigger');
    if (!trigger) return;
    trigger.onclick = () => {
      const entered = phoneInput.value.trim().replace(/\D/g, '');
      if (!entered || entered.length < 10) {
        if (window.showToast) window.showToast('Please enter a valid 10 or 11-digit Nigerian mobile number first', 'error');
        phoneInput.focus();
        return;
      }
      const fullPhone = '+234' + (entered.startsWith('0') ? entered.substring(1) : entered);

      if (typeof window.openPhoneOtpModal === 'function') {
        window.openPhoneOtpModal({
          phone: fullPhone,
          userId: profile.userId,
          profileId: profile.id,
          onVerified: (res) => {
            profile.isPhoneVerified = true;
            profile.phone = res.phone;
            try {
              localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
            } catch (_) {}
            isEditing = false;
            if (window.showToast) window.showToast('Phone number verified and updated successfully!', 'success');
            window.renderSettingsPage();
          },
        });
      }
    };
  }

  if (btnEdit && !btnEdit._hasClickListener) {
    btnEdit._hasClickListener = true;
    btnEdit.addEventListener('click', () => {
      if (!isEditing) {
        isEditing = true;
        renderState();
        phoneInput.focus();
        phoneInput.select();
      } else {
        isEditing = false;
        phoneInput.value = origDigits;
        renderState();
      }
    });
  }

  if (!phoneInput._hasInputListener) {
    phoneInput._hasInputListener = true;
    phoneInput.addEventListener('input', () => {
      renderState();
    });
  }

  // Initial render
  renderState();
}

// Run render on load
document.addEventListener('DOMContentLoaded', () => {
  window.renderSettingsPage();
});

