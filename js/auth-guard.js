/* ==========================================================================
   auth-guard.js — Shared Clerk session guard + Direct Supabase sync.
   Include this AFTER Clerk JS and supabase-client.js on every protected page.
   ========================================================================== */

// Try loading cached profile immediately from localStorage to eliminate UI delay
(function initCachedProfile() {
  try {
    const cached = localStorage.getItem('taska_cached_profile');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.id) {
        window.__taskaProfile = parsed;
        populateSidebar(parsed);
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => window.checkProfileCompletionPrompt(parsed));
        } else {
          window.checkProfileCompletionPrompt(parsed);
        }
      }
    }
  } catch (_) {}
})();

window.getTaskaToken = async function () {
  let attempts = 0;
  while (!window.__taskaReady && attempts < 100) {
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }
  if (!window.Clerk?.session) return null;
  try {
    return await window.Clerk.session.getToken();
  } catch (_) {
    return null;
  }
};

window.getTaskaProfile = function () {
  return window.__taskaProfile || null;
};

window.getTaskaRole = function () {
  const path = window.location.pathname;
  if (path.includes('/Tasker/')) return 'TASKER';
  if (path.includes('/Poster/')) return 'POSTER';

  let stored = null;
  try { stored = localStorage.getItem('taska_active_role'); } catch (_) {}
  if (stored === 'TASKER' || stored === 'POSTER') return stored;

  if (window.__taskaProfile && window.__taskaProfile.activeRole) {
    return window.__taskaProfile.activeRole.toUpperCase();
  }
  if (window.__taskaProfile && window.__taskaProfile.role === 'TASKER') {
    return 'TASKER';
  }
  return 'POSTER';
};

window.switchTaskaRole = async function (newRole) {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  const targetRole = newRole.toUpperCase() === 'TASKER' ? 'TASKER' : 'POSTER';
  profile.activeRole = targetRole;
  window.__taskaProfile = profile;

  try {
    localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
    localStorage.setItem('taska_active_role', targetRole);
  } catch (_) {}

  if (window.supabaseClient) {
    try {
      await window.supabaseClient
        .from('Profile')
        .update({ activeRole: targetRole })
        .eq('id', profile.id);
    } catch (err) {
      console.error('Supabase activeRole update notice:', err);
    }
  }

  if (window.showToast) {
    window.showToast(`Switched mode to ${targetRole === 'TASKER' ? 'Tasker Mode' : 'Poster Mode'}`);
  }

  // Redirect to respective system dashboard
  const path = window.location.pathname;
  const inSubSub = path.includes('/Poster/') || path.includes('/Tasker/');
  if (targetRole === 'TASKER') {
    window.location.href = inSubSub ? '../../Tasker/Dashboard/index.html' : '../Tasker/Dashboard/index.html';
  } else {
    window.location.href = inSubSub ? '../../Poster/Dashboard/index.html' : '../Poster/Dashboard/index.html';
  }
};

window.ensureTaskaProfile = async function () {
  if (window.__taskaProfile) return window.__taskaProfile;
  let attempts = 0;
  while (!window.__taskaProfile && attempts < 40) {
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }
  return window.__taskaProfile;
};

