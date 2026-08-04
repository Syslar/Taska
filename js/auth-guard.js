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
  window.__taskaToken = await window.Clerk.session.getToken();
  return window.__taskaToken;
};

window.getTaskaProfile = function () {
  return window.__taskaProfile;
};

// Populate every sidebar / mobile topbar on the page with real user data
function populateSidebar(profile) {
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

window.addEventListener('load', async function () {
  try {
    await window.Clerk.load();

    // Session guard — redirect if not logged in
    if (!window.Clerk.session) {
      window.location.replace('../../App/Auth/login.html');
      return;
    }

    const token = await window.Clerk.session.getToken();
    window.__taskaToken = token;

    // Fetch profile from our backend
    try {
      const res = await fetch(`${API_BASE}/profiles/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        window.Clerk.signOut().then(() => window.location.replace('../../App/Auth/login.html'));
        return;
      }

      if (res.ok) {
        const json = await res.json();
        window.__taskaProfile = json.profile;
        populateSidebar(json.profile);
      }
    } catch (err) {
      console.warn('auth-guard: could not fetch profile', err);
    }

    // Bind logout button if present
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await window.Clerk.signOut();
          window.location.replace('../../App/Auth/login.html');
        } catch (err) {
          console.error('Logout failed', err);
        }
      });
    }

    // Fire a custom event so page scripts know the guard has completed
    window.dispatchEvent(new Event('taska:ready'));

  } catch (err) {
    console.error('auth-guard: Clerk load failed', err);
  }
});
