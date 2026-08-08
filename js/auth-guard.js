/* ==========================================================================
   auth-guard.js — Shared Clerk session guard + Direct Supabase sync.
   Include this AFTER Clerk JS and supabase-client.js on every protected page.
   ========================================================================== */

window.__taskaToken = null;
window.__taskaProfile = null;

window.getTaskaToken = async function () {
  if (window.__taskaToken) return window.__taskaToken;
  if (!window.Clerk?.session) return null;
  try {
    window.__taskaToken = await window.Clerk.session.getToken();
  } catch (_) {}
  return window.__taskaToken;
};

window.getTaskaProfile = function () {
  return window.__taskaProfile;
};

window.ensureTaskaProfile = async function () {
  if (window.__taskaProfile) return window.__taskaProfile;
  let attempts = 0;
  while (!window.__taskaProfile && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  return window.__taskaProfile;
};

// Populate every sidebar / mobile topbar on the page with real user data
function populateSidebar(profile) {
  if (!profile) return;
  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || 'U';
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User';
  const username = `@${profile.username || 'user'}`;
  const roleLabel = profile.role === 'TASKER' ? 'Tasker' : profile.role === 'POSTER' ? 'Task Poster' : 'Poster & Tasker';

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
  if (nameEl)      nameEl.textContent     = fullName;
  if (usernameEl)  usernameEl.textContent = username;
  if (mobileAv) {
    if (profile.avatarUrl) {
      mobileAv.innerHTML = `<img src="${profile.avatarUrl}" alt="${fullName}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      mobileAv.textContent = initials;
    }
    mobileAv.onclick = () => {
      const isProfileSubfolder = window.location.pathname.toLowerCase().includes('/profile');
      const targetUrl = isProfileSubfolder ? `index.html?id=${profile.id}` : `../Profile/index.html?id=${profile.id}`;
      window.location.href = targetUrl;
    };
  }

  const userBtn = document.getElementById('sidebar-user-btn');
  if (userBtn && profile.id) {
    userBtn.onclick = () => {
      const isProfileSubfolder = window.location.pathname.toLowerCase().includes('/profile');
      const targetUrl = isProfileSubfolder ? `index.html?id=${profile.id}` : `../Profile/index.html?id=${profile.id}`;
      window.location.href = targetUrl;
    };
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
  if (profRating)    profRating.textContent    = `★ ${profile.averageRating != null ? profile.averageRating.toFixed(1) : '5.0'} (${profile.reviewCount || 0} reviews)`;
  if (profVerified)  profVerified.textContent  = profile.isVerified ? '✓ Verified' : 'Standard Member';
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
      return profile;
    }

    // 2. Profile doesn't exist — create Profile + Wallet directly in Supabase
    const firstName = clerkUser.firstName || 'User';
    const lastName = clerkUser.lastName || '';
    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
    const phone = clerkUser.primaryPhoneNumber?.phoneNumber || '';
    const username = clerkUser.username || `user_${Date.now()}`;

    const { data: profile, error: profileErr } = await window.supabaseClient
      .from('Profile')
      .insert({
        userId: clerkUser.id,
        firstName,
        lastName,
        email,
        phone,
        username,
        role: 'POSTER'
      })
      .select()
      .single();

    if (profileErr || !profile) {
      console.error('Failed to create profile in Supabase:', profileErr);
      return null;
    }

    // Create wallet
    const { data: wallet } = await window.supabaseClient
      .from('Wallet')
      .insert({ profileId: profile.id, balance: 0, escrowBalance: 0, lifetimeEarned: 0, lifetimeWithdrawn: 0 })
      .select()
      .single();

    return { ...profile, wallet: wallet || null };

  } catch (err) {
    console.error('Supabase profile sync error:', err);
    return null;
  }
}

async function runAuthGuard() {
  // 1. Wait for window.Clerk script to be defined
  let attempts = 0;
  while (!window.Clerk && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
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
    const isAppSubfolder = window.location.pathname.toLowerCase().includes('/app/');
    const loginUrl = isAppSubfolder ? '../Auth/login.html' : 'App/Auth/login.html';
    window.location.replace(loginUrl);
    return;
  }

  // 4. Ensure Supabase SDK client is ready
  if (window.supabase && window.supabase.createClient && !window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(
      'https://nhittvkskzwpeinscxir.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXR0dmtza3p3cGVpbnNjeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNzY2MzQsImV4cCI6MjA5ODk1MjYzNH0.dII7qIobUbjdAAijn1mYQuu543djIL2sSROY5egQaMc'
    );
  }

  // 5. Load/Sync Supabase profile directly
  const profile = await syncSupabaseProfile(window.Clerk.user);
  if (profile) {
    window.__taskaProfile = profile;
    populateSidebar(profile);
  }

  // 6. Bind logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = async (e) => {
      e.preventDefault();
      try {
        await window.Clerk.signOut();
        const isAppSubfolder = window.location.pathname.toLowerCase().includes('/app/');
        const loginUrl = isAppSubfolder ? '../Auth/login.html' : 'App/Auth/login.html';
        window.location.replace(loginUrl);
      } catch (err) {
        console.error('Logout error:', err);
      }
    };
  }

  // 7. Signal that auth guard is ready
  window.__taskaReady = true;
  window.dispatchEvent(new Event('taska:ready'));
}

// Boot auth guard on DOMReady
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAuthGuard);
} else {
  runAuthGuard();
}