// Populate every sidebar / mobile topbar on the page with real user data
function populateSidebar(profile) {
  if (!profile) return;
  const path = window.location.pathname;
  const inTasker = path.includes('/Tasker/');
  const inPoster = path.includes('/Poster/');

  let storedRole = null;
  try { storedRole = localStorage.getItem('taska_active_role'); } catch (_) {}

  const currentRole = inTasker ? 'TASKER' : inPoster ? 'POSTER' : (storedRole || profile.activeRole || profile.role || 'POSTER');
  const isTaskerMode = currentRole.toUpperCase() === 'TASKER';

  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || 'U';
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User';
  const username = `@${profile.username || 'user'}`;
  const roleLabel = isTaskerMode ? 'Tasker' : 'Task Poster';

  const avatarEl     = document.getElementById('sidebar-avatar');
  const nameEl       = document.getElementById('sidebar-name');
  const usernameEl   = document.getElementById('sidebar-username');
  const mobileAv     = document.getElementById('mobile-avatar');

  if (avatarEl) {
    if (profile.avatarUrl) {
      avatarEl.innerHTML = `<img src="${profile.avatarUrl}" alt="${fullName}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      avatarEl.textContent = initials;
    }
  }
  if (nameEl) nameEl.textContent = fullName;
  if (usernameEl) {
    const taskerIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    const posterIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    const roleIcon = isTaskerMode ? taskerIcon : posterIcon;
    usernameEl.innerHTML = `${roleIcon} ${isTaskerMode ? 'Tasker Mode' : 'Poster Mode'}`;
  }
  
  const getProfileTarget = () => {
    const path = window.location.pathname;
    const inSubSub = path.includes('/Poster/') || path.includes('/Tasker/');
    const isProfileSubfolder = path.toLowerCase().includes('/profile');
    if (isProfileSubfolder) return `index.html?id=${profile.id}`;
    if (isTaskerMode) {
      return inSubSub ? `../../Tasker/Profile/index.html?id=${profile.id}` : `../Tasker/Profile/index.html?id=${profile.id}`;
    } else {
      return inSubSub ? `../../Poster/Profile/index.html?id=${profile.id}` : `../Poster/Profile/index.html?id=${profile.id}`;
    }
  };

  if (mobileAv) {
    if (profile.avatarUrl) {
      mobileAv.innerHTML = `<img src="${profile.avatarUrl}" alt="${fullName}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      mobileAv.textContent = initials;
    }
    mobileAv.onclick = () => {
      window.location.href = getProfileTarget();
    };
  }

  const userBtn = document.getElementById('sidebar-user-btn');
  if (userBtn && profile.id) {
    // Dropdown toggle is handled in sidebar-component.js
  }

  // Also populate Settings Live Profile Card elements
  const profBigAvatar  = document.getElementById('profile-big-avatar');
  const profFullName   = document.getElementById('profile-full-name');
  const profUsername   = document.getElementById('profile-username-val');
  const profRoleBadge  = document.getElementById('profile-role-badge');
  const profEmail      = document.getElementById('profile-email-val');
  const profPhone      = document.getElementById('profile-phone-val');
  const profLocation   = document.getElementById('profile-location-val');
  const profRating     = document.getElementById('profile-rating-val');
  const profVerified   = document.getElementById('profile-verified-val');

  if (profBigAvatar) {
    if (profile.avatarUrl) {
      profBigAvatar.innerHTML = `<img src="${profile.avatarUrl}" alt="${fullName}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      profBigAvatar.textContent = initials;
    }
  }
  if (profFullName)  profFullName.textContent  = fullName;
  if (profUsername)  profUsername.textContent  = username;
  if (profRoleBadge) profRoleBadge.textContent = roleLabel;
  if (profEmail)     profEmail.textContent     = profile.email || '—';
  if (profPhone)     profPhone.textContent     = profile.phone || '—';
  if (profLocation)  profLocation.textContent  = profile.location || 'Lagos, Nigeria';
  if (profRating) {
    const starIcon = window.TaskaIcons?.star || '';
    profRating.innerHTML = `${starIcon} ${profile.averageRating != null ? profile.averageRating.toFixed(1) : '5.0'} (${profile.reviewCount || 0} reviews)`;
  }
  if (profVerified) {
    const isVer = profile.isVerified || profile.kycStatus === 'VERIFIED';
    const checkIcon = window.TaskaIcons?.verified || '';
    profVerified.innerHTML = isVer ? `<span style="color:var(--green-700);">${checkIcon} Verified</span>` : 'Standard Member';
  }
}

// Fetch or JIT auto-provision user profile directly from Supabase
async function syncSupabaseProfile(clerkUser) {
  if (!window.supabaseClient || !clerkUser) return null;

  try {
    // 1. Check existing profile
    const { data: existing } = await window.supabaseClient
      .from('Profile')
      .select('*, Wallet(*)')
      .eq('userId', clerkUser.id)
      .maybeSingle();

    if (existing) {
      const wallet = existing.Wallet && existing.Wallet.length > 0 ? existing.Wallet[0] : null;
      const profile = { ...existing, wallet };
      delete profile.Wallet;

      try {
        localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
      } catch (_) {}

      return profile;
    }

    // 2. Profile doesn't exist by userId — create Profile + Wallet directly in Supabase
    const firstName = clerkUser.firstName || 'User';
    const lastName = clerkUser.lastName || '';
    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
    const phone = clerkUser.primaryPhoneNumber?.phoneNumber || null;
    const username = clerkUser.username || `user_${Date.now()}`;

    if (phone) {
      const { data: existingByPhone } = await window.supabaseClient
        .from('Profile')
        .select('*, Wallet(*)')
        .eq('phone', phone)
        .maybeSingle();

      if (existingByPhone) {
        if (!existingByPhone.userId || existingByPhone.userId !== clerkUser.id) {
          await window.supabaseClient.from('Profile').update({ userId: clerkUser.id }).eq('id', existingByPhone.id);
        }
        const wallet = existingByPhone.Wallet && existingByPhone.Wallet.length > 0 ? existingByPhone.Wallet[0] : null;
        const profile = { ...existingByPhone, userId: clerkUser.id, wallet };
        delete profile.Wallet;
        try { localStorage.setItem('taska_cached_profile', JSON.stringify(profile)); } catch (_) {}
        return profile;
      }
    }

    if (email) {
      const { data: existingByEmail } = await window.supabaseClient
        .from('Profile')
        .select('*, Wallet(*)')
        .eq('email', email)
        .maybeSingle();

      if (existingByEmail) {
        if (!existingByEmail.userId || existingByEmail.userId !== clerkUser.id) {
          await window.supabaseClient.from('Profile').update({ userId: clerkUser.id }).eq('id', existingByEmail.id);
        }
        const wallet = existingByEmail.Wallet && existingByEmail.Wallet.length > 0 ? existingByEmail.Wallet[0] : null;
        const profile = { ...existingByEmail, userId: clerkUser.id, wallet };
        delete profile.Wallet;
        try { localStorage.setItem('taska_cached_profile', JSON.stringify(profile)); } catch (_) {}
        return profile;
      }
    }

    // Insert new profile
    const insertPayload = {
      userId: clerkUser.id,
      firstName,
      lastName,
      email,
      username,
      role: 'POSTER',
      isPosterSetup: true,
      isTaskerSetup: false,
      activeRole: 'POSTER'
    };
    if (phone) insertPayload.phone = phone;

    let { data: profile, error: profileErr } = await window.supabaseClient
      .from('Profile')
      .insert(insertPayload)
      .select()
      .single();

    if (profileErr) {
      console.error('Failed to create profile in Supabase:', profileErr);
      return null;
    }

    // Create wallet
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .insert({ profileId: profile.id, balance: 0, escrowBalance: 0, lifetimeEarned: 0, lifetimeWithdrawn: 0 })
      .select()
      .single();

    const fullProfile = { ...profile, wallet: wallet || null };

    try {
      localStorage.setItem('taska_cached_profile', JSON.stringify(fullProfile));
    } catch (_) {}

    return fullProfile;

  } catch (err) {
    console.error('Supabase profile sync error:', err);
    return null;
  }
}

async function runAuthGuard() {
  if (window.supabase && window.supabase.createClient && !window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(
      'https://nhittvkskzwpeinscxir.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXR0dmtza3p3cGVpbnNjeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNzY2MzQsImV4cCI6MjA5ODk1MjYzNH0.dII7qIobUbjdAAijn1mYQuu543djIL2sSROY5egQaMc'
    );
  }

  // Fast path: If cached profile exists, populate UI immediately without blocking
  if (window.__taskaProfile) {
    populateSidebar(window.__taskaProfile);
  }

  // 1. Wait for window.Clerk script to be defined
  let attempts = 0;
  while (!window.Clerk && attempts < 30) {
    await new Promise(r => setTimeout(r, 50));
    attempts++;
  }

  if (!window.Clerk) {
    console.error('auth-guard: Clerk SDK failed to load');
    return;
  }

  // 2. Initialize Clerk if not ready
  if (!window.Clerk.isReady) {
    try {
      await window.Clerk.load();
    } catch (err) {
      console.warn('auth-guard: Clerk load notice:', err);
    }
  }

  // 3. Check active session
  if (!window.Clerk.session || !window.Clerk.user) {
    try { localStorage.removeItem('taska_cached_profile'); } catch (_) {}
    window.__taskaProfile = null;
    const path = window.location.pathname;
    const inSubSub = path.includes('/Poster/') || path.includes('/Tasker/');
    const loginUrl = inSubSub ? '../../Auth/login.html' : '../Auth/login.html';
    window.location.replace(loginUrl);
    return;
  }

  // 4. Load/Sync Supabase profile in background
  const profile = await syncSupabaseProfile(window.Clerk.user);
  if (profile) {
    window.__taskaProfile = profile;
    populateSidebar(profile);
    window.checkProfileCompletionPrompt(profile);
  }

  // 5. Bind logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        try { localStorage.removeItem('taska_cached_profile'); } catch (_) {}
        window.__taskaProfile = null;
        await window.Clerk.signOut();
        const path = window.location.pathname;
        const inSubSub = path.includes('/Poster/') || path.includes('/Tasker/');
        const loginUrl = inSubSub ? '../../Auth/login.html' : '../Auth/login.html';
        window.location.replace(loginUrl);
      } catch (err) {
        console.error('Logout error:', err);
      }
    };
  }

  // 6. Signal that auth guard is ready
  window.__taskaReady = true;
  window.dispatchEvent(new Event('taska:ready'));
}

// Check & Display Profile Completion Prompt on Dashboard load
window.checkProfileCompletionPrompt = function (profile) {
  if (!profile) return;
  const path = window.location.pathname.toLowerCase();
  const isDashboard = path.includes('/dashboard/') || path.endsWith('dashboard.html') || (path.endsWith('index.html') && (path.includes('/poster/') || path.includes('/tasker/')));
  if (!isDashboard) return;

  if (sessionStorage.getItem('taska_profile_prompt_dismissed')) return;

  const hasDob = Boolean(profile.dateOfBirth);
  const hasGender = Boolean(profile.gender && profile.gender !== 'OTHER' && profile.gender !== '');
  const isKyc = Boolean(profile.isVerified || profile.kycStatus === 'VERIFIED');

  // If everything is already complete, do not show
  if (hasDob && hasGender && isKyc) return;

  // Render Profile Setup Completion Modal
  document.querySelectorAll('.taska-profile-setup-backdrop').forEach(d => d.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'taska-profile-setup-backdrop';
  backdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.65); z-index: 999998;
    display: flex; align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(4px); opacity: 0; transition: opacity 0.25s ease;
  `;

  const inSubSub = path.includes('/poster/') || path.includes('/tasker/');
  const settingsUrl = inSubSub ? '../../Settings/index.html' : '../Settings/index.html';
  const kycUrl = inSubSub ? '../../Settings/kyc.html' : '../Settings/kyc.html';

  backdrop.innerHTML = `
    <div style="background: var(--paper, #fff); border: 1px solid var(--line, #e2e8f0); border-radius: 18px; max-width: 460px; width: 100%; padding: 28px; box-shadow: 0 24px 54px rgba(0,0,0,0.3); transform: scale(0.92); transition: transform 0.25s ease;">
      <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
        <div style="width:46px; height:46px; border-radius:50%; background:#ECFDF5; color:var(--green-700); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
        <div>
          <h2 style="font-size:1.22rem; margin:0 0 2px 0; color:var(--green-900);">Complete Your Profile</h2>
          <p style="font-size:0.84rem; color:var(--muted); margin:0;">Finish setting up to unlock full task access &amp; verified badge</p>
        </div>
      </div>

      <div style="background:var(--surface, #f8fafc); border:1px solid var(--line, #e2e8f0); border-radius:12px; padding:14px; margin-bottom:20px; display:flex; flex-direction:column; gap:10px;">
        
        <!-- Date of Birth / Age -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.88rem;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-800)" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span style="color:var(--green-900); font-weight:600;">Age (Date of Birth)</span>
          </div>
          ${hasDob 
            ? `<span style="color:var(--green-700); font-weight:600; font-size:0.8rem; display:inline-flex; align-items:center; gap:3px;">✓ Set</span>`
            : `<a href="${settingsUrl}" style="color:#D97706; background:#FEF3C7; border:1px solid #FCD34D; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:8px; text-decoration:none;">Add DOB</a>`
          }
        </div>

        <!-- Gender -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.88rem;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-800)" stroke-width="2"><path d="M12 2a5 5 0 0 1 5 5c0 2.3-1.5 4.3-3.6 4.8l.6 3.2h3v2h-3v3h-2v-3h-3v-2h3l.6-3.2C8.5 11.3 7 9.3 7 7a5 5 0 0 1 5-5z"/></svg>
            <span style="color:var(--green-900); font-weight:600;">Gender Declaration</span>
          </div>
          ${hasGender 
            ? `<span style="color:var(--green-700); font-weight:600; font-size:0.8rem; display:inline-flex; align-items:center; gap:3px;">✓ ${profile.gender}</span>`
            : `<a href="${settingsUrl}" style="color:#D97706; background:#FEF3C7; border:1px solid #FCD34D; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:8px; text-decoration:none;">Select Gender</a>`
          }
        </div>

        <!-- Identity Verification -->
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.88rem;">
          <div style="display:flex; align-items:center; gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-800)" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span style="color:var(--green-900); font-weight:600;">Identity Verification (KYC)</span>
          </div>
          ${isKyc 
            ? `<span style="color:var(--green-700); font-weight:600; font-size:0.8rem; display:inline-flex; align-items:center; gap:3px;">✓ Verified</span>`
            : `<a href="${kycUrl}" style="color:#1D4ED8; background:#EFF6FF; border:1px solid #BFDBFE; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:8px; text-decoration:none;">Verify ID</a>`
          }
        </div>

      </div>

      <div style="display:flex; gap:10px;">
        <a href="${settingsUrl}" class="btn btn-primary" style="flex:1; text-align:center; text-decoration:none;">Complete in Settings</a>
        <button type="button" class="btn btn-secondary btn-dismiss-profile-prompt" style="flex:1;">Remind Me Later</button>
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
    sessionStorage.setItem('taska_profile_prompt_dismissed', 'true');
    backdrop.style.opacity = '0';
    const card = backdrop.querySelector('div');
    if (card) card.style.transform = 'scale(0.92)';
    setTimeout(() => backdrop.remove(), 250);
  };

  backdrop.querySelector('.btn-dismiss-profile-prompt').onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
};

// ─── IN-APP MODAL DIALOGS (Confirm & Alert) ──────────────────────────────────
window.showConfirmDialog = function ({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  icon = 'help',
  isDanger = false,
} = {}) {
  return new Promise((resolve) => {
    // Remove any existing active dialogs
    document.querySelectorAll('.taska-dialog-backdrop').forEach(d => d.remove());

    const backdrop = document.createElement('div');
    backdrop.className = 'taska-dialog-backdrop';
    backdrop.style.cssText = `
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 999999;
      display: flex; align-items: center; justify-content: center; padding: 20px;
      backdrop-filter: blur(3px); opacity: 0; transition: opacity 0.2s ease;
    `;

    const iconBg = isDanger ? '#FEE2E2' : '#E6F4EA';
    const iconColor = isDanger ? '#DC2626' : '#059669';
    let iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    
    if (isDanger) {
      iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else if (icon === 'check') {
      iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    }

    const card = document.createElement('div');
    card.className = 'taska-dialog-card';
    card.style.cssText = `
      background: var(--paper, #ffffff); border-radius: var(--radius-md, 16px);
      max-width: 440px; width: 100%; padding: 26px; border: 1px solid var(--line, #e2e8f0);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28); text-align: center;
      transform: scale(0.92); transition: transform 0.2s ease;
    `;

    card.innerHTML = `
      <div style="width: 52px; height: 52px; border-radius: 50%; background: ${iconBg}; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        ${iconSvg}
      </div>
      <h3 style="font-size: 1.25rem; color: var(--green-900, #064E3B); margin: 0 0 8px 0; font-weight: 700;">${window.escapeHtml ? window.escapeHtml(title) : title}</h3>
      <p style="font-size: 0.92rem; color: var(--ink-soft, #4B5563); line-height: 1.55; margin: 0 0 24px 0;">${window.escapeHtml ? window.escapeHtml(message).replace(/\\n/g, '<br>') : message}</p>
      <div style="display: flex; gap: 10px; justify-content: center;">
        <button type="button" class="btn btn-secondary taska-cancel-btn" style="min-width: 100px;">${window.escapeHtml ? window.escapeHtml(cancelText) : cancelText}</button>
        <button type="button" class="btn btn-primary taska-confirm-btn" style="min-width: 130px; ${isDanger ? 'background:#DC2626; border-color:#DC2626;' : ''}">${window.escapeHtml ? window.escapeHtml(confirmText) : confirmText}</button>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    // Fade-in animation
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });

    const close = (val) => {
      backdrop.style.opacity = '0';
      card.style.transform = 'scale(0.92)';
      setTimeout(() => {
        backdrop.remove();
        resolve(val);
      }, 180);
    };

    card.querySelector('.taska-cancel-btn').onclick = () => close(false);
    card.querySelector('.taska-confirm-btn').onclick = () => close(true);

    backdrop.onclick = (e) => {
      if (e.target === backdrop) close(false);
    };
  });
};

