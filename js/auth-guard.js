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
        const ph = parsed.phone;
        const hasPhone = ph && String(ph).trim().length >= 10 && String(ph).toLowerCase() !== 'null' && String(ph).toLowerCase() !== 'undefined';
        const isTaskerRestricted = Boolean(parsed.isTaskerRestricted);
        const isPosterRestricted = Boolean(parsed.isPosterRestricted);
        const path = window.location.pathname.toLowerCase();

        // If trying to access tasker path without a valid phone number or if restricted, force redirect to poster dashboard
        if (path.includes('/tasker/') && (!hasPhone || isTaskerRestricted)) {
          if (!hasPhone) {
            sessionStorage.setItem('taska_phone_required_prompt', '1');
          } else if (isTaskerRestricted) {
            sessionStorage.setItem('taska_restriction_notice', parsed.taskerRestrictionReason || 'Your Tasker account is currently under administrative inspection or restricted.');
          }
          try {
            localStorage.setItem('taska_active_role', 'POSTER');
            parsed.activeRole = 'POSTER';
            localStorage.setItem('taska_cached_profile', JSON.stringify(parsed));
          } catch (_) {}
          window.location.replace('/poster/dashboard');
          return;
        }

        // If trying to access poster path while poster profile is restricted
        if (path.includes('/poster/') && isPosterRestricted) {
          sessionStorage.setItem('taska_restriction_notice', parsed.posterRestrictionReason || 'Your Task Poster account is currently under administrative inspection or restricted.');
          if (hasPhone && !isTaskerRestricted) {
            try {
              localStorage.setItem('taska_active_role', 'TASKER');
              parsed.activeRole = 'TASKER';
              localStorage.setItem('taska_cached_profile', JSON.stringify(parsed));
            } catch (_) {}
            window.location.replace('/tasker/dashboard');
            return;
          }
        }

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
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/tasker/')) return 'TASKER';
  if (path.includes('/poster/')) return 'POSTER';

  let profile = window.__taskaProfile;
  if (!profile) {
    try {
      const c = localStorage.getItem('taska_cached_profile');
      if (c) profile = JSON.parse(c);
    } catch (_) {}
  }

  const ph = profile ? profile.phone : null;
  const hasPhone = ph && String(ph).trim().length >= 10 && String(ph).toLowerCase() !== 'null' && String(ph).toLowerCase() !== 'undefined';
  const isTaskerRestricted = Boolean(profile && profile.isTaskerRestricted);
  const isPosterRestricted = Boolean(profile && profile.isPosterRestricted);

  let stored = null;
  try { stored = localStorage.getItem('taska_active_role'); } catch (_) {}
  let role = stored || (profile && profile.activeRole) || (profile && profile.role) || 'POSTER';
  role = role.toUpperCase();

  if (role === 'TASKER') {
    if (!hasPhone || isTaskerRestricted) {
      role = 'POSTER';
      try { localStorage.setItem('taska_active_role', 'POSTER'); } catch (_) {}
    }
  } else if (role === 'POSTER') {
    if (isPosterRestricted && hasPhone && !isTaskerRestricted) {
      role = 'TASKER';
      try { localStorage.setItem('taska_active_role', 'TASKER'); } catch (_) {}
    }
  }

  return role;
};

