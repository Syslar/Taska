/**
 * Taska Settings Page Controller
 */

window.renderSettingsPage = async function () {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  // 1. Populate form fields
  const fname = document.getElementById('settingsFname');
  const lname = document.getElementById('settingsLname');
  const phone = document.getElementById('settingsPhone');
  const loc = document.getElementById('settingsLocation');
  const bio = document.getElementById('settingsBio');

  if (fname) fname.value = profile.firstName || '';
  if (lname) lname.value = profile.lastName || '';

  const rawPhone = profile.phone || '';
  const digitsOnly = rawPhone.replace(/\D/g, '').replace(/^234/, '').replace(/^\+234/, '');
  if (phone) phone.value = digitsOnly;

  if (loc) loc.value = profile.location || '';
  if (bio) bio.value = profile.bio || '';

  // 2. Populate live profile card preview
  const avatarEl = document.getElementById('profile-big-avatar');
  const nameEl = document.getElementById('profile-full-name');
  const usernameEl = document.getElementById('profile-username-val');
  const roleEl = document.getElementById('profile-role-badge');
  const verifiedEl = document.getElementById('profile-verified-val');
  const emailEl = document.getElementById('profile-email-val');
  const phoneEl = document.getElementById('profile-phone-val');
  const locEl = document.getElementById('profile-location-val');

  if (avatarEl) {
    if (profile.avatarUrl) {
      avatarEl.innerHTML = `<img src="${profile.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
    } else {
      const initial = (profile.firstName || 'U')[0].toUpperCase();
      avatarEl.textContent = initial;
    }
  }

  if (nameEl) nameEl.textContent = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile';
  if (usernameEl) usernameEl.textContent = `@${profile.username || 'user'}`;
  if (roleEl) roleEl.textContent = profile.role || 'Tasker / Poster';
  if (verifiedEl) verifiedEl.textContent = (profile.isVerified || profile.kycStatus === 'VERIFIED') ? '✓ Verified' : 'Unverified';
  if (emailEl) emailEl.textContent = profile.email || '—';
  if (phoneEl) phoneEl.textContent = profile.phone || '—';
  if (locEl) locEl.textContent = profile.location || '—';

  // Avatar upload preview listener
  const avatarUploadInput = document.getElementById('settingsAvatarUpload');
  if (avatarUploadInput) {
    avatarUploadInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('Maximum size for media is 5MB.');
        avatarUploadInput.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('settings-avatar-preview');
        if (preview) {
          preview.innerHTML = `<img src="${ev.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
        }
      };
      reader.readAsDataURL(file);
    };
  }

  // 3. Populate KYC Status Banner & Action Section
  const kycSection = document.getElementById('settings-kyc-section');
  if (kycSection) {
    const isVer = profile.isVerified || profile.kycStatus === 'VERIFIED';
    if (isVer) {
      kycSection.innerHTML = `
        <div style="background:var(--mint-050); border:1px solid var(--mint-150); border-radius:var(--radius-md); padding:20px; color:var(--green-900); display:flex; align-items:center; gap:16px;">
          <div style="width:48px; height:48px; border-radius:50%; background:var(--mint-150); color:var(--green-700); display:flex; align-items:center; justify-content:center; font-size:1.4rem; font-weight:bold; flex-shrink:0;">✓</div>
          <div>
            <div style="font-weight:700; font-size:1.02rem;">Identity Verified</div>
            <div style="font-size:0.85rem; color:var(--green-700); margin-top:2px;">Your government identity (NIN / Voter's Card / Driver's License / National ID Card) has been verified with Dojah. You enjoy high trust and verified badges across Taska.</div>
            ${profile.kycRef ? `<div style="font-size:0.75rem; color:var(--muted); margin-top:4px;" class="mono">Ref: ${profile.kycRef}</div>` : ''}
          </div>
        </div>
      `;
    } else {
      kycSection.innerHTML = `
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-md); padding:22px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="font-weight:700; font-size:1rem; color:var(--green-900);">Verify Your Identity</div>
            <div style="font-size:0.86rem; color:var(--muted); margin-top:4px; max-width:480px;">Complete quick identity verification using NIN, Voter's Card, Driver's License, or National ID Card.</div>
          </div>
          <button type="button" class="btn btn-primary" id="launchKycBtn">Verify Identity Now</button>
        </div>
      `;
      document.getElementById('launchKycBtn')?.addEventListener('click', () => {
        if (typeof window.launchDojahKyc === 'function') {
          window.launchDojahKyc();
        }
      });
    }
  }
};

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

  try {
    const updatePayload = { firstName, lastName, phone: fullPhone, location, bio };
    if (newAvatarUrl) updatePayload.avatarUrl = newAvatarUrl;

    const { error } = await window.supabaseClient
      .from('Profile')
      .update(updatePayload)
      .eq('id', profile.id);

    if (error) throw error;

    Object.assign(profile, updatePayload);
    window.__taskaProfile = profile;

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

// Settings Subtabs Switcher
document.querySelectorAll('.settings-subtabs button[data-settings-subtab]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.settingsSubtab;
    document.querySelectorAll('.settings-subtabs button').forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');

    document.querySelectorAll('.settings-subpanel').forEach(p => p.style.display = 'none');
    const target = document.getElementById(`settings-subpanel-${tabName}`);
    if (target) target.style.display = 'block';
  });
});

// Logout Button in Settings
document.getElementById('settings-logout-btn')?.addEventListener('click', async () => {
  if (window.Clerk && window.Clerk.signOut) {
    await window.Clerk.signOut();
  }
  window.location.href = '../../index.html';
});

// Run render on load
document.addEventListener('DOMContentLoaded', () => {
  window.renderSettingsPage();
});