window.showAlertDialog = function ({
  title = 'Notification',
  message = '',
  btnText = 'Understood',
  icon = 'info',
} = {}) {
  return new Promise((resolve) => {
    document.querySelectorAll('.taska-dialog-backdrop').forEach(d => d.remove());

    const backdrop = document.createElement('div');
    backdrop.className = 'taska-dialog-backdrop';
    backdrop.style.cssText = `
      position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 999999;
      display: flex; align-items: center; justify-content: center; padding: 20px;
      backdrop-filter: blur(3px); opacity: 0; transition: opacity 0.2s ease;
    `;

    const iconColor = '#059669';
    const iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

    const card = document.createElement('div');
    card.className = 'taska-dialog-card';
    card.style.cssText = `
      background: var(--paper, #ffffff); border-radius: var(--radius-md, 16px);
      max-width: 420px; width: 100%; padding: 26px; border: 1px solid var(--line, #e2e8f0);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28); text-align: center;
      transform: scale(0.92); transition: transform 0.2s ease;
    `;

    card.innerHTML = `
      <div style="width: 52px; height: 52px; border-radius: 50%; background: #E6F4EA; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        ${iconSvg}
      </div>
      <h3 style="font-size: 1.25rem; color: var(--green-900, #064E3B); margin: 0 0 8px 0; font-weight: 700;">${window.escapeHtml ? window.escapeHtml(title) : title}</h3>
      <p style="font-size: 0.92rem; color: var(--ink-soft, #4B5563); line-height: 1.55; margin: 0 0 24px 0;">${window.escapeHtml ? window.escapeHtml(message).replace(/\\n/g, '<br>') : message}</p>
      <button type="button" class="btn btn-primary taska-ok-btn" style="min-width: 140px;">${window.escapeHtml ? window.escapeHtml(btnText) : btnText}</button>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });

    const close = () => {
      backdrop.style.opacity = '0';
      card.style.transform = 'scale(0.92)';
      setTimeout(() => {
        backdrop.remove();
        resolve(true);
      }, 180);
    };

    card.querySelector('.taska-ok-btn').onclick = close;
    backdrop.onclick = (e) => {
      if (e.target === backdrop) close();
    };
  });
};

// ─── IN-APP FULLSCREEN IMAGE LIGHTBOX ────────────────────────────────────────
window.openImageLightbox = function (imageUrl, caption = 'Attachment Preview') {
  if (!imageUrl) return;
  document.querySelectorAll('.taska-lightbox-backdrop').forEach(d => d.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'taska-lightbox-backdrop';
  backdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.88); z-index: 9999999;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 20px; backdrop-filter: blur(8px); opacity: 0; transition: opacity 0.22s ease;
  `;

  backdrop.innerHTML = `
    <div style="position: absolute; top: 20px; right: 24px; display: flex; align-items: center; gap: 14px; z-index: 10;">
      <button type="button" class="taska-lightbox-close" style="background: rgba(255,255,255,0.2); border: none; border-radius: 50%; width: 42px; height: 42px; color: #fff; font-size: 1.4rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s ease;" title="Close">
        ✕
      </button>
    </div>
    <div style="position: relative; max-width: 90vw; max-height: 85vh; display: flex; align-items: center; justify-content: center;">
      <img src="${imageUrl}" alt="${caption}" style="max-width: 100%; max-height: 85vh; object-fit: contain; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.6); transform: scale(0.92); transition: transform 0.22s ease;">
    </div>
  `;

  document.body.appendChild(backdrop);

  const img = backdrop.querySelector('img');
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    if (img) img.style.transform = 'scale(1)';
  });

  const close = () => {
    backdrop.style.opacity = '0';
    if (img) img.style.transform = 'scale(0.92)';
    setTimeout(() => backdrop.remove(), 200);
    document.removeEventListener('keydown', onKeyDown);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeyDown);

  backdrop.querySelector('.taska-lightbox-close').onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };
};

