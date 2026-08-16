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
      }
    }
  } catch (_) {}
})();

window.getTaskaToken = async function () {
  if (window.__taskaToken) return window.__taskaToken;
  if (!window.Clerk?.session) return null;
  try {
    window.__taskaToken = await window.Clerk.session.getToken();
  } catch (_) {}
  return window.__taskaToken;
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
      role: 'POSTER'
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

// Boot auth guard on DOMReady
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAuthGuard);
} else {
  runAuthGuard();
}
