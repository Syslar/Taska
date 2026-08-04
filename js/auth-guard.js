/* ==========================================================================
   auth-guard.js — Shared Clerk session guard + sidebar population.
   Include this AFTER Clerk JS on every protected app page.
   ========================================================================== */

const API_BASE = 'http://localhost:4000/api/v1';

// Expose so other page scripts can use the token without re-fetching
window.__taskaToken = null;
window.__taskaProfile = null;

window.getTaskaToken = async function () {
  if (window.__taskaToken) return window.__taskaToken;
  if (!window.Clerk?.session) return null;
  try {
    window.__taskaToken = await window.Clerk.session.getToken();
  } catch (err) {
    console.warn('getTaskaToken error:', err);
  }
  return window.__taskaToken;
};

window.getTaskaProfile = function () {
  return window.__taskaProfile;
};

// Populate every sidebar / mobile topbar on the page with real user data
function populateSidebar(profile) {
  if (!profile) return;
  const initials = `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || '--';
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User';
  const roleLabel = profile.role === 'TASKER' ? 'Tasker' : profile.role === 'POSTER' ? 'Task Poster' : profile.role || '';

  // Sidebar desktop
  const avatarEl   = document.getElementById('sidebar-avatar');
  const nameEl     = document.getElementById('sidebar-name');
  const roleEl     = document.getElementById('sidebar-role');
  const mobileAv   = document.getElementById('mobile-avatar');

  if (avatarEl)  avatarEl.textContent  = initials;
  if (nameEl)    nameEl.textContent    = fullName;
  if (roleEl)    roleEl.textContent    = roleLabel;
  if (mobileAv)  mobileAv.textContent  = initials;
}

async function runAuthGuard() {
  // 1. Wait for window.Clerk script to be defined (up to 5s)
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
      console.warn('auth-guard: Clerk load notice', err);
    }
  }

  // 3. Check active session
  if (!window.Clerk.session) {
    console.warn('auth-guard: No active Clerk session. Redirecting to login.');
    // Determine relative path to login page (case-insensitive check)
    const isDashboardSubfolder = window.location.pathname.toLowerCase().includes('/app/dashboard/');
    const loginUrl = isDashboardSubfolder ? '../Auth/login.html' : 'App/Auth/login.html';
    window.location.replace(loginUrl);
    return;
  }

  // 4. Obtain token & load backend profile
  try {
    const token = await window.Clerk.session.getToken();
    window.__taskaToken = token;

    const res = await fetch(`${API_BASE}/profiles/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      console.warn('auth-guard: profile fetch returned 401 — token verification notice');
    } else if (res.ok) {
      const json = await res.json();
      window.__taskaProfile = json.profile;
      populateSidebar(json.profile);
    }
  } catch (err) {
    console.warn('auth-guard: profile fetch notice', err);
  }

  // 5. Bind logout button
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

  // 5. Signal that auth guard is ready
  window.__taskaReady = true;
  window.dispatchEvent(new Event('taska:ready'));
}

// Boot auth guard on DOMReady
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runAuthGuard);
} else {
  runAuthGuard();
}