window.switchTaskaRole = async function (newRole, options = {}) {
  let profile = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
  if (!profile) {
    try {
      const c = localStorage.getItem('taska_cached_profile');
      if (c) profile = JSON.parse(c);
    } catch (_) {}
  }
  if (!profile) {
    profile = await window.ensureTaskaProfile();
  }
  if (!profile) return;

  const targetRole = newRole.toUpperCase() === 'TASKER' ? 'TASKER' : 'POSTER';

  // Always query authoritative, real-time profile state directly from Supabase
  if (window.supabaseClient && profile.id) {
    try {
      const { data: dbProf, error: dbErr } = await window.supabaseClient
        .from('Profile')
        .select('id, phone, isPhoneVerified, role, activeRole, isTaskerSetup, isPosterSetup, isTaskerRestricted, taskerRestrictionReason, isPosterRestricted, posterRestrictionReason')
        .eq('id', profile.id)
        .maybeSingle();

      if (dbProf && !dbErr) {
        Object.assign(profile, dbProf);
        window.__taskaProfile = profile;
        try { localStorage.setItem('taska_cached_profile', JSON.stringify(profile)); } catch (_) {}
      }
    } catch (fErr) {
      console.warn('Authoritative profile check notice:', fErr);
    }
  }

  // Tasker mode checks: Restrictions and Phone Requirement
  if (targetRole === 'TASKER') {
    // 1. Check administrative restriction / inspection
    if (profile.isTaskerRestricted) {
      const reason = profile.taskerRestrictionReason || 'Your Tasker profile is currently under administrative inspection or restricted. Please contact support.';
      if (window.showToast) {
        window.showToast(reason, 'error');
      } else {
        alert(reason);
      }
      return;
    }

    // 2. Check verified phone requirement
    const ph = profile.phone;
    const hasPhone = ph && String(ph).trim().length >= 10 && String(ph).toLowerCase() !== 'null' && String(ph).toLowerCase() !== 'undefined';
    if (!hasPhone) {
      if (window.promptAddPhoneNumberModal) {
        window.promptAddPhoneNumberModal(() => {
          window.switchTaskaRole('TASKER', options);
        });
      } else if (window.showToast) {
        window.showToast('Please add and verify your phone number to switch to Tasker mode.', 'info');
      }
      return;
    }
  } else if (targetRole === 'POSTER') {
    if (profile.isPosterRestricted) {
      const reason = profile.posterRestrictionReason || 'Your Task Poster profile is currently under administrative inspection or restricted. Please contact support.';
      if (window.showToast) {
        window.showToast(reason, 'error');
      } else {
        alert(reason);
      }
      return;
    }
  }

  // Database-authoritative update FIRST
  if (window.supabaseClient && profile.id) {
    try {
      const { error } = await window.supabaseClient
        .from('Profile')
        .update({ activeRole: targetRole })
        .eq('id', profile.id);

      if (error) throw error;
    } catch (err) {
      console.error('Supabase activeRole update notice:', err);
      const msg = err.message || '';
      if (msg.includes('tasker_requires_phone')) {
        if (window.showToast) window.showToast('Tasker mode requires an active verified phone number.', 'error');
        if (window.promptAddPhoneNumberModal) {
          window.promptAddPhoneNumberModal(() => window.switchTaskaRole('TASKER', options));
        }
      } else if (msg.includes('tasker_restriction_check')) {
        if (window.showToast) window.showToast('This account is currently restricted from activating Tasker mode.', 'error');
      } else if (msg.includes('poster_restriction_check')) {
        if (window.showToast) window.showToast('This account is currently restricted from activating Task Poster mode.', 'error');
      } else {
        if (window.showToast) window.showToast(`Unable to switch mode: ${msg}`, 'error');
      }
      return;
    }
  }

  // Update local memory and cache ONLY AFTER database update succeeded
  profile.activeRole = targetRole;
  window.__taskaProfile = profile;

  try {
    localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
    localStorage.setItem('taska_active_role', targetRole);
  } catch (_) {}

  if (window.showToast) {
    window.showToast(`Switched mode to ${targetRole === 'TASKER' ? 'Tasker Mode' : 'Poster Mode'}`);
  }

  if (options.reload) {
    window.location.reload();
    return;
  }

  const currentPath = window.location.pathname.toLowerCase();
  if (currentPath.includes('/settings')) {
    window.location.reload();
    return;
  }

  // Redirect to respective system dashboard
  const targetUrl = targetRole === 'TASKER' ? '/tasker/dashboard' : '/poster/dashboard';
  if (window.taskaNavigate) {
    window.taskaNavigate(targetUrl);
  } else {
    window.location.href = targetUrl;
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
    const uParam = profile.username ? `u=${encodeURIComponent(profile.username)}` : `id=${profile.id}`;
    return isTaskerMode ? `/tasker/profile?${uParam}` : `/poster/profile?${uParam}`;
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
window.populateSidebar = populateSidebar;

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
    window.location.replace('/login');
    return;
  }

  // 4. Load/Sync Supabase profile in background
  const profile = await syncSupabaseProfile(window.Clerk.user);
  if (profile) {
    window.__taskaProfile = profile;
    populateSidebar(profile);
    if (typeof window.initSidebar === 'function') {
      window.initSidebar();
    }

    // Security Guard: Restrictions and Tasker phone requirement
    const path = window.location.pathname.toLowerCase();
    const ph = profile.phone;
    const hasPhone = ph && String(ph).trim().length >= 10 && String(ph).toLowerCase() !== 'null' && String(ph).toLowerCase() !== 'undefined';
    const isTaskerRestricted = Boolean(profile.isTaskerRestricted);
    const isPosterRestricted = Boolean(profile.isPosterRestricted);

    if (path.includes('/tasker/')) {
      if (!hasPhone) {
        sessionStorage.setItem('taska_phone_required_prompt', '1');
        try {
          localStorage.setItem('taska_active_role', 'POSTER');
          profile.activeRole = 'POSTER';
          localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
        } catch (_) {}
        window.location.replace('/poster/dashboard');
        return;
      }
      if (isTaskerRestricted) {
        sessionStorage.setItem('taska_restriction_notice', profile.taskerRestrictionReason || 'Your Tasker account is currently under administrative inspection or restricted.');
        try {
          localStorage.setItem('taska_active_role', 'POSTER');
          profile.activeRole = 'POSTER';
          localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
        } catch (_) {}
        window.location.replace('/poster/dashboard');
        return;
      }
    } else if (path.includes('/poster/')) {
      if (isPosterRestricted) {
        sessionStorage.setItem('taska_restriction_notice', profile.posterRestrictionReason || 'Your Task Poster account is currently under administrative inspection or restricted.');
        if (hasPhone && !isTaskerRestricted) {
          try {
            localStorage.setItem('taska_active_role', 'TASKER');
            profile.activeRole = 'TASKER';
            localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
          } catch (_) {}
          window.location.replace('/tasker/dashboard');
          return;
        }
      }
    }

    // Display restriction notice if present
    const restrictionNotice = sessionStorage.getItem('taska_restriction_notice');
    if (restrictionNotice) {
      sessionStorage.removeItem('taska_restriction_notice');
      if (window.showToast) {
        window.showToast(restrictionNotice, 'error');
      } else {
        alert(restrictionNotice);
      }
    }

    // Check if user was redirected to poster dashboard because phone was required for tasker mode
    if (sessionStorage.getItem('taska_phone_required_prompt') === '1') {
      sessionStorage.removeItem('taska_phone_required_prompt');
      if (window.showToast) window.showToast('A verified phone number is required to use Tasker mode.', 'info');
      setTimeout(() => {
        if (window.promptAddPhoneNumberModal) {
          window.promptAddPhoneNumberModal(() => {
            window.switchTaskaRole('TASKER');
          });
        }
      }, 500);
    }

    window.checkProfileCompletionPrompt(profile);
    window.checkTransactionPinSetup(profile);
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
        window.location.replace('/login');
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
  const isDashboard = path.includes('/dashboard') || path.endsWith('dashboard.html') || (path.endsWith('index.html') && (path.includes('/poster/') || path.includes('/tasker/')));
  if (!isDashboard) return;

  if (sessionStorage.getItem('taska_profile_prompt_dismissed')) return;

  const hasDob = Boolean(profile.dateOfBirth);
  const hasGender = Boolean(profile.gender && profile.gender !== '');
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

  const settingsUrl = '/settings';
  const kycUrl = '/settings/kyc';

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

// ─── MANDATORY TRANSACTION PIN SETUP MODAL ────────────────────────────────────
window.checkTransactionPinSetup = async function (profile) {
  if (!profile || !profile.id) return;
  const path = window.location.pathname.toLowerCase();
  // Do not show on auth/login/signup pages
  if (path.includes('/login') || path.includes('/signup') || path.includes('/auth/')) return;

  try {
    const token = window.getTaskaToken ? await window.getTaskaToken() : null;
    if (!token) return;

    const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin?action=status&profileId=' + encodeURIComponent(profile.id), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.success && data.pin_is_set === false) {
      window.promptTransactionPinSetupModal(profile);
    }
  } catch (err) {
    console.warn('[auth-guard] PIN status check notice:', err);
  }
};

window.promptTransactionPinSetupModal = function (profile) {
  if (document.getElementById('taska-mandatory-pin-modal')) return;

  const backdrop = document.createElement('div');
  backdrop.id = 'taska-mandatory-pin-modal';
  backdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(10, 25, 18, 0.88); z-index: 9999999;
    display: flex; align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(8px); opacity: 0; transition: opacity 0.25s ease;
  `;

  backdrop.innerHTML = `
    <div id="pinModalCard" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 20px; max-width: 440px; width: 100%; padding: 32px 28px; box-shadow: 0 25px 60px rgba(0,0,0,0.35); transform: scale(0.92); transition: transform 0.25s ease; text-align: center; position: relative;">
      
      <div style="width: 56px; height: 56px; border-radius: 16px; background: #ECFDF5; color: #059669; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>

      <h2 style="font-size: 1.35rem; font-weight: 700; color: #0F172A; margin: 0 0 8px 0; font-family: 'Space Grotesk', -apple-system, sans-serif;">
        Create Transaction PIN
      </h2>
      <p style="font-size: 0.88rem; color: #64748B; margin: 0 0 24px 0; line-height: 1.5;">
        To secure your wallet and prevent unauthorized withdrawals, please set up a 4-digit Transaction PIN.
      </p>

      <form id="setupPinForm" onsubmit="return false;" style="text-align: left;">
        <!-- Step 1: New PIN -->
        <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 8px;">
          Enter 4-Digit PIN
        </label>
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 18px;" class="pin-group-create">
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="new" data-idx="0" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="new" data-idx="1" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="new" data-idx="2" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="new" data-idx="3" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
        </div>

        <!-- Step 2: Confirm PIN -->
        <label style="display: block; font-size: 0.82rem; font-weight: 600; color: #334155; margin-bottom: 8px;">
          Confirm 4-Digit PIN
        </label>
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 20px;" class="pin-group-confirm">
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="confirm" data-idx="0" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="confirm" data-idx="1" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="confirm" data-idx="2" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="taska-pin-input-box" data-step="confirm" data-idx="3" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
        </div>

        <div id="setupPinError" style="display: none; padding: 10px 14px; background: #FEF2F2; border: 1px solid #FCA5A5; color: #B91C1C; font-size: 0.82rem; border-radius: 10px; margin-bottom: 18px; text-align: center; font-weight: 500;"></div>

        <button type="submit" id="btnSubmitPinSetup" style="width: 100%; padding: 14px 20px; background: #059669; color: #FFFFFF; font-size: 0.95rem; font-weight: 600; border-radius: 12px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.2s, transform 0.1s; box-shadow: 0 4px 12px rgba(5,150,105,0.25);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Create PIN &amp; Unlock Wallet
        </button>
      </form>

      <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid #F1F5F9; display: flex; align-items: center; justify-content: center; gap: 6px; color: #94A3B8; font-size: 0.76rem; font-weight: 500;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>Protected with bcrypt hashing &bull; Freezes after 3 failed attempts</span>
      </div>

    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    const card = document.getElementById('pinModalCard');
    if (card) card.style.transform = 'scale(1)';
  });

  const newBoxes = Array.from(backdrop.querySelectorAll('input[data-step="new"]'));
  const confirmBoxes = Array.from(backdrop.querySelectorAll('input[data-step="confirm"]'));
  const allBoxes = [...newBoxes, ...confirmBoxes];
  const errorEl = backdrop.querySelector('#setupPinError');
  const submitBtn = backdrop.querySelector('#btnSubmitPinSetup');

  const setupBoxEvents = (boxes, nextGroup) => {
    boxes.forEach((box, i) => {
      box.addEventListener('focus', () => {
        box.style.borderColor = '#10B981';
        box.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
        box.style.background = '#FFFFFF';
      });
      box.addEventListener('blur', () => {
        box.style.borderColor = '#CBD5E1';
        box.style.boxShadow = 'none';
        box.style.background = '#F8FAFC';
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (!box.value && i > 0) {
            boxes[i - 1].focus();
            boxes[i - 1].value = '';
          }
        } else if (e.key === 'ArrowLeft' && i > 0) {
          boxes[i - 1].focus();
        } else if (e.key === 'ArrowRight' && i < boxes.length - 1) {
          boxes[i + 1].focus();
        } else if (!/^[0-9]$/.test(e.key) && !['Tab', 'Delete'].includes(e.key)) {
          e.preventDefault();
        }
      });
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '');
        if (box.value.length >= 1) {
          box.value = box.value.slice(-1);
          if (i < boxes.length - 1) {
            boxes[i + 1].focus();
          } else if (nextGroup && nextGroup.length > 0) {
            nextGroup[0].focus();
          }
        }
      });
      box.addEventListener('paste', (e) => e.preventDefault());
    });
  };

  setupBoxEvents(newBoxes, confirmBoxes);
  setupBoxEvents(confirmBoxes, null);

  // Focus first box
  setTimeout(() => newBoxes[0]?.focus(), 150);

  // Prevent Escape key or clicking outside
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      const card = document.getElementById('pinModalCard');
      if (card) {
        card.style.transform = 'scale(1.02)';
        setTimeout(() => { card.style.transform = 'scale(1)'; }, 150);
      }
    }
  });

  const onKeyHandler = (e) => {
    if (e.key === 'Escape' && document.getElementById('taska-mandatory-pin-modal')) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', onKeyHandler, true);

  // Form submission
  const form = backdrop.querySelector('#setupPinForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const pin1 = newBoxes.map(b => b.value).join('');
    const pin2 = confirmBoxes.map(b => b.value).join('');

    if (pin1.length !== 4) {
      errorEl.textContent = 'Please enter a complete 4-digit PIN.';
      errorEl.style.display = 'block';
      newBoxes[0].focus();
      return;
    }

    if (pin2.length !== 4) {
      errorEl.textContent = 'Please confirm your 4-digit PIN.';
      errorEl.style.display = 'block';
      confirmBoxes[0].focus();
      return;
    }

    if (pin1 !== pin2) {
      errorEl.textContent = 'PINs do not match. Please re-enter.';
      errorEl.style.display = 'block';
      confirmBoxes.forEach(b => b.value = '');
      confirmBoxes[0].focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
      </svg>
      Securing Wallet...
    `;

    try {
      const token = window.getTaskaToken ? await window.getTaskaToken() : null;
      if (!token) throw new Error('Authentication expired. Please refresh the page.');

      const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'setup',
          pin: pin1,
          profileId: profile.id,
        }),
      });

      const data = await res.json();

      // Clear plain PIN from inputs immediately
      allBoxes.forEach(b => b.value = '');

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to set transaction PIN.');
      }

      // Success
      submitBtn.style.background = '#059669';
      submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        PIN Created Successfully!
      `;

      window.removeEventListener('keydown', onKeyHandler, true);

      if (window.showToast) {
        window.showToast('Transaction PIN created! Your wallet is fully secured.', 'success');
      }

      window.dispatchEvent(new CustomEvent('taska:pin_created'));

      setTimeout(() => {
        backdrop.style.opacity = '0';
        const card = document.getElementById('pinModalCard');
        if (card) card.style.transform = 'scale(0.92)';
        setTimeout(() => backdrop.remove(), 300);
      }, 900);

    } catch (err) {
      console.error('[auth-guard] PIN setup error:', err);
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Try Again
      `;
      errorEl.textContent = err.message || 'Failed to set PIN. Please try again.';
      errorEl.style.display = 'block';
    }
  });
};

// ─── REUSABLE TRANSACTION PIN ENTRY PROMPT ──────────────────────────────────
window.promptTransactionPin = function ({
  title = 'Enter Transaction PIN',
  description = 'Please enter your 4-digit Transaction PIN to authorize this action.',
  submitText = 'Confirm',
  onConfirm,
  onCancel,
} = {}) {
  document.querySelectorAll('#taska-pin-prompt-backdrop').forEach(d => d.remove());

  const backdrop = document.createElement('div');
  backdrop.id = 'taska-pin-prompt-backdrop';
  backdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(10, 25, 18, 0.78); z-index: 9999999;
    display: flex; align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(6px); opacity: 0; transition: opacity 0.2s ease;
  `;

  backdrop.innerHTML = `
    <div id="pinPromptCard" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 20px; max-width: 420px; width: 100%; padding: 28px 24px; box-shadow: 0 25px 60px rgba(0,0,0,0.3); transform: scale(0.94); transition: transform 0.2s ease; text-align: center; position: relative;">
      
      <button type="button" id="btnPinPromptClose" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 1.25rem; color: #94A3B8; cursor: pointer; padding: 4px; line-height: 1;">✕</button>

      <div id="pinPromptIconWrap" style="width: 52px; height: 52px; border-radius: 16px; background: #ECFDF5; color: #059669; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 14px;">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
      </div>

      <h3 id="pinPromptTitle" style="font-size: 1.22rem; font-weight: 700; color: #0F172A; margin: 0 0 6px 0; font-family: 'Space Grotesk', -apple-system, sans-serif;">
        ${title}
      </h3>
      <p id="pinPromptDesc" style="font-size: 0.85rem; color: #64748B; margin: 0 0 20px 0; line-height: 1.5;">
        ${description}
      </p>

      <form id="pinPromptForm" onsubmit="return false;">
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 16px;" id="pinBoxesContainer">
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="pin-box" data-idx="0" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="pin-box" data-idx="1" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="pin-box" data-idx="2" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="pin-box" data-idx="3" style="width: 52px; height: 56px; font-size: 24px; text-align: center; font-weight: 700; border-radius: 12px; border: 1.5px solid #CBD5E1; background: #F8FAFC; outline: none; transition: all 0.2s;" />
        </div>

        <div id="pinPromptError" style="display: none; padding: 10px 12px; background: #FEF2F2; border: 1px solid #FCA5A5; color: #B91C1C; font-size: 0.82rem; border-radius: 10px; margin-bottom: 16px; text-align: center; font-weight: 500;"></div>

        <div id="pinFrozenSection" style="display: none; padding: 14px 16px; background: #FEF2F2; border: 1.5px solid #F87171; color: #991B1B; font-size: 0.84rem; border-radius: 12px; margin-bottom: 16px; text-align: center;">
          <div style="font-weight: 700; margin-bottom: 4px;">Wallet Frozen</div>
          <div style="line-height: 1.45; margin-bottom: 12px;">Your wallet has been frozen due to 3 incorrect attempts. To restore access, you must contact support to submit an appeal.</div>
          <a href="mailto:support@taska.com.ng?subject=Wallet%20Unfreeze%20Appeal&body=Hello%20Taska%20Security%20Team,%0A%0AMy%20wallet%20has%20been%20frozen%20due%20to%20failed%20PIN%20attempts.%20I%20would%20like%20to%20request%20an%20unfreeze%20review.%0A%0AAccount%20Email:%20" style="display: inline-block; background: #DC2626; color: #FFF; text-decoration: none; padding: 8px 18px; border-radius: 8px; font-weight: 600; font-size: 0.82rem;">Contact Support to Appeal &rarr;</a>
        </div>

        <div style="display: flex; gap: 10px; justify-content: center;" id="pinActionButtons">
          <button type="button" id="btnPinPromptCancel" style="flex: 1; padding: 12px 16px; background: #F1F5F9; color: #475569; font-size: 0.9rem; font-weight: 600; border-radius: 10px; border: none; cursor: pointer; transition: background 0.15s;">
            Cancel
          </button>
          <button type="submit" id="btnPinPromptSubmit" style="flex: 1.5; padding: 12px 18px; background: #059669; color: #FFFFFF; font-size: 0.9rem; font-weight: 600; border-radius: 10px; border: none; cursor: pointer; transition: background 0.15s; display: flex; align-items: center; justify-content: center; gap: 6px;">
            ${submitText}
          </button>
        </div>
      </form>

      <div style="margin-top: 16px; font-size: 0.8rem; color: #64748B;" id="pinPromptForgotWrap">
        <button type="button" id="btnPinPromptForgot" style="background: none; border: none; padding: 0; color: #059669; font-weight: 600; cursor: pointer; text-decoration: underline; font-size: 0.82rem;">
          Forgot Transaction PIN? Reset with OTP
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    const card = document.getElementById('pinPromptCard');
    if (card) card.style.transform = 'scale(1)';
  });

  const boxes = Array.from(backdrop.querySelectorAll('.pin-box'));
  const errorEl = backdrop.querySelector('#pinPromptError');
  const frozenSec = backdrop.querySelector('#pinFrozenSection');
  const actionBtns = backdrop.querySelector('#pinActionButtons');
  const submitBtn = backdrop.querySelector('#btnPinPromptSubmit');
  const closeBtn = backdrop.querySelector('#btnPinPromptClose');
  const cancelBtn = backdrop.querySelector('#btnPinPromptCancel');
  const iconWrap = backdrop.querySelector('#pinPromptIconWrap');
  const btnForgot = backdrop.querySelector('#btnPinPromptForgot');

  const close = () => {
    boxes.forEach(b => b.value = '');
    backdrop.style.opacity = '0';
    const card = document.getElementById('pinPromptCard');
    if (card) card.style.transform = 'scale(0.94)';
    setTimeout(() => backdrop.remove(), 200);
    if (typeof onCancel === 'function') onCancel();
  };

  closeBtn.onclick = close;
  cancelBtn.onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  if (btnForgot) {
    btnForgot.onclick = () => {
      close();
      if (typeof window.openForgotPinModal === 'function') {
        window.openForgotPinModal();
      }
    };
  }

  boxes.forEach((box, i) => {
    box.addEventListener('focus', () => {
      box.style.borderColor = '#10B981';
      box.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
      box.style.background = '#FFFFFF';
    });
    box.addEventListener('blur', () => {
      box.style.borderColor = '#CBD5E1';
      box.style.boxShadow = 'none';
      box.style.background = '#F8FAFC';
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        if (!box.value && i > 0) {
          boxes[i - 1].focus();
          boxes[i - 1].value = '';
        }
      } else if (e.key === 'ArrowLeft' && i > 0) {
        boxes[i - 1].focus();
      } else if (e.key === 'ArrowRight' && i < boxes.length - 1) {
        boxes[i + 1].focus();
      } else if (!/^[0-9]$/.test(e.key) && !['Tab', 'Delete'].includes(e.key)) {
        e.preventDefault();
      }
    });
    box.addEventListener('input', () => {
      box.value = box.value.replace(/\D/g, '');
      if (box.value.length >= 1) {
        box.value = box.value.slice(-1);
        if (i < boxes.length - 1) {
          boxes[i + 1].focus();
        }
      }
    });
    box.addEventListener('paste', (e) => e.preventDefault());
  });

  setTimeout(() => boxes[0]?.focus(), 150);

  const modalControls = {
    setLoading: (isLoading, msg = 'Verifying...') => {
      submitBtn.disabled = isLoading;
      if (isLoading) {
        submitBtn.innerHTML = `
          <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
            <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
          </svg>
          ${msg}
        `;
      } else {
        submitBtn.textContent = submitText;
      }
    },
    showError: (msg, attemptsRemaining) => {
      modalControls.setLoading(false);
      boxes.forEach(b => b.value = '');
      boxes[0].focus();
      let alertMsg = msg;
      if (typeof attemptsRemaining === 'number') {
        alertMsg = `${msg} (${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining)`;
      }
      errorEl.textContent = alertMsg;
      errorEl.style.display = 'block';
    },
    showFrozen: (msg) => {
      modalControls.setLoading(false);
      boxes.forEach(b => { b.value = ''; b.disabled = true; });
      errorEl.style.display = 'none';
      frozenSec.style.display = 'block';
      actionBtns.style.display = 'none';
      const forgotWrap = backdrop.querySelector('#pinPromptForgotWrap');
      if (forgotWrap) forgotWrap.style.display = 'none';
      if (iconWrap) {
        iconWrap.style.background = '#FEE2E2';
        iconWrap.style.color = '#DC2626';
        iconWrap.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      }
    },
    close: () => {
      close();
    },
  };

  const form = backdrop.querySelector('#pinPromptForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = boxes.map(b => b.value).join('');
    if (pin.length !== 4) {
      errorEl.textContent = 'Please enter all 4 digits of your PIN.';
      errorEl.style.display = 'block';
      return;
    }
    if (typeof onConfirm === 'function') {
      await onConfirm(pin, modalControls);
    }
  });
};

// ─── TRANSACTION PIN RESET VIA OTP MODAL ─────────────────────────────────────
window.openForgotPinModal = function(options = {}) {
  // Remove existing dialogs
  document.querySelectorAll('.taska-pin-reset-backdrop').forEach(b => b.remove());

  const backdrop = document.createElement('div');
  backdrop.className = 'taska-pin-reset-backdrop';
  backdrop.style.cssText = `
    position: fixed; inset: 0; background: rgba(15, 23, 42, 0.72); z-index: 999999;
    display: flex; align-items: center; justify-content: center; padding: 20px;
    backdrop-filter: blur(4px); opacity: 0; transition: opacity 0.2s ease;
  `;

  const card = document.createElement('div');
  card.className = 'taska-pin-reset-card';
  card.style.cssText = `
    background: #FFFFFF; border-radius: 20px; max-width: 440px; width: 100%;
    padding: 32px 28px; border: 1px solid #E2E8F0;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); text-align: center;
    transform: scale(0.95); transition: transform 0.2s ease;
    font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  backdrop.appendChild(card);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    card.style.transform = 'scale(1)';
  });

  const close = () => {
    backdrop.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => backdrop.remove(), 200);
    if (typeof options.onCancel === 'function') options.onCancel();
  };

  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  // Internal State
  let resetState = {
    selectedChannel: 'email',
    channelsData: null,
    targetMasked: '',
    resetToken: null,
    resendCooldown: 0,
    resendInterval: null,
  };

  // View: Loading
  function renderLoading(msg = 'Checking account details...') {
    card.innerHTML = `
      <div style="padding: 30px 10px;">
        <div style="width: 48px; height: 48px; border: 3.5px solid #E2E8F0; border-top-color: #059669; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 18px auto;"></div>
        <p style="font-size: 0.95rem; color: #475569; font-weight: 500; margin: 0;">${msg}</p>
      </div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
  }

  // View: Step 1 - Choose Channel
  function renderChannelStep(channelsData) {
    resetState.channelsData = channelsData;
    resetState.selectedChannel = 'email';

    const hasPhone = Boolean(channelsData.hasPhone && channelsData.phoneMasked);

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div style="width:48px; height:48px; border-radius:14px; background:#ECFDF5; color:#059669; display:flex; align-items:center; justify-content:center;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <button type="button" id="btnResetClose" style="background:none; border:none; color:#94A3B8; font-size:22px; cursor:pointer; line-height:1; padding:4px;">&times;</button>
      </div>

      <h3 style="font-size:1.25rem; font-weight:700; color:#0F172A; margin:0 0 6px 0; text-align:left;">Reset Transaction PIN</h3>
      <p style="font-size:0.86rem; color:#64748B; margin:0 0 20px 0; line-height:1.5; text-align:left;">
        To secure your account, we will send a 6-digit verification code. Select where you want to receive it:
      </p>

      <div id="resetChannelError" style="display:none; padding:10px 12px; background:#FEF2F2; border:1px solid #FCA5A5; color:#B91C1C; font-size:0.82rem; border-radius:10px; margin-bottom:16px; text-align:left; font-weight:500;"></div>

      <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:24px; text-align:left;">
        <label id="optEmailCard" style="display:flex; align-items:center; gap:12px; padding:14px 16px; border:2px solid #059669; background:#F0FDF4; border-radius:12px; cursor:pointer; transition:all 0.15s;">
          <input type="radio" name="pinResetChannel" value="email" checked style="accent-color:#059669; width:18px; height:18px;" />
          <div style="flex:1;">
            <div style="font-size:0.9rem; font-weight:600; color:#0F172A;">✉️ Registered Email</div>
            <div style="font-size:0.82rem; color:#475569; font-weight:500; font-family:monospace; margin-top:2px;">${channelsData.emailMasked || 'Your registered email'}</div>
          </div>
        </label>

        ${hasPhone ? `
        <label id="optSmsCard" style="display:flex; align-items:center; gap:12px; padding:14px 16px; border:2px solid #E2E8F0; background:#FFFFFF; border-radius:12px; cursor:pointer; transition:all 0.15s;">
          <input type="radio" name="pinResetChannel" value="sms" style="accent-color:#059669; width:18px; height:18px;" />
          <div style="flex:1;">
            <div style="font-size:0.9rem; font-weight:600; color:#0F172A;">📱 Phone Number (SMS)</div>
            <div style="font-size:0.82rem; color:#475569; font-weight:500; font-family:monospace; margin-top:2px;">${channelsData.phoneMasked}</div>
          </div>
        </label>
        ` : `
        <div style="padding:10px 14px; background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:10px; font-size:0.8rem; color:#64748B; line-height:1.45;">
          ℹ️ No mobile phone number is linked to your account. The code will be sent to your registered email.
        </div>
        `}
      </div>

      <div style="display:flex; gap:10px;">
        <button type="button" id="btnCancelReset" style="flex:1; padding:12px 16px; background:#F1F5F9; color:#475569; font-size:0.9rem; font-weight:600; border-radius:10px; border:none; cursor:pointer;">
          Cancel
        </button>
        <button type="button" id="btnSendResetCode" style="flex:1.6; padding:12px 18px; background:#059669; color:#FFFFFF; font-size:0.9rem; font-weight:600; border-radius:10px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
          Send Code &rarr;
        </button>
      </div>
    `;

    card.querySelector('#btnResetClose').onclick = close;
    card.querySelector('#btnCancelReset').onclick = close;

    const emailCard = card.querySelector('#optEmailCard');
    const smsCard = card.querySelector('#optSmsCard');
    const radios = card.querySelectorAll('input[name="pinResetChannel"]');

    radios.forEach(radio => {
      radio.onchange = () => {
        resetState.selectedChannel = radio.value;
        if (radio.value === 'email') {
          emailCard.style.borderColor = '#059669';
          emailCard.style.background = '#F0FDF4';
          if (smsCard) {
            smsCard.style.borderColor = '#E2E8F0';
            smsCard.style.background = '#FFFFFF';
          }
        } else {
          emailCard.style.borderColor = '#E2E8F0';
          emailCard.style.background = '#FFFFFF';
          if (smsCard) {
            smsCard.style.borderColor = '#059669';
            smsCard.style.background = '#F0FDF4';
          }
        }
      };
    });

    const sendBtn = card.querySelector('#btnSendResetCode');
    const errEl = card.querySelector('#resetChannelError');

    sendBtn.onclick = async () => {
      sendBtn.disabled = true;
      sendBtn.innerHTML = `Sending...`;
      errEl.style.display = 'none';

      try {
        const token = await window.getClerkToken();
        const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'send_reset_otp',
            channel: resetState.selectedChannel,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to send verification code');
        }

        resetState.targetMasked = data.destinationMasked || (resetState.selectedChannel === 'email' ? channelsData.emailMasked : channelsData.phoneMasked);
        renderOtpStep();
      } catch (err) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `Send Code &rarr;`;
        errEl.textContent = err.message || 'Failed to send code. Please try again.';
        errEl.style.display = 'block';
      }
    };
  }

  // View: Step 2 - Enter 6-digit OTP
  function renderOtpStep() {
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <button type="button" id="btnBackToChannels" style="background:none; border:none; color:#059669; font-size:0.84rem; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:4px; padding:0;">
          &larr; Change Method
        </button>
        <button type="button" id="btnResetClose2" style="background:none; border:none; color:#94A3B8; font-size:22px; cursor:pointer; line-height:1; padding:4px;">&times;</button>
      </div>

      <h3 style="font-size:1.25rem; font-weight:700; color:#0F172A; margin:0 0 6px 0;">Enter Verification Code</h3>
      <p style="font-size:0.86rem; color:#64748B; margin:0 0 20px 0; line-height:1.5;">
        We sent a 6-digit code to <br><strong style="color:#0F172A; font-family:monospace; font-size:0.92rem;">${resetState.targetMasked}</strong>
      </p>

      <form id="otpVerifyForm" onsubmit="return false;">
        <div style="display:flex; gap:8px; justify-content:center; margin-bottom:16px;" id="otpBoxesContainer">
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="otp-box" data-idx="0" style="width:44px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="otp-box" data-idx="1" style="width:44px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="otp-box" data-idx="2" style="width:44px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="otp-box" data-idx="3" style="width:44px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="otp-box" data-idx="4" style="width:44px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
          <input type="password" inputmode="numeric" maxlength="1" autocomplete="off" class="otp-box" data-idx="5" style="width:44px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
        </div>

        <div id="otpVerifyError" style="display:none; padding:10px 12px; background:#FEF2F2; border:1px solid #FCA5A5; color:#B91C1C; font-size:0.82rem; border-radius:10px; margin-bottom:16px; text-align:center; font-weight:500;"></div>

        <div style="margin-bottom:20px; font-size:0.82rem; color:#64748B;">
          Didn't receive code? <button type="button" id="btnResendOtp" style="background:none; border:none; padding:0; color:#059669; font-weight:600; cursor:pointer;" disabled>Resend in <span id="resendCountdown">60</span>s</button>
        </div>

        <div style="display:flex; gap:10px;">
          <button type="button" id="btnCancelOtp" style="flex:1; padding:12px 16px; background:#F1F5F9; color:#475569; font-size:0.9rem; font-weight:600; border-radius:10px; border:none; cursor:pointer;">
            Cancel
          </button>
          <button type="submit" id="btnVerifyOtp" style="flex:1.6; padding:12px 18px; background:#059669; color:#FFFFFF; font-size:0.9rem; font-weight:600; border-radius:10px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            Verify Code
          </button>
        </div>
      </form>
    `;

    card.querySelector('#btnResetClose2').onclick = close;
    card.querySelector('#btnCancelOtp').onclick = close;
    card.querySelector('#btnBackToChannels').onclick = () => renderChannelStep(resetState.channelsData);

    resetState.resendCooldown = 60;
    const resendBtn = card.querySelector('#btnResendOtp');
    const countdownSpan = card.querySelector('#resendCountdown');

    if (resetState.resendInterval) clearInterval(resetState.resendInterval);
    resetState.resendInterval = setInterval(() => {
      resetState.resendCooldown -= 1;
      if (resetState.resendCooldown <= 0) {
        clearInterval(resetState.resendInterval);
        resendBtn.disabled = false;
        resendBtn.innerHTML = `Resend Code`;
      } else {
        if (countdownSpan) countdownSpan.textContent = resetState.resendCooldown;
      }
    }, 1000);

    resendBtn.onclick = async () => {
      resendBtn.disabled = true;
      resendBtn.innerHTML = `Sending...`;
      try {
        const token = await window.getClerkToken();
        const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'send_reset_otp',
            channel: resetState.selectedChannel,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to resend code');
        if (window.showToast) window.showToast('Verification code resent!', 'success');
        resetState.resendCooldown = 60;
        resendBtn.innerHTML = `Resend in <span id="resendCountdown">60</span>s`;
        const newCountdown = card.querySelector('#resendCountdown');
        resetState.resendInterval = setInterval(() => {
          resetState.resendCooldown -= 1;
          if (resetState.resendCooldown <= 0) {
            clearInterval(resetState.resendInterval);
            resendBtn.disabled = false;
            resendBtn.innerHTML = `Resend Code`;
          } else {
            if (newCountdown) newCountdown.textContent = resetState.resendCooldown;
          }
        }, 1000);
      } catch (err) {
        resendBtn.disabled = false;
        resendBtn.innerHTML = `Resend Code`;
        const errEl = card.querySelector('#otpVerifyError');
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    };

    const otpBoxes = Array.from(card.querySelectorAll('.otp-box'));
    otpBoxes.forEach((box, i) => {
      box.addEventListener('focus', () => {
        box.style.borderColor = '#10B981';
        box.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
        box.style.background = '#FFFFFF';
      });
      box.addEventListener('blur', () => {
        box.style.borderColor = '#CBD5E1';
        box.style.boxShadow = 'none';
        box.style.background = '#F8FAFC';
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (!box.value && i > 0) {
            otpBoxes[i - 1].focus();
            otpBoxes[i - 1].value = '';
          }
        } else if (e.key === 'ArrowLeft' && i > 0) {
          otpBoxes[i - 1].focus();
        } else if (e.key === 'ArrowRight' && i < otpBoxes.length - 1) {
          otpBoxes[i + 1].focus();
        } else if (!/^[0-9]$/.test(e.key) && !['Tab', 'Delete'].includes(e.key)) {
          e.preventDefault();
        }
      });
      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '');
        if (box.value.length >= 1) {
          box.value = box.value.slice(-1);
          if (i < otpBoxes.length - 1) {
            otpBoxes[i + 1].focus();
          }
        }
      });
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        if (text.length >= 6) {
          for (let j = 0; j < 6; j++) {
            otpBoxes[j].value = text[j] || '';
          }
          otpBoxes[5].focus();
        }
      });
    });

    setTimeout(() => otpBoxes[0]?.focus(), 150);

    const otpForm = card.querySelector('#otpVerifyForm');
    const verifyBtn = card.querySelector('#btnVerifyOtp');
    const errEl = card.querySelector('#otpVerifyError');

    otpForm.onsubmit = async () => {
      const code = otpBoxes.map(b => b.value).join('');
      if (code.length !== 6) {
        errEl.textContent = 'Please enter the complete 6-digit code.';
        errEl.style.display = 'block';
        return;
      }

      verifyBtn.disabled = true;
      verifyBtn.innerHTML = `Verifying...`;
      errEl.style.display = 'none';

      try {
        const token = await window.getClerkToken();
        const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'verify_reset_otp',
            otp: code,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Verification failed');
        }

        if (resetState.resendInterval) clearInterval(resetState.resendInterval);
        resetState.resetToken = data.resetToken;
        renderNewPinStep();
      } catch (err) {
        verifyBtn.disabled = false;
        verifyBtn.innerHTML = `Verify Code`;
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    };
  }

  // View: Step 3 - Set & Confirm New 4-digit PIN
  function renderNewPinStep() {
    card.innerHTML = `
      <div style="width:48px; height:48px; border-radius:14px; background:#ECFDF5; color:#059669; display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
      </div>

      <h3 style="font-size:1.25rem; font-weight:700; color:#0F172A; margin:0 0 6px 0;">Set New Transaction PIN</h3>
      <p style="font-size:0.86rem; color:#64748B; margin:0 0 20px 0; line-height:1.5;">
        Enter a secure 4-digit PIN to authorize future transfers and withdrawals.
      </p>

      <form id="newPinForm" onsubmit="return false;">
        <div style="margin-bottom:16px; text-align:left;">
          <label style="display:block; font-size:0.82rem; font-weight:600; color:#334155; margin-bottom:8px;">New 4-Digit PIN</label>
          <div style="display:flex; gap:10px; justify-content:center;" id="newPinBoxes">
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-new" data-idx="0" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-new" data-idx="1" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-new" data-idx="2" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-new" data-idx="3" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
          </div>
        </div>

        <div style="margin-bottom:20px; text-align:left;">
          <label style="display:block; font-size:0.82rem; font-weight:600; color:#334155; margin-bottom:8px;">Confirm New PIN</label>
          <div style="display:flex; gap:10px; justify-content:center;" id="confirmPinBoxes">
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-confirm" data-idx="0" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-confirm" data-idx="1" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-confirm" data-idx="2" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
            <input type="password" inputmode="numeric" maxlength="1" class="pin-box-confirm" data-idx="3" style="width:48px; height:52px; font-size:22px; text-align:center; font-weight:700; border-radius:10px; border:1.5px solid #CBD5E1; background:#F8FAFC; outline:none; transition:all 0.2s;" />
          </div>
        </div>

        <div id="newPinResetError" style="display:none; padding:10px 12px; background:#FEF2F2; border:1px solid #FCA5A5; color:#B91C1C; font-size:0.82rem; border-radius:10px; margin-bottom:16px; text-align:center; font-weight:500;"></div>

        <div style="display:flex; gap:10px;">
          <button type="button" id="btnCancelNewPin" style="flex:1; padding:12px 16px; background:#F1F5F9; color:#475569; font-size:0.9rem; font-weight:600; border-radius:10px; border:none; cursor:pointer;">
            Cancel
          </button>
          <button type="submit" id="btnSaveNewPin" style="flex:1.6; padding:12px 18px; background:#059669; color:#FFFFFF; font-size:0.9rem; font-weight:600; border-radius:10px; border:none; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            Save &amp; Activate PIN
          </button>
        </div>
      </form>
    `;

    card.querySelector('#btnCancelNewPin').onclick = close;

    const setupBoxList = (boxes) => {
      boxes.forEach((box, i) => {
        box.addEventListener('focus', () => {
          box.style.borderColor = '#10B981';
          box.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.15)';
          box.style.background = '#FFFFFF';
        });
        box.addEventListener('blur', () => {
          box.style.borderColor = '#CBD5E1';
          box.style.boxShadow = 'none';
          box.style.background = '#F8FAFC';
        });
        box.addEventListener('keydown', (e) => {
          if (e.key === 'Backspace') {
            if (!box.value && i > 0) {
              boxes[i - 1].focus();
              boxes[i - 1].value = '';
            }
          } else if (e.key === 'ArrowLeft' && i > 0) {
            boxes[i - 1].focus();
          } else if (e.key === 'ArrowRight' && i < boxes.length - 1) {
            boxes[i + 1].focus();
          } else if (!/^[0-9]$/.test(e.key) && !['Tab', 'Delete'].includes(e.key)) {
            e.preventDefault();
          }
        });
        box.addEventListener('input', () => {
          box.value = box.value.replace(/\D/g, '');
          if (box.value.length >= 1) {
            box.value = box.value.slice(-1);
            if (i < boxes.length - 1) {
              boxes[i + 1].focus();
            }
          }
        });
      });
    };

    const newBoxes = Array.from(card.querySelectorAll('.pin-box-new'));
    const confirmBoxes = Array.from(card.querySelectorAll('.pin-box-confirm'));
    setupBoxList(newBoxes);
    setupBoxList(confirmBoxes);

    setTimeout(() => newBoxes[0]?.focus(), 150);

    const form = card.querySelector('#newPinForm');
    const saveBtn = card.querySelector('#btnSaveNewPin');
    const errEl = card.querySelector('#newPinResetError');

    form.onsubmit = async () => {
      const p1 = newBoxes.map(b => b.value).join('');
      const p2 = confirmBoxes.map(b => b.value).join('');

      if (p1.length !== 4) {
        errEl.textContent = 'Please enter your complete 4-digit new PIN.';
        errEl.style.display = 'block';
        return;
      }
      if (p2.length !== 4) {
        errEl.textContent = 'Please confirm your 4-digit new PIN.';
        errEl.style.display = 'block';
        return;
      }
      if (p1 !== p2) {
        errEl.textContent = 'The two PIN entries do not match. Please re-enter.';
        errEl.style.display = 'block';
        return;
      }

      saveBtn.disabled = true;
      saveBtn.innerHTML = `Saving PIN...`;
      errEl.style.display = 'none';

      try {
        const token = await window.getClerkToken();
        const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'reset_pin_with_token',
            resetToken: resetState.resetToken,
            newPin: p1,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to set new PIN');
        }

        renderSuccessStep();
      } catch (err) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `Save &amp; Activate PIN`;
        errEl.textContent = err.message;
        errEl.style.display = 'block';
      }
    };
  }

  // View: Step 4 - Success
  function renderSuccessStep() {
    card.innerHTML = `
      <div style="width:56px; height:56px; border-radius:50%; background:#ECFDF5; color:#059669; display:flex; align-items:center; justify-content:center; margin:0 auto 16px auto;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>

      <h3 style="font-size:1.3rem; font-weight:700; color:#0F172A; margin:0 0 8px 0;">Transaction PIN Activated!</h3>
      <p style="font-size:0.88rem; color:#64748B; margin:0 0 24px 0; line-height:1.55;">
        Your new 4-digit PIN is active and your wallet has been unlocked. You can now authorize transfers and withdrawals.
      </p>

      <button type="button" id="btnDoneReset" style="width:100%; padding:12px 18px; background:#059669; color:#FFFFFF; font-size:0.92rem; font-weight:600; border-radius:10px; border:none; cursor:pointer;">
        Done &rarr;
      </button>
    `;

    card.querySelector('#btnDoneReset').onclick = () => {
      close();
      if (typeof options.onSuccess === 'function') {
        options.onSuccess();
      } else {
        if (window.location.pathname.includes('/wallet') || window.location.pathname.includes('/settings/account')) {
          window.location.reload();
        }
      }
    };
  }

  // Start by loading options
  renderLoading('Checking security verification options...');

  (async () => {
    try {
      const token = await window.getClerkToken();
      const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'get_reset_channels' }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'WALLET_FROZEN' || data.is_frozen) {
          card.innerHTML = `
            <div style="padding: 20px 10px;">
              <div style="width:48px; height:48px; border-radius:50%; background:#FEE2E2; color:#DC2626; display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <h3 style="font-size:1.2rem; color:#991B1B; font-weight:700; margin:0 0 6px 0;">Wallet is Frozen</h3>
              <p style="font-size:0.86rem; color:#64748B; margin:0 0 22px 0; line-height:1.5;">${data.error || 'Your wallet has been frozen due to 3 incorrect attempts. You cannot reset your PIN. Please contact support to submit an appeal.'}</p>
              <div style="display:flex; gap:10px; justify-content:center;">
                <button type="button" id="btnErrClose" style="padding:10px 18px; background:#F1F5F9; color:#475569; font-size:0.88rem; font-weight:600; border-radius:8px; border:none; cursor:pointer;">Close</button>
                <a href="mailto:support@taska.com.ng?subject=Wallet%20Unfreeze%20Appeal&body=Hello%20Taska%20Security%20Team,%0A%0AMy%20wallet%20has%20been%20frozen%20due%20to%20failed%20PIN%20attempts.%20I%20would%20like%20to%20request%20an%20unfreeze%20review.%0A%0AAccount%20Email:%20" style="padding:10px 20px; background:#DC2626; color:#FFF; font-size:0.88rem; font-weight:600; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">Contact Support to Appeal &rarr;</a>
              </div>
            </div>
          `;
          card.querySelector('#btnErrClose').onclick = close;
          return;
        }
        throw new Error(data.error || 'Failed to retrieve reset channels');
      }

      renderChannelStep(data);
    } catch (err) {
      card.innerHTML = `
        <div style="padding: 20px 10px;">
          <div style="width:48px; height:48px; border-radius:50%; background:#FEE2E2; color:#DC2626; display:flex; align-items:center; justify-content:center; margin:0 auto 14px auto;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h3 style="font-size:1.15rem; color:#0F172A; margin:0 0 6px 0;">Error Loading Options</h3>
          <p style="font-size:0.86rem; color:#64748B; margin:0 0 20px 0;">${err.message || 'Unable to check reset options at this time.'}</p>
          <button type="button" id="btnErrClose" style="padding:10px 20px; background:#F1F5F9; color:#475569; font-size:0.88rem; font-weight:600; border-radius:8px; border:none; cursor:pointer;">Close</button>
        </div>
      `;
      card.querySelector('#btnErrClose').onclick = close;
    }
  })();
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

    const isDanger = icon === 'danger' || icon === 'error';
    const isCheck = icon === 'check' || icon === 'success';
    const iconBg = isDanger ? '#FEE2E2' : '#E6F4EA';
    const iconColor = isDanger ? '#DC2626' : '#059669';
    let iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    if (isDanger) {
      iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else if (isCheck) {
      iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    }

    const card = document.createElement('div');
    card.className = 'taska-dialog-card';
    card.style.cssText = `
      background: var(--paper, #ffffff); border-radius: var(--radius-md, 16px);
      max-width: 420px; width: 100%; padding: 26px; border: 1px solid var(--line, #e2e8f0);
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28); text-align: center;
      transform: scale(0.92); transition: transform 0.2s ease;
    `;

    card.innerHTML = `
      <div style="width: 52px; height: 52px; border-radius: 50%; background: ${iconBg}; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
        ${iconSvg}
      </div>
      <h3 style="font-size: 1.25rem; color: var(--green-900, #064E3B); margin: 0 0 8px 0; font-weight: 700;">${window.escapeHtml ? window.escapeHtml(title) : title}</h3>
      <p style="font-size: 0.92rem; color: var(--ink-soft, #4B5563); line-height: 1.55; margin: 0 0 24px 0;">${window.escapeHtml ? window.escapeHtml(message).replace(/\\n/g, '<br>') : message}</p>
      <button type="button" class="btn ${isDanger ? 'btn-danger' : 'btn-primary'} taska-ok-btn" style="min-width: 140px; ${isDanger ? 'background:#DC2626; border-color:#DC2626;' : ''}">${window.escapeHtml ? window.escapeHtml(btnText) : btnText}</button>
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
    // Do not intercept clicks on the sidebar user button / mode switcher
    if (target.closest('#sidebar-user-btn') || target.closest('.sidebar-user') || target.closest('#sidebar-switcher-menu')) {
      return;
    }

    const isClickable = target.closest('#mobile-avatar') || 
                        target.closest('.applicant-avatar') || 
                        target.closest('.profile-avatar-large') || 
                        target.closest('.profile-avatar') || 
                        target.closest('#settings-avatar-preview') || 
                        target.closest('#chat-messages-body') ||
                        target.closest('.taska-chat-media-wrap') ||
                        target.closest('.task-media-thumb') ||
                        target.classList.contains('chat-attached-image') ||
                        target.classList.contains('lightbox-img');

    if (isClickable) {
      const src = target.getAttribute('src');
      if (src && !src.startsWith('data:image/svg')) {
        e.preventDefault();
        e.stopPropagation();
        window.openImageLightbox(src, target.alt || 'Attachment Preview');
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

// ── Tasker Phone Verification Modal & Enforcer ────────────────────────────────
function ensureTermiiScriptLoaded() {
  const isLoaded = () => Boolean(
    window.parseNigerianPhone && 
    (window.openPhoneVerificationModal || window.openPhoneOtpModal)
  );
  if (isLoaded()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="termii-otp.js"]');
    if (existing) {
      let waitCount = 0;
      const interval = setInterval(() => {
        if (isLoaded() || ++waitCount > 50) {
          clearInterval(interval);
          resolve();
        }
      }, 50);
      return;
    }
    const script = document.createElement('script');
    script.src = '/js/termii-otp.js?v=27';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load phone verification service.'));
    document.head.appendChild(script);
  });
}

window.promptAddPhoneNumberModal = async function (onSuccessCallback) {
  try {
    await ensureTermiiScriptLoaded();
  } catch (err) {
    console.error('Termii load error:', err);
    if (window.showToast) window.showToast('Unable to initialize phone verification. Please check your internet connection.', 'error');
    return;
  }

  let profile = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
  if (!profile) {
    try {
      const c = localStorage.getItem('taska_cached_profile');
      if (c) profile = JSON.parse(c);
    } catch (_) {}
  }
  if (!profile && window.ensureTaskaProfile) {
    profile = await window.ensureTaskaProfile();
  }
  if (!profile) {
    if (window.showToast) window.showToast('Please wait for account profile to finish loading.', 'info');
    return;
  }

  // Remove any existing instance
  const existing = document.getElementById('taska-add-phone-modal');
  if (existing) existing.remove();

  const modalHtml = `
    <div id="taska-add-phone-modal" style="position:fixed; inset:0; z-index:999998; background:rgba(18, 32, 26, 0.65); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; opacity:0; transition:opacity 0.2s ease;">
      <div style="background:var(--surface, #ffffff); border:1px solid var(--line, #e2e8f0); border-radius:20px; max-width:440px; width:100%; padding:28px 24px; box-shadow:0 24px 50px rgba(18,32,26,0.2); position:relative; transform:scale(0.95); transition:transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
        
        <button type="button" id="add-phone-close-btn" style="position:absolute; top:16px; right:16px; background:var(--bg-soft, #f8fafc); border:1px solid var(--line, #e2e8f0); width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--muted); font-size:16px; transition:all 0.15s ease;">✕</button>

        <div style="text-align:center; margin-bottom:20px;">
          <div style="width:54px; height:54px; border-radius:16px; background:#ECFDF5; color:var(--green-700); display:inline-flex; align-items:center; justify-content:center; margin-bottom:14px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </div>
          <h3 style="font-family:'Space Grotesk', -apple-system, sans-serif; font-size:1.3rem; font-weight:700; color:var(--green-900); margin:0 0 8px 0;">Add Phone Number</h3>
          <p style="font-size:0.86rem; color:var(--muted); margin:0; line-height:1.5;">
            To activate <strong>Tasker Mode</strong> and browse or apply for tasks, you must add and verify an active Nigerian mobile number.
          </p>
        </div>

        <form id="add-phone-form">
          <div style="margin-bottom:16px;">
            <label style="display:block; font-size:0.82rem; font-weight:600; color:var(--body); margin-bottom:6px;">Mobile Phone Number</label>
            <div style="display:flex; align-items:center; border:1.5px solid var(--line, #e2e8f0); border-radius:10px; background:var(--surface, #fff); overflow:hidden; transition:border-color 0.15s ease;" id="add-phone-wrap">
              <span style="padding:0 12px; font-weight:600; font-size:0.9rem; color:var(--muted); background:var(--bg-soft, #f8fafc); border-right:1px solid var(--line, #e2e8f0); line-height:42px;">+234</span>
              <input type="tel" id="add-phone-input" placeholder="80X XXX XXXX" maxlength="16" required autofocus
                     style="flex:1; border:none; outline:none; padding:10px 12px; font-size:0.95rem; background:transparent;">
            </div>
            <span id="add-phone-error" style="display:none; color:#DC2626; font-size:0.8rem; margin-top:6px;"></span>
          </div>

          <button type="submit" id="add-phone-submit-btn" class="btn btn-primary btn-block" style="width:100%; padding:12px; font-weight:600; border-radius:10px; font-size:0.92rem;">
            Send SMS Verification Code
          </button>
        </form>

        <p style="text-align:center; margin-top:16px; margin-bottom:0; font-size:0.78rem; color:var(--muted);">
          Protected with end-to-end SMS verification. No spam.
        </p>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const modalEl = document.getElementById('taska-add-phone-modal');
  const modalBox = modalEl.firstElementChild;
  const inputEl = document.getElementById('add-phone-input');
  const errorEl = document.getElementById('add-phone-error');
  const formEl = document.getElementById('add-phone-form');
  const submitBtn = document.getElementById('add-phone-submit-btn');
  const closeBtn = document.getElementById('add-phone-close-btn');

  requestAnimationFrame(() => {
    modalEl.style.opacity = '1';
    modalBox.style.transform = 'scale(1)';
  });

  const closeModal = () => {
    modalEl.style.opacity = '0';
    modalBox.style.transform = 'scale(0.95)';
    setTimeout(() => modalEl.remove(), 200);
  };

  closeBtn.addEventListener('click', closeModal);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });

  inputEl.addEventListener('input', () => {
    errorEl.style.display = 'none';
    let v = inputEl.value.trim();
    if (v.startsWith('+234')) v = v.slice(4);
    else if (v.startsWith('234') && v.length > 10) v = v.slice(3);
    inputEl.value = v;
  });

  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.style.display = 'none';

    const parseFn = window.parseNigerianPhone;
    const parsed = parseFn ? parseFn(inputEl.value.trim()) : null;

    if (!parsed || !parsed.isValid) {
      errorEl.textContent = parsed?.error || 'Please enter a valid 11-digit Nigerian phone number.';
      errorEl.style.display = 'block';
      inputEl.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking availability…';

    try {
      // 1. Check if phone is already taken by another profile in Supabase
      if (window.supabaseClient) {
        try {
          const { data: match } = await window.supabaseClient
            .from('Profile')
            .select('id, username')
            .ilike('phone', `%${parsed.core10}`)
            .maybeSingle();

          if (match) {
            errorEl.textContent = 'This phone number is already registered to an existing Taska account.';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send SMS Verification Code';
            inputEl.focus();
            return;
          }
        } catch (dbErr) {
          console.warn('Phone uniqueness check notice:', dbErr);
        }
      }

      const openFn = window.openPhoneVerificationModal || window.openPhoneOtpModal;
      if (typeof openFn !== 'function') {
        throw new Error('Phone verification service is still initializing. Please click Send SMS again.');
      }

      // Close the number entry modal ONLY NOW right before opening the OTP modal
      closeModal();

      const clerkUser = window.Clerk?.user;
      const userId = clerkUser ? clerkUser.id : profile.userId;

      // 2. Open Termii 6-digit SMS verification modal
      openFn({
        phone: parsed.termiiFormat,
        userId: userId,
        profileId: profile.id,
        onChangeNumber: () => {
          window.promptAddPhoneNumberModal(onSuccessCallback);
        },
        onVerified: async (verifyRes) => {
          try {
            // Update Supabase profile
            if (window.supabaseClient) {
              const { error: updErr } = await window.supabaseClient
                .from('Profile')
                .update({
                  phone: parsed.canonical,
                  isPhoneVerified: true,
                  phoneVerifiedAt: new Date().toISOString()
                })
                .eq('id', profile.id);

              if (updErr) {
                console.error('Failed to update phone in Profile:', updErr);
              }
            }

            // Update in-memory and cached profile
            profile.phone = parsed.canonical;
            profile.isPhoneVerified = true;
            profile.phoneVerifiedAt = new Date().toISOString();
            window.__taskaProfile = profile;

            try {
              localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
            } catch (_) {}

            // Update Clerk unsafe metadata
            if (window.Clerk?.user?.update) {
              await window.Clerk.user.update({
                unsafeMetadata: {
                  ...window.Clerk.user.unsafeMetadata,
                  phone: parsed.canonical,
                  isPhoneVerified: true
                }
              }).catch(() => {});
            }

            // Re-populate sidebar and live profile cards with the updated phone
            if (typeof populateSidebar === 'function') {
              populateSidebar(profile);
            }

            if (window.showToast) {
              window.showToast('Phone number verified! Tasker capabilities unlocked.', 'success');
            }

            // Run callback (e.g. switchTaskaRole('TASKER') or openProfileSetupModal('TASKER'))
            if (typeof onSuccessCallback === 'function') {
              onSuccessCallback(profile);
            }
          } catch (finErr) {
            console.error('Post-phone-verification notice:', finErr);
          }
        },
        onCancel: () => {
          if (window.showToast) {
            window.showToast('A verified phone number is required to use Tasker mode.', 'info');
          }
        }
      });

    } catch (err) {
      console.error('Phone check error:', err);
      modalEl.style.opacity = '1';
      modalBox.style.transform = 'scale(1)';
      errorEl.textContent = err.message || 'An error occurred. Please try again.';
      errorEl.style.display = 'block';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send SMS Verification Code';
    }
  });
};

// ── Global Wallet Unfreeze Appeal Modal ──────────────────────────────────────

window.openWalletAppealModal = function(opts = {}) {
  // 1. If in-page #wallet-appeal-modal exists (e.g. on /wallet page)
  const inPageModal = document.getElementById('wallet-appeal-modal');
  if (inPageModal) {
    const profile = window._currentProfile || window._currentUserProfile;
    const email = profile?.email || opts.email || 'Your registered email';
    const emailEl = document.getElementById('appeal-account-email');
    if (emailEl) emailEl.textContent = email;
    inPageModal.style.display = 'flex';
    inPageModal.classList.add('is-open');
    return;
  }

  // 2. Otherwise, create a clean floating modal on the current page
  let modal = document.getElementById('global-wallet-appeal-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'global-wallet-appeal-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:999999; display:flex; align-items:center; justify-content:center; padding:20px; backdrop-filter:blur(4px);';
    document.body.appendChild(modal);
  }

  const profile = window._currentUserProfile || {};
  const email = profile.email || opts.email || 'Your registered email';
  const userId = profile.id || opts.userId || '—';
  const subject = encodeURIComponent('Wallet Unfreeze Appeal');
  const bodyText = `Hello Taska Support Team,

My wallet has been automatically frozen due to 3 consecutive incorrect Transaction PIN attempts.
I would like to request an unfreeze review and identity verification to restore access to my account.

Account Details:
- Registered Email: ${email}
- User ID: ${userId}
- Request Date: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}

Thank you.`;

  modal.innerHTML = `
    <div style="background:#FFFFFF; border-radius:18px; max-width:500px; width:100%; max-height:90vh; overflow-y:auto; padding:26px; border:1px solid #E2E8F0; box-shadow:0 20px 50px rgba(0,0,0,0.3); position:relative; box-sizing:border-box; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:42px; height:42px; border-radius:12px; background:#FEE2E2; color:#DC2626; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <h3 style="font-size:1.18rem; margin:0; color:#1E293B; font-weight:700;">Wallet Unfreeze Appeal</h3>
            <div style="font-size:0.78rem; color:#64748B; margin-top:2px;">Taska Trust &amp; Security Desk</div>
          </div>
        </div>
        <button type="button" id="btnGlobalAppealClose" style="background:none; border:none; font-size:1.3rem; cursor:pointer; color:#94A3B8; padding:4px; line-height:1;">✕</button>
      </div>

      <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:12px; padding:12px 14px; margin-bottom:16px; font-size:0.84rem; color:#991B1B; line-height:1.45;">
        <strong>Your wallet is locked for security</strong> due to 3 consecutive incorrect Transaction PIN attempts. Please submit your appeal to our security desk below.
      </div>

      <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:12px 14px; margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; margin-bottom:6px;">
          <span style="color:#64748B;">Registered Email:</span>
          <strong style="color:#0F172A; font-family:monospace;">${email}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem;">
          <span style="color:#64748B;">Status:</span>
          <span style="display:inline-flex; align-items:center; gap:5px; font-weight:700; color:#DC2626; font-size:0.75rem; background:#FEE2E2; padding:3px 8px; border-radius:6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"/></svg>
            FROZEN
          </span>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <a id="btnGlobalSendMailto" href="mailto:support@taska.com.ng?subject=${subject}&body=${encodeURIComponent(bodyText)}" class="btn-send-mailto" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; font-size:0.9rem; font-weight:600; background:#DC2626; color:#FFF; text-decoration:none; border-radius:10px; box-shadow:0 4px 12px rgba(220,38,38,0.3); cursor:pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          Send Email Appeal
        </a>

        <button type="button" id="btnGlobalCopySupport" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px; font-size:0.84rem; font-weight:500; background:#FFF; color:#475569; border:1px dashed #CBD5E1; border-radius:10px; cursor:pointer;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span id="btnGlobalCopySupportText">Copy Support Email (support@taska.com.ng)</span>
        </button>
      </div>
    </div>
  `;

  modal.querySelector('#btnGlobalAppealClose').onclick = () => { modal.style.display = 'none'; };
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
  const globalSendMailto = modal.querySelector('#btnGlobalSendMailto');
  if (globalSendMailto) {
    globalSendMailto.onclick = (e) => {
      e.stopPropagation();
      window.location.href = `mailto:support@taska.com.ng?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
    };
  }
  modal.querySelector('#btnGlobalCopySupport').onclick = async () => {
    try {
      await navigator.clipboard.writeText('support@taska.com.ng');
      const textSpan = modal.querySelector('#btnGlobalCopySupportText');
      if (textSpan) textSpan.textContent = '✓ Copied support@taska.com.ng!';
      if (window.showToast) window.showToast('Support email copied to clipboard!', 'success');
      setTimeout(() => {
        if (textSpan) textSpan.textContent = 'Copy Support Email (support@taska.com.ng)';
      }, 3000);
    } catch {
      if (window.showToast) window.showToast('Please email support@taska.com.ng');
    }
  };
  modal.style.display = 'flex';
};

// Global click delegation for all appeal buttons/links across the site
document.addEventListener('click', (e) => {
  // Never intercept the actual send-mailto action!
  if (e.target.closest('#btn-appeal-send-mailto, .btn-send-mailto, #btnGlobalSendMailto')) {
    return;
  }

  const trigger = e.target.closest('.btn-wallet-appeal-trigger, #btn-wallet-appeal, [data-action="wallet-appeal"]');
  if (trigger) {
    e.preventDefault();
    if (typeof window.openWalletAppealModal === 'function') {
      window.openWalletAppealModal();
    } else if (typeof window.showWalletFrozenAppealModal === 'function') {
      window.showWalletFrozenAppealModal();
    }
  }
});

// Boot auth guard on DOMReady
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAuthGuard);
} else {
  runAuthGuard();
}
