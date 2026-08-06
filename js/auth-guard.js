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
  const roleLabel = profile.role === 'TASKER' ? 'Tasker' : profile.role === 'POSTER' ? 'Task Poster' : profile.role || 'User';

  const avatarEl   = document.getElementById('sidebar-avatar');
  const nameEl     = document.getElementById('sidebar-name');
  const roleEl     = document.getElementById('sidebar-role');
  const mobileAv   = document.getElementById('mobile-avatar');

  if (avatarEl)  avatarEl.textContent  = initials;
  if (nameEl)    nameEl.textContent    = fullName;
  if (roleEl)    roleEl.textContent    = roleLabel;
  if (mobileAv)  mobileAv.textContent  = initials;
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
    const isDashboardSubfolder = window.location.pathname.toLowerCase().includes('/app/dashboard/');
    const loginUrl = isDashboardSubfolder ? '../Auth/login.html' : 'App/Auth/login.html';
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
        const isDashboardSubfolder = window.location.pathname.toLowerCase().includes('/app/dashboard/');
        const loginUrl = isDashboardSubfolder ? '../Auth/login.html' : 'App/Auth/login.html';
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