// Global delegation to open profile avatars and media in lightbox
document.addEventListener('click', (e) => {
  const target = e.target;
  if (target && target.tagName === 'IMG') {
    const isClickable = target.closest('#sidebar-avatar') || 
                        target.closest('#mobile-avatar') || 
                        target.closest('.applicant-avatar') || 
                        target.closest('.sidebar-user-avatar') || 
                        target.closest('.profile-avatar-large') || 
                        target.closest('.profile-avatar') || 
                        target.closest('#settings-avatar-preview') || 
                        target.classList.contains('lightbox-img');

    if (isClickable) {
      const src = target.getAttribute('src');
      if (src && !src.startsWith('data:image/svg')) {
        e.preventDefault();
        e.stopPropagation();
        window.openImageLightbox(src, target.alt || 'Profile Picture');
      }
    }
  }
});

// ─── TASK MEDIA & TEXT PARSER ────────────────────────────────────────────────
window.parseTaskMediaAndText = function (rawDesc, proofUrls = []) {
  let text = rawDesc || '';
  const mediaUrls = Array.isArray(proofUrls) ? [...proofUrls] : [];

  // Extract any [Attachment: url] pattern
  const attachmentRegex = /\[Attachment:\s*(https?:\/\/[^\s\]]+)\]/gi;
  let match;
  while ((match = attachmentRegex.exec(text)) !== null) {
    if (match[1] && !mediaUrls.includes(match[1])) {
      mediaUrls.push(match[1]);
    }
  }
  text = text.replace(attachmentRegex, '').trim();

  // Strip [Deadline: ...] if present
  text = text.replace(/\[Deadline:\s*[^\]]+\]/gi, '').trim();

  return {
    cleanText: text,
    mediaUrls: mediaUrls.filter(Boolean),
  };
};

window.renderTaskMediaHTML = function (mediaUrls) {
  if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) return '';
  return `
    <div class="task-media-grid" style="display: flex; gap: 10px; margin-top: 10px; margin-bottom: 10px; flex-wrap: wrap;">
      ${mediaUrls.map(url => {
        const isImg = /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(url) || url.includes('cloudinary.com') || url.includes('/image/upload/');
        if (isImg) {
          return `
            <div class="task-media-thumb" onclick="window.openImageLightbox('${url}'); event.stopPropagation();" style="width: 100px; height: 100px; border-radius: var(--radius-sm, 10px); overflow: hidden; border: 1px solid var(--line, #e2e8f0); box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1)); cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; position: relative;" onmouseover="this.style.transform='scale(1.04)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='var(--shadow-sm)'" title="Click to view full image in app">
              <img src="${url}" alt="Attachment" style="width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none;">
            </div>
          `;
        }
        return `
          <a href="${url}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="font-size: 0.8rem; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--radius-sm, 8px);">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 8 20 8"/></svg>
            View Document
          </a>
        `;
      }).join('')}
    </div>
  `;
};

// Boot auth guard on DOMReady
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAuthGuard);
} else {
  runAuthGuard();
}
