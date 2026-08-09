/**
 * Dynamic Sidebar & Topbar Component Builder for Taska
 */
(function() {

  window.initSidebar = async function() {
    const path = window.location.pathname;
    const hash = window.location.hash.replace('#', '') || '';

    // Determine subfolder location & calculate relative root links
    const inDashboard = path.includes('/App/Dashboard/');
    const inSettings  = path.includes('/App/Settings/');
    const inChats     = path.includes('/App/Chats/');
    const inWallet    = path.includes('/App/Wallet/');
    const inProfile   = path.includes('/App/Profile/');

    const dashRoot     = inDashboard ? '' : '../Dashboard/';
    const settingsRoot = inSettings  ? '' : '../Settings/';
    const chatsRoot    = inChats     ? '' : '../Chats/';
    const walletRoot   = inWallet    ? '' : '../Wallet/';
    const profileRoot  = inProfile   ? '' : '../Profile/';

    const profileLink  = `${profileRoot}index.html`;

    // Determine active tab
    let activeTab = 'dashboard';
    if (inSettings) activeTab = 'settings';
    else if (inChats) activeTab = 'messages';
    else if (inWallet) activeTab = 'wallet';
    else if (inProfile) activeTab = 'profile';
    else if (path.includes('browse-tasks.html') || path.includes('browse-gigs.html')) activeTab = 'browse';
    else if (path.includes('post-task.html')) activeTab = 'post';
    else if (path.includes('my-tasks.html')) activeTab = 'my-tasks';
    else if (hash) activeTab = hash;

    // Get cached profile or load profile
    let profile = window.__taskaProfile;
    if (!profile && window.ensureTaskaProfile) {
      profile = await window.ensureTaskaProfile();
    }

    const pFullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile' : 'User Profile';
    const pUsername = profile ? `@${profile.username || 'user'}` : '@user';
    const pAvatarHTML = (profile && profile.avatarUrl)
      ? `<img src="${profile.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
      : (profile ? (profile.firstName || 'U')[0].toUpperCase() : 'U');

    const sidebarEl = document.getElementById('sidebar') || document.querySelector('aside.sidebar');
    if (sidebarEl) {
      const isBuilt = sidebarEl.querySelector('.sidebar-nav');
      if (!isBuilt) {
        sidebarEl.innerHTML = `
          <div class="sidebar-logo">
            <span class="logo-mark" style="width:32px; height:32px; border-radius:8px; display:inline-flex; align-items:center; justify-content:center; font-weight:bold;">T</span>
            Taska
          </div>

          <nav class="sidebar-nav">
            <a href="${dashRoot}index.html" class="sidebar-link desktop-only ${activeTab === 'dashboard' ? 'is-active' : ''}" data-tab="dashboard">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg></span>
              Dashboard
            </a>
            <a href="${dashRoot}browse-tasks.html" class="sidebar-link desktop-only ${activeTab === 'browse' ? 'is-active' : ''}" data-tab="browse">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
              Browse Tasks
            </a>
            <a href="${dashRoot}post-task.html" class="sidebar-link desktop-only ${activeTab === 'post' ? 'is-active' : ''}" data-tab="post">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
              Post a Task
            </a>
            <a href="${dashRoot}my-tasks.html" class="sidebar-link ${activeTab === 'my-tasks' ? 'is-active' : ''}" data-tab="my-tasks">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
              My Posted Tasks
            </a>
            <a href="${chatsRoot}index.html" class="sidebar-link ${activeTab === 'messages' ? 'is-active' : ''}" data-tab="messages">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.7"/></svg></span>
              Chats
            </a>
            <a href="${walletRoot}index.html" class="sidebar-link desktop-only ${activeTab === 'wallet' ? 'is-active' : ''}" data-tab="wallet">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/><path d="M7 15H10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
              My Wallet
            </a>

            <div class="sidebar-divider"></div>

            <a href="${settingsRoot}index.html" class="sidebar-link ${activeTab === 'settings' ? 'is-active' : ''}" data-tab="settings">
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
      } else {
        // Sidebar is already built — update active link highlighting in-place without touching DOM tree
        sidebarEl.querySelectorAll('.sidebar-link').forEach(link => {
          if (link.dataset.tab === activeTab) {
            link.classList.add('is-active');
          } else {
            link.classList.remove('is-active');
          }
        });

        // Update user profile info in-place if loaded
        const sidebarName = document.getElementById('sidebar-name');
        const sidebarUser = document.getElementById('sidebar-username');
        const sidebarAv   = document.getElementById('sidebar-avatar');

        if (sidebarName && profile) sidebarName.textContent = pFullName;
        if (sidebarUser && profile) sidebarUser.textContent = pUsername;
        if (sidebarAv && profile) sidebarAv.innerHTML = pAvatarHTML;
      }
    }

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

    // Ensure mobile bottom tab bar exists
    let tabBar = document.querySelector('nav.tab-bar');
    if (!tabBar) {
      tabBar = document.createElement('nav');
      tabBar.className = 'tab-bar';
      document.body.appendChild(tabBar);
    }
    tabBar.innerHTML = `
      <div class="tab-bar-inner">
        <a href="${dashRoot}index.html" class="tab-item ${activeTab === 'dashboard' ? 'is-active' : ''}" data-tab="dashboard">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg>
          Dashboard
        </a>
        <a href="${dashRoot}browse-tasks.html" class="tab-item ${activeTab === 'browse' ? 'is-active' : ''}" data-tab="browse">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          Browse
        </a>
        <a href="${dashRoot}post-task.html" class="tab-item ${activeTab === 'post' ? 'is-active' : ''}" data-tab="post">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
          Post
        </a>
        <a href="${walletRoot}index.html" class="tab-item ${activeTab === 'wallet' ? 'is-active' : ''}" data-tab="wallet">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/></svg>
          Wallet
        </a>
      </div>
    `;

    // Bind event handlers
    bindSidebarEvents(profileLink);
  };

  function bindSidebarEvents(profileLink) {
    const sidebarEl = document.getElementById('sidebar') || document.querySelector('aside.sidebar');
    const hamburgerBtn = document.getElementById('mobile-hamburger-btn');

    if (hamburgerBtn && sidebarEl) {
      hamburgerBtn.onclick = (e) => {
        e.stopPropagation();
        sidebarEl.classList.toggle('is-open');
        sidebarEl.classList.toggle('is-mobile-open');
      };
    }

    // Close mobile sidebar when clicking outside
    document.addEventListener('click', (e) => {
      if (sidebarEl && (sidebarEl.classList.contains('is-open') || sidebarEl.classList.contains('is-mobile-open'))) {
        if (!sidebarEl.contains(e.target) && !e.target.closest('#mobile-hamburger-btn')) {
          sidebarEl.classList.remove('is-open', 'is-mobile-open');
        }
      }
    });

    // Profile click handlers
    const userBtn = document.getElementById('sidebar-user-btn');
    const mobileAv = document.getElementById('mobile-avatar');
    const goToProfile = () => {
      const p = window.__taskaProfile;
      if (p && p.id) {
        window.location.href = profileLink.includes('?') ? `${profileLink}&id=${p.id}` : `${profileLink}?id=${p.id}`;
      } else {
        window.location.href = profileLink;
      }
    };

    if (userBtn) userBtn.onclick = goToProfile;
    if (mobileAv) mobileAv.onclick = goToProfile;

    // Logout button handler
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.onclick = async (e) => {
        e.preventDefault();
        if (window.Clerk && window.Clerk.signOut) {
          await window.Clerk.signOut();
        }
        window.location.href = '../../index.html';
      };
    }
  }

  // Auto-init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    window.initSidebar();
  });

})();
