/* ==========================================================================
   sidebar-component.js — Dynamic Unified Sidebar & Mobile Topbar Controller
   Automatically renders, updates, and syncs navigation across all pages.
   ========================================================================== */

(function () {
  /**
   * Determine relative path roots based on current window location
   */
  function getPathRoots() {
    const path = window.location.pathname.toLowerCase();
    const isProfileSubfolder = path.includes('/app/profile');
    
    return {
      dashRoot: isProfileSubfolder ? '../Dashboard/' : '',
      profileRoot: isProfileSubfolder ? './' : '../Profile/'
    };
  }

  /**
   * Render the unified sidebar and mobile topbar markup
   */
  window.renderUnifiedSidebar = function (profile) {
    const sidebarEl = document.getElementById('sidebar') || document.querySelector('aside.sidebar');
    if (!sidebarEl) return;

    const { dashRoot, profileRoot } = getPathRoots();
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase() || '#dashboard';

    const isMyTasks = path.includes('my-tasks.html');
    const isProfile = path.includes('/app/profile');
    const isDashIndex = path.includes('/app/dashboard/') && !isMyTasks;

    // Active tab detection
    let activeTab = 'dashboard';
    if (isMyTasks) {
      activeTab = 'my-tasks';
    } else if (isProfile) {
      activeTab = 'profile';
    } else if (isDashIndex) {
      if (hash.includes('#browse')) activeTab = 'browse';
      else if (hash.includes('#post')) activeTab = 'post';
      else if (hash.includes('#messages')) activeTab = 'messages';
      else if (hash.includes('#wallet')) activeTab = 'wallet';
      else if (hash.includes('#settings')) activeTab = 'settings';
      else activeTab = 'dashboard';
    }

    const pInitials = profile ? `${(profile.firstName || '')[0] || ''}${(profile.lastName || '')[0] || ''}`.toUpperCase() || 'U' : '--';
    const pFullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User' : 'Loading…';
    const pUsername = profile ? `@${profile.username || 'user'}` : '@user';
    const pAvatarHTML = (profile && profile.avatarUrl) ? `<img src="${profile.avatarUrl}" alt="${pFullName}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : pInitials;

    const profileLink = profile ? `${profileRoot}index.html?id=${profile.id}` : '#';

    // Set sidebar attributes & content
    sidebarEl.id = 'sidebar';
    sidebarEl.className = 'sidebar';
    sidebarEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; padding-right:12px;">
        <a href="../../index.html" class="sidebar-logo"><span class="logo-mark">T</span>Taska</a>
        <button id="sidebar-close-btn" class="mobile-only" style="background:none; border:none; color:var(--body); cursor:pointer; padding:4px;" aria-label="Close sidebar">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>

      <nav class="sidebar-nav">
        <a href="${dashRoot}index.html#dashboard" class="sidebar-link ${activeTab === 'dashboard' ? 'is-active' : ''}" data-tab="dashboard">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg></span>
          Dashboard
        </a>
        <a href="${dashRoot}index.html#browse" class="sidebar-link ${activeTab === 'browse' ? 'is-active' : ''}" data-tab="browse">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
          Browse Gigs
        </a>
        <a href="${dashRoot}index.html#post" class="sidebar-link ${activeTab === 'post' ? 'is-active' : ''}" data-tab="post">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
          Post a Task
        </a>
        <a href="${dashRoot}my-tasks.html" class="sidebar-link ${activeTab === 'my-tasks' ? 'is-active' : ''}">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          My Posted Tasks
        </a>
        <a href="${dashRoot}index.html#messages" class="sidebar-link ${activeTab === 'messages' ? 'is-active' : ''}" data-tab="messages">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.7"/></svg></span>
          Chats
        </a>
        <a href="${dashRoot}index.html#wallet" class="sidebar-link ${activeTab === 'wallet' ? 'is-active' : ''}" data-tab="wallet">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/><path d="M7 15H10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
          My Wallet
        </a>

        <div class="sidebar-divider"></div>

        <a href="${dashRoot}index.html#settings" class="sidebar-link ${activeTab === 'settings' ? 'is-active' : ''}" data-tab="profile-nav">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" stroke-width="1.7"/></svg></span>
          Settings
        </a>
        <a href="#" class="sidebar-link" id="logout-btn" style="color: #e53e3e;">
          <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          Log out
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-user" id="sidebar-user-btn" style="cursor:pointer; padding:8px 12px; border-radius:var(--radius-sm);" title="View public profile">
          <div class="sidebar-user-avatar" id="sidebar-avatar">${pAvatarHTML}</div>
          <div style="flex:1; min-width:0;">
            <div class="sidebar-user-name" id="sidebar-name" style="font-weight:600; font-size:0.88rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pFullName}</div>
            <div class="sidebar-user-username mono" id="sidebar-username" style="font-size:0.76rem; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pUsername}</div>
          </div>
        </div>
      </div>
    `;

    // Ensure mobile topbar exists
    let mobileTopbar = document.querySelector('.mobile-topbar');
    if (!mobileTopbar) {
      mobileTopbar = document.createElement('div');
      mobileTopbar.className = 'mobile-topbar';
      const layout = document.querySelector('.dashboard-layout') || document.body;
      layout.insertBefore(mobileTopbar, layout.firstChild);
    }
    mobileTopbar.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="hamburger-btn" id="mobile-hamburger-btn" aria-label="Toggle navigation" style="background:none; border:none; color:var(--body); cursor:pointer; padding:4px;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="sidebar-user-avatar" id="mobile-avatar" style="cursor:pointer;" title="View public profile">${pAvatarHTML}</div>
    `;

    // Bind event handlers
    bindSidebarEvents(profileLink);
  };

  function bindSidebarEvents(profileLink) {
    const sidebarEl = document.getElementById('sidebar');
    const closeBtn = document.getElementById('sidebar-close-btn');
    const hamburgerBtn = document.getElementById('mobile-hamburger-btn');

    if (hamburgerBtn && sidebarEl) {
      hamburgerBtn.onclick = () => sidebarEl.classList.toggle('is-open');
    }
    if (closeBtn && sidebarEl) {
      closeBtn.onclick = () => sidebarEl.classList.remove('is-open');
    }

    const userBtn = document.getElementById('sidebar-user-btn');
    const mobileAv = document.getElementById('mobile-avatar');

    if (userBtn && profileLink) {
      userBtn.onclick = () => { window.location.href = profileLink; };
    }
    if (mobileAv && profileLink) {
      mobileAv.onclick = () => { window.location.href = profileLink; };
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = async (e) => {
        e.preventDefault();
        try {
          if (window.showToast) window.showToast('Signing out…');
          if (window.Clerk) await window.Clerk.signOut();
          const path = window.location.pathname.toLowerCase();
          const loginUrl = path.includes('/app/profile') ? '../Auth/login.html' : '../Auth/login.html';
          window.location.replace(loginUrl);
        } catch (err) {
          console.error('Logout error:', err);
        }
      };
    }
  }

  // Auto-render when taska profile is ready
  window.addEventListener('taska:ready', function () {
    const profile = window.getTaskaProfile ? window.getTaskaProfile() : null;
    window.renderUnifiedSidebar(profile);
  });

  document.addEventListener('DOMContentLoaded', function () {
    const profile = window.getTaskaProfile ? window.getTaskaProfile() : null;
    window.renderUnifiedSidebar(profile);
  });
})();
