/**
 * Dynamic Sidebar & Topbar Component Builder for Taska
 * 100% Emoji-Free, Pure SVG Production Icons & Robust Multi-Depth Routing.
 */
(function() {

  window.initSidebar = async function() {
    const path = window.location.pathname;
    const pLower = path.toLowerCase();
    const hash = window.location.hash.replace('#', '') || '';

    // Determine subfolder location & calculate relative root links
    const inPoster   = pLower.includes('/poster') || pLower.includes('/post-task') || pLower.includes('/my-posted-tasks');
    const inTasker   = pLower.includes('/tasker') || pLower.includes('/browse-tasks') || pLower.includes('/my-applications');
    const inSettings = pLower.includes('/settings');
    const inChats    = pLower.includes('/chats');
    const inWallet   = pLower.includes('/wallet');

    let storedRole = null;
    try { storedRole = localStorage.getItem('taska_active_role'); } catch (_) {}
    const currentRole  = inTasker ? 'TASKER' : inPoster ? 'POSTER' : (storedRole || (window.getTaskaRole ? window.getTaskaRole() : 'POSTER'));
    const isTaskerMode = currentRole === 'TASKER';

    const dashUrl     = isTaskerMode ? '/tasker/dashboard' : '/poster/dashboard';
    const myTasksUrl  = isTaskerMode ? '/my-applications'  : '/my-posted-tasks';
    const actionUrl   = isTaskerMode ? '/browse-tasks'     : '/post-task';
    const profileLink = isTaskerMode ? '/tasker/profile'   : '/poster/profile';
    const chatsUrl    = '/chats';
    const walletUrl   = '/wallet';
    const settingsUrl = '/settings';
    const assetsRoot  = '/assets/';

    // Determine active tab
    let activeTab = 'dashboard';
    if (inSettings) activeTab = 'settings';
    else if (inChats) activeTab = 'messages';
    else if (inWallet) activeTab = 'wallet';
    else if (pLower.includes('/profile')) activeTab = 'profile';
    else if (pLower.includes('/browse-tasks') || pLower.includes('browsetasks')) activeTab = 'browse';
    else if (pLower.includes('/post-task') || pLower.includes('posttask')) activeTab = 'post';
    else if (pLower.includes('/my-posted-tasks') || pLower.includes('/my-applications') || pLower.includes('mypostedtasks') || pLower.includes('myapplications')) activeTab = 'my-tasks';
    else if (hash) activeTab = hash;

    // Get cached profile or load profile
    let profile = window.__taskaProfile;
    if (!profile && window.ensureTaskaProfile) {
      profile = await window.ensureTaskaProfile();
    }
    const pFullName = profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'User Profile' : 'User Profile';
    const pUsername = profile ? `@${profile.username || 'user'}` : '@user';
    const activeAvatar = isTaskerMode
      ? (profile?.taskerAvatarUrl || profile?.avatarUrl)
      : (profile?.posterAvatarUrl || profile?.avatarUrl);
    const pAvatarHTML = activeAvatar
      ? `<img src="${activeAvatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
      : (profile ? (profile.firstName || 'U')[0].toUpperCase() : 'U');

    // SVG Icons
    const taskerIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;
    const posterIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
    const checkIcon  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg>`;
    const plusIcon   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    const userIcon   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const settingsIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    const logoutIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`;

    // Determine setup states for alternate profiles
    const isTaskerSetup = true;
    const isPosterSetup = true;

    const sidebarEl = document.getElementById('sidebar') || document.querySelector('aside.sidebar');
    if (sidebarEl) {

      sidebarEl.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; padding:2px 4px 0;">
          <a href="${dashUrl}" class="sidebar-logo" style="text-decoration:none; padding:0; margin:0;">
            <img src="${assetsRoot}icon.png" alt="Taska" style="width:32px; height:32px; border-radius:8px; object-fit:contain; display:block;">
            <span style="font-weight:700; font-size:1.18rem; color:#fff; letter-spacing:-0.01em;">Taska</span>
          </a>
          <button class="taska-notif-bell-btn" id="sidebar-notif-bell" aria-label="Notifications" style="position:relative; background:rgba(255,255,255,0.08); border:none; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; transition:background 0.15s ease;" title="Notifications">
            <svg class="bell-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <span class="taska-notif-badge" id="sidebar-notif-badge" style="display:none; position:absolute; top:-2px; right:-2px; background:#EF4444; color:#fff; font-size:0.68rem; font-weight:700; border-radius:999px; min-width:16px; height:16px; padding:0 4px; line-height:16px; text-align:center; border:2px solid #0E3A22;">0</span>
          </button>
        </div>

        <nav class="sidebar-nav">
          <a href="${dashUrl}" class="sidebar-link desktop-only ${activeTab === 'dashboard' ? 'is-active' : ''}" data-tab="dashboard">
            <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg></span>
            Dashboard
          </a>

          ${isTaskerMode ? `
            <a href="${actionUrl}" class="sidebar-link desktop-only ${activeTab === 'browse' ? 'is-active' : ''}" data-tab="browse">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
              Browse Tasks
            </a>
          ` : `
            <a href="${actionUrl}" class="sidebar-link desktop-only ${activeTab === 'post' ? 'is-active' : ''}" data-tab="post">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
              Post a Task
            </a>
          `}

          <a href="${myTasksUrl}" class="sidebar-link ${activeTab === 'my-tasks' ? 'is-active' : ''}" data-tab="my-tasks">
            <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            ${isTaskerMode ? 'My Applications' : 'My Posted Tasks'}
          </a>
          <a href="${chatsUrl}" class="sidebar-link ${activeTab === 'messages' ? 'is-active' : ''}" data-tab="messages">
            <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.7"/></svg></span>
            Chats
          </a>
          <div class="sidebar-divider"></div>

          <a href="${walletUrl}" class="sidebar-link desktop-only ${activeTab === 'wallet' ? 'is-active' : ''}" data-tab="wallet">
            <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/><path d="M7 15H10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
            My Wallet
          </a>
          <a href="#" class="sidebar-link" id="logout-btn" style="color: #e53e3e;">
            <span class="sidebar-icon">${logoutIcon}</span>
            Log out
          </a>
        </nav>

        <div class="sidebar-footer" style="position:relative; margin-top:auto; padding-top:16px;">
          <!-- User Profile Pill / Mode Switcher Trigger -->
          <div class="sidebar-user" id="sidebar-user-btn" style="cursor:pointer; padding:10px 12px; border-radius:var(--radius-sm); display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.07); transition:background 0.15s ease;" title="Account & Mode options">
            <div class="sidebar-user-avatar" id="sidebar-avatar">${pAvatarHTML}</div>
            <div style="flex:1; min-width:0;">
              <div class="sidebar-user-name" id="sidebar-name" style="font-weight:600; font-size:0.88rem; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pFullName}</div>
              <div class="sidebar-user-username mono" id="sidebar-username" style="font-size:0.76rem; color:#8FB89C; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center; gap:4px;">
                ${isTaskerMode ? `${taskerIcon} Tasker Mode` : `${posterIcon} Poster Mode`}
              </div>
            </div>
            <div class="sidebar-user-dropdown-icon" style="color:#8FB89C; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 9l5-5 5 5M7 15l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
          </div>

          <!-- Mode Switcher & Profile Dropdown Popup -->
          <div class="sidebar-switcher-menu" id="sidebar-switcher-menu" style="display:none; position:absolute; bottom:calc(100% + 8px); left:0; right:0; background:#0A2717; border:1px solid rgba(255,255,255,0.16); border-radius:var(--radius-md); padding:8px; box-shadow:0 16px 36px rgba(0,0,0,0.55); z-index:99999;">
            <div style="font-size:0.68rem; font-weight:700; color:#8FB89C; padding:6px 10px; text-transform:uppercase; letter-spacing:0.05em;">Switch Account Mode</div>
            
            ${isTaskerMode ? `
              <!-- Active Tasker Mode -->
              <div class="switcher-menu-item is-active" style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-radius:var(--radius-sm); margin-bottom:4px; background:rgba(34,145,80,0.22);">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="color:#CDEEDA;">${taskerIcon}</span>
                  <div>
                    <div style="font-weight:600; font-size:0.86rem; color:#fff;">Tasker Mode</div>
                    <div style="font-size:0.74rem; color:#A9CBB3;">Browse gigs & earn money</div>
                  </div>
                </div>
                <span style="color:#CDEEDA; font-weight:bold;">${checkIcon}</span>
              </div>

              <!-- Switch to Poster Profile -->
              <div class="switcher-menu-item" id="switch-to-poster-btn" style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-radius:var(--radius-sm); cursor:pointer; transition:background 0.15s; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="color:#A9CBB3;">${posterIcon}</span>
                  <div>
                    <div style="font-weight:600; font-size:0.86rem; color:#fff;">Task Poster Mode</div>
                    <div style="font-size:0.74rem; color:#A9CBB3;">Post tasks & hire professionals</div>
                  </div>
                </div>
                <span style="font-size:0.75rem; color:#8FB89C; font-weight:600;">Switch &rarr;</span>
              </div>
            ` : `
              <!-- Active Poster Mode -->
              <div class="switcher-menu-item is-active" style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-radius:var(--radius-sm); margin-bottom:4px; background:rgba(34,145,80,0.22);">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="color:#CDEEDA;">${posterIcon}</span>
                  <div>
                    <div style="font-weight:600; font-size:0.86rem; color:#fff;">Task Poster Mode</div>
                    <div style="font-size:0.74rem; color:#A9CBB3;">Post tasks & hire professionals</div>
                  </div>
                </div>
                <span style="color:#CDEEDA; font-weight:bold;">${checkIcon}</span>
              </div>

              <!-- Switch to Tasker Profile -->
              <div class="switcher-menu-item" id="switch-to-tasker-btn" style="display:flex; align-items:center; justify-content:space-between; padding:10px; border-radius:var(--radius-sm); cursor:pointer; transition:background 0.15s; margin-bottom:6px;">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="color:#A9CBB3;">${taskerIcon}</span>
                  <div>
                    <div style="font-weight:600; font-size:0.86rem; color:#fff;">Tasker Mode</div>
                    <div style="font-size:0.74rem; color:#A9CBB3;">Browse gigs & earn money</div>
                  </div>
                </div>
                <span style="font-size:0.75rem; color:#8FB89C; font-weight:600;">Switch &rarr;</span>
              </div>
            `}

            <div style="height:1px; background:rgba(255,255,255,0.08); margin:4px 0;"></div>

            <div class="switcher-menu-link" id="dropdown-profile-btn" style="padding:8px 10px; border-radius:var(--radius-sm); color:#DDEFE1; font-size:0.84rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
              <span>${userIcon}</span> View Profile
            </div>
            <div class="switcher-menu-link" id="dropdown-settings-btn" style="padding:8px 10px; border-radius:var(--radius-sm); color:#DDEFE1; font-size:0.84rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
              <span>${settingsIcon}</span> Settings
            </div>
            <div class="switcher-menu-link" id="dropdown-logout-btn" style="padding:8px 10px; border-radius:var(--radius-sm); color:#f87171; font-size:0.84rem; cursor:pointer; display:flex; align-items:center; gap:8px;">
              <span>${logoutIcon}</span> Log out
            </div>
          </div>
        </div>
      `;
    }

    // Ensure mobile topbar exists outside the dashboard layout
    let mobileTopbar = document.querySelector('.mobile-topbar');
    if (!mobileTopbar) {
      mobileTopbar = document.createElement('div');
      mobileTopbar.className = 'mobile-topbar';
      const layout = document.querySelector('.dashboard-layout') || document.querySelector('.app-shell') || document.body;
      if (layout && layout.parentNode) {
        layout.parentNode.insertBefore(mobileTopbar, layout);
      } else {
        document.body.insertBefore(mobileTopbar, document.body.firstChild);
      }
    }
    mobileTopbar.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <button class="hamburger-btn" id="mobile-hamburger-btn" aria-label="Toggle navigation" style="background:none; border:none; color:#fff; cursor:pointer; padding:4px; display:flex; align-items:center; justify-content:center;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        <a href="${dashUrl}" style="display:flex; align-items:center; gap:8px; text-decoration:none;">
          <img src="${assetsRoot}icon.png" alt="Taska" style="width:26px; height:26px; border-radius:6px; object-fit:contain;">
          <span style="font-weight:700; font-size:1.1rem; color:#fff;">Taska</span>
        </a>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="taska-notif-bell-btn" id="mobile-notif-bell" aria-label="Notifications" style="position:relative; background:rgba(255,255,255,0.12); border:none; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; transition:background 0.15s ease;" title="Notifications">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span class="taska-notif-badge" id="mobile-notif-badge" style="display:none; position:absolute; top:-2px; right:-2px; background:#EF4444; color:#fff; font-size:0.68rem; font-weight:700; border-radius:999px; min-width:16px; height:16px; padding:0 4px; line-height:16px; text-align:center; border:2px solid #0E3A22;">0</span>
        </button>
        <div class="sidebar-user-avatar" id="mobile-avatar" style="cursor:pointer;" title="View public profile">${pAvatarHTML}</div>
      </div>
    `;

    // Ensure mobile bottom tab bar exists
    let tabBar = document.querySelector('nav.tab-bar') || document.querySelector('.bottom-tab-bar');
    if (!tabBar) {
      tabBar = document.createElement('nav');
      tabBar.className = 'tab-bar mobile-only';
      document.body.appendChild(tabBar);
    }

    tabBar.innerHTML = `
      <div class="tab-bar-inner">
        <a href="${dashUrl}" class="tab-item ${activeTab === 'dashboard' ? 'is-active' : ''}" data-tab="dashboard">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg>
          Dashboard
        </a>
        <a href="${actionUrl}" class="tab-item ${activeTab === 'browse' || activeTab === 'post' ? 'is-active' : ''}" data-tab="${isTaskerMode ? 'browse' : 'post'}">
          ${isTaskerMode 
            ? `<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>Browse`
            : `<svg viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>Post`
          }
        </a>
        <a href="${myTasksUrl}" class="tab-item ${activeTab === 'my-tasks' ? 'is-active' : ''}" data-tab="my-tasks">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Tasks
        </a>
        <a href="${chatsUrl}" class="tab-item ${activeTab === 'messages' ? 'is-active' : ''}" data-tab="messages">
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.7"/></svg>
          Chats
        </a>
        <a href="${walletUrl}" class="tab-item ${activeTab === 'wallet' ? 'is-active' : ''}" data-tab="wallet">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/></svg>
          Wallet
        </a>
      </div>
    `;

    // Bind event handlers
    bindSidebarEvents(profileLink);

    // Initial notification fetch
    if (window.fetchTaskaNotifications) {
      window.fetchTaskaNotifications();
    }
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

    // Bind Notification Bell clicks
    document.querySelectorAll('.taska-notif-bell-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.toggleNotificationDrawer) window.toggleNotificationDrawer();
      };
    });

    // Toggle Mode Switcher Dropdown Menu
    const userBtn = document.getElementById('sidebar-user-btn');
    const switcherMenu = document.getElementById('sidebar-switcher-menu');

    if (userBtn && switcherMenu) {
      userBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = switcherMenu.style.display === 'block';
        switcherMenu.style.display = isOpen ? 'none' : 'block';
      };
    }

    // Close dropdown menu and mobile sidebar when clicking outside (registered once globally)
    if (!window._sidebarDocClickBound) {
      window._sidebarDocClickBound = true;
      document.addEventListener('click', (e) => {
        const menu = document.getElementById('sidebar-switcher-menu');
        const btn = document.getElementById('sidebar-user-btn');
        if (menu && menu.style.display === 'block') {
          if (!menu.contains(e.target) && !btn?.contains(e.target)) {
            menu.style.display = 'none';
          }
        }
        const sidebar = document.getElementById('sidebar') || document.querySelector('aside.sidebar');
        if (sidebar && (sidebar.classList.contains('is-open') || sidebar.classList.contains('is-mobile-open'))) {
          if (!sidebar.contains(e.target) && !e.target.closest('#mobile-hamburger-btn')) {
            sidebar.classList.remove('is-open', 'is-mobile-open');
          }
        }
      });
    }

    // Account Mode Switching & Setup handlers
    const posterOpt = document.getElementById('switch-to-poster-btn');
    const taskerOpt = document.getElementById('switch-to-tasker-btn');
    const setupTaskerOpt = document.getElementById('setup-tasker-btn');
    const setupPosterOpt = document.getElementById('setup-poster-btn');

    if (posterOpt) {
      posterOpt.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (switcherMenu) switcherMenu.style.display = 'none';
        if (window.switchTaskaRole) window.switchTaskaRole('POSTER');
      };
    }

    if (taskerOpt) {
      taskerOpt.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (switcherMenu) switcherMenu.style.display = 'none';
        if (window.switchTaskaRole) window.switchTaskaRole('TASKER');
      };
    }

    if (setupTaskerOpt) {
      setupTaskerOpt.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (switcherMenu) switcherMenu.style.display = 'none';
        if (window.switchTaskaRole) {
          window.switchTaskaRole('TASKER');
        } else {
          openProfileSetupModal('TASKER');
        }
      };
    }

    if (setupPosterOpt) {
      setupPosterOpt.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (switcherMenu) switcherMenu.style.display = 'none';
        if (window.switchTaskaRole) {
          window.switchTaskaRole('POSTER');
        } else {
          openProfileSetupModal('POSTER');
        }
      };
    }

    // Navigation links in dropdown
    const goToProfile = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const p = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
      if (p && p.id) {
        window.location.href = profileLink.includes('?') ? `${profileLink}&id=${p.id}` : `${profileLink}?id=${p.id}`;
      } else {
        window.location.href = profileLink;
      }
    };

    const dropdownProfileBtn = document.getElementById('dropdown-profile-btn');
    if (dropdownProfileBtn) dropdownProfileBtn.onclick = goToProfile;

    const mobileAv = document.getElementById('mobile-avatar');
    if (mobileAv) mobileAv.onclick = goToProfile;

    const dropdownSettingsBtn = document.getElementById('dropdown-settings-btn');
    if (dropdownSettingsBtn) {
      dropdownSettingsBtn.onclick = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        window.location.href = '/settings';
      };
    }

    // Logout button handler
    const logoutHandler = async (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      try {
        try { localStorage.removeItem('taska_cached_profile'); } catch (_) {}
        window.__taskaProfile = null;
        if (window.Clerk && window.Clerk.signOut) {
          await window.Clerk.signOut();
        }
        window.location.href = '/login';
      } catch (err) {
        console.error('Logout error:', err);
      }
    };

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = logoutHandler;

    const dropdownLogoutBtn = document.getElementById('dropdown-logout-btn');
    if (dropdownLogoutBtn) dropdownLogoutBtn.onclick = logoutHandler;
  }

  // Profile Setup Modal Builder
  function openProfileSetupModal(targetRole) {
    const existing = document.getElementById('taska-setup-modal-container');
    if (existing) existing.remove();

    const isTasker = targetRole === 'TASKER';
    const profile = window.__taskaProfile || {};

    const container = document.createElement('div');
    container.id = 'taska-setup-modal-container';
    container.innerHTML = `
      <div style="position:fixed; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px;">
        <div style="background:var(--surface); border:1px solid var(--line); border-radius:var(--radius-lg); max-width:480px; width:100%; padding:28px; box-shadow:0 20px 40px rgba(0,0,0,0.3); animation:modalSlideUp 0.2s ease-out;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="font-size:1.25rem; font-weight:700; color:var(--green-900); margin:0;">
              ${isTasker ? 'Set up Tasker Profile' : 'Set up Task Poster Profile'}
            </h3>
            <button type="button" id="close-setup-modal-btn" style="background:none; border:none; font-size:1.3rem; cursor:pointer; color:var(--muted);">✕</button>
          </div>
          <p style="font-size:0.88rem; color:var(--muted); margin-bottom:20px; line-height:1.5;">
            ${isTasker 
              ? 'Complete your Tasker profile details to start browsing gigs, applying for tasks, and earning money on Taska.' 
              : 'Complete your Task Poster profile details to start posting tasks and hiring verified professionals.'}
          </p>

          <form id="setup-profile-form">
            <div class="field-group" style="margin-bottom:16px;">
              <label class="field-label">${isTasker ? 'Professional Tagline / Specialization' : 'Poster / Business Display Name'}</label>
              <input class="text-input" id="setup-title" required placeholder="${isTasker ? 'e.g. Expert Electrician & Home Maintenance' : 'e.g. Lagos Homeowner / Tech Manager'}" value="${isTasker ? (profile.taskerTitle || '') : (profile.posterName || '')}">
            </div>

            <div class="field-group" style="margin-bottom:16px;">
              <label class="field-label">${isTasker ? 'Primary Skills & Categories' : 'Primary Categories of Tasks You Post'}</label>
              <input class="text-input" id="setup-categories" required placeholder="${isTasker ? 'e.g. Electrical, Repairs, Cleaning, IT' : 'e.g. Home Repairs, Errands, Deliveries'}" value="${isTasker ? (profile.taskerSkills || '') : (profile.posterCategories || '')}">
            </div>

            ${isTasker ? `
              <div class="field-group" style="margin-bottom:16px;">
                <label class="field-label">Hourly / Base Rate (NGN)</label>
                <input class="text-input" id="setup-rate" placeholder="e.g. ₦3,500/hr" value="${profile.taskerRate || ''}">
              </div>
            ` : ''}

            <div class="field-group" style="margin-bottom:22px;">
              <label class="field-label">Bio / Profile Summary</label>
              <textarea class="textarea-input" id="setup-bio" rows="3" placeholder="${isTasker ? 'Describe your work experience, tools, and background...' : 'Describe the types of tasks you regularly hire people for...'}" style="resize:vertical; min-height:80px; width:100%; border:1px solid var(--line); border-radius:var(--radius-sm); padding:10px; font-family:inherit;">${isTasker ? (profile.taskerBio || profile.bio || '') : (profile.posterBio || profile.bio || '')}</textarea>
            </div>

            <button type="submit" class="btn btn-primary" style="width:100%;">
              Complete Setup & Launch ${isTasker ? 'Tasker Mode' : 'Poster Mode'}
            </button>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const closeBtn = document.getElementById('close-setup-modal-btn');
    if (closeBtn) closeBtn.onclick = () => container.remove();

    const form = document.getElementById('setup-profile-form');
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const p = window.__taskaProfile || {};
        let updateObj = {};

        if (isTasker) {
          p.isTaskerSetup = true;
          p.taskerTitle = document.getElementById('setup-title')?.value || '';
          p.taskerSkills = document.getElementById('setup-categories')?.value || '';
          p.taskerRate = document.getElementById('setup-rate')?.value || '';
          p.taskerBio = document.getElementById('setup-bio')?.value || '';
          if (p.id) {
            try { localStorage.setItem(`taska_tasker_setup_${p.id}`, 'true'); } catch (_) {}
          }
          updateObj = {
            isTaskerSetup: true,
            taskerTitle: p.taskerTitle,
            taskerSkills: p.taskerSkills,
            taskerRate: p.taskerRate,
            taskerBio: p.taskerBio,
            bio: p.taskerBio || p.bio || '',
            updatedAt: new Date().toISOString()
          };
        } else {
          p.isPosterSetup = true;
          p.posterName = document.getElementById('setup-title')?.value || '';
          p.posterCategories = document.getElementById('setup-categories')?.value || '';
          p.posterBio = document.getElementById('setup-bio')?.value || '';
          if (p.id) {
            try { localStorage.setItem(`taska_poster_setup_${p.id}`, 'true'); } catch (_) {}
          }
          updateObj = {
            isPosterSetup: true,
            posterName: p.posterName,
            posterCategories: p.posterCategories,
            posterBio: p.posterBio,
            bio: p.posterBio || p.bio || '',
            updatedAt: new Date().toISOString()
          };
        }

        window.__taskaProfile = p;
        try { localStorage.setItem('taska_cached_profile', JSON.stringify(p)); } catch (_) {}

        if (window.supabaseClient && p.id) {
          try {
            const { error } = await window.supabaseClient
              .from('Profile')
              .update(updateObj)
              .eq('id', p.id);
            if (error) throw error;
          } catch (err) {
            console.error('Supabase profile setup save error:', err);
          }
        }

        container.remove();
        if (window.showToast) window.showToast(`${isTasker ? 'Tasker' : 'Poster'} profile set up successfully!`);
        if (window.switchTaskaRole) window.switchTaskaRole(targetRole);
      };
    }
  }

  // ─── IN-APP NOTIFICATION CENTER & DRAWER ──────────────────────────────────
  window.fetchTaskaNotifications = async function() {
    const profile = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
    const userId = profile?.userId || (window.Clerk?.user?.id);
    if (!userId || !window.supabaseClient) return;

    try {
      const { data: list, error } = await window.supabaseClient
        .from('Notification')
        .select('*')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .limit(30);

      if (error) {
        console.error('[Notifications] Supabase fetch error:', error);
        return;
      }

      window.__taskaNotifications = list || [];
      const unreadCount = (list || []).filter(n => !n.isRead).length;

      document.querySelectorAll('.taska-notif-badge').forEach(badge => {
        if (unreadCount > 0) {
          badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      });

      // Toggle bell shake animation whenever there are unread notifications
      document.querySelectorAll('.taska-notif-bell-btn, .bell-icon-svg').forEach(el => {
        if (unreadCount > 0) {
          el.classList.add('has-unread');
        } else {
          el.classList.remove('has-unread');
        }
      });

      renderNotificationDrawerList(list || []);
    } catch (err) {
      console.error('[Notifications] Fetch exception:', err);
    }
  };

  window.toggleNotificationDrawer = function() {
    if (typeof ensureNotificationResponsiveStyles === 'function') ensureNotificationResponsiveStyles();
    let container = document.getElementById('taska-notification-drawer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'taska-notification-drawer';
      container.style.cssText = `
        position: fixed; inset: 0; z-index: 999999; display: flex; justify-content: flex-end;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(3px); opacity: 0; transition: opacity 0.2s ease;
      `;
      container.innerHTML = `
        <div style="background:var(--paper, #fff); width:100%; max-width:420px; height:100%; display:flex; flex-direction:column; box-shadow:-8px 0 32px rgba(0,0,0,0.25); transform:translateX(100%); transition:transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); box-sizing:border-box;">
          <div style="padding:16px 18px 12px; border-bottom:1px solid var(--line, #e2e8f0); background:var(--surface, #fff); flex-shrink:0;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:34px; height:34px; border-radius:50%; background:var(--mint-100, #E1F5E8); color:var(--green-700, #146C34); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </div>
                <h3 style="font-size:1.1rem; margin:0; color:var(--green-900); font-weight:700;">Notifications</h3>
              </div>
              <button id="taska-close-notif-drawer" style="background:none; border:none; color:var(--muted); font-size:1.3rem; cursor:pointer; padding:4px 6px; line-height:1; border-radius:6px;" aria-label="Close">✕</button>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button id="taska-mark-all-read-btn" class="taska-notif-action-btn taska-notif-action-read" style="flex:1; justify-content:center;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Mark read
              </button>
              <button id="taska-clear-all-notif-btn" class="taska-notif-action-btn taska-notif-action-clear" style="flex:1; justify-content:center;" title="Permanently delete all notifications">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Clear all
              </button>
            </div>
          </div>

          <div id="taska-notif-list-container" style="flex:1; overflow-y:auto; padding:12px 14px;">
            <div style="padding:32px 16px; text-align:center; color:var(--muted); font-size:0.88rem;">Loading notifications…</div>
          </div>
        </div>
      `;
      document.body.appendChild(container);

      const panel = container.firstElementChild;
      const close = () => {
        container.style.opacity = '0';
        if (panel) panel.style.transform = 'translateX(100%)';
        setTimeout(() => { container.style.display = 'none'; }, 200);
      };

      container.querySelector('#taska-close-notif-drawer').onclick = close;
      container.onclick = (e) => { if (e.target === container) close(); };

      container.querySelector('#taska-clear-all-notif-btn').onclick = async () => {
        const profile = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
        const userId = profile?.userId || (window.Clerk?.user?.id);
        if (!userId || !window.supabaseClient) return;

        const confirmed = window.showConfirmDialog ? await window.showConfirmDialog({
          title: 'Clear Notifications',
          message: 'Are you sure you want to clear all notifications? They will be permanently deleted.',
          confirmText: 'Clear All',
          cancelText: 'Cancel',
          isDanger: true,
        }) : window.confirm('Are you sure you want to clear all notifications?');

        if (!confirmed) return;

        try {
          const { error } = await window.supabaseClient
            .from('Notification')
            .delete()
            .eq('userId', userId);

          if (error) throw error;

          window.__taskaNotifications = [];
          renderNotificationDrawerList([]);
          document.querySelectorAll('.taska-notif-badge').forEach(b => { b.style.display = 'none'; b.textContent = '0'; });
          document.querySelectorAll('.taska-notif-bell-btn, .bell-icon-svg').forEach(el => el.classList.remove('has-unread'));

          const allModal = document.getElementById('taska-all-notifications-modal');
          if (allModal) allModal.style.display = 'none';

          if (window.showToast) window.showToast('All notifications permanently deleted');
        } catch (err) {
          console.error('[Notifications] Clear all error:', err);
          if (window.showToast) window.showToast('Failed to clear notifications');
        }
      };

      container.querySelector('#taska-mark-all-read-btn').onclick = async () => {
        const profile = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
        const userId = profile?.userId || (window.Clerk?.user?.id);
        if (!userId || !window.supabaseClient) return;

        try {
          await window.supabaseClient
            .from('Notification')
            .update({ isRead: true })
            .eq('userId', userId);
          window.fetchTaskaNotifications();
          if (window.showToast) window.showToast('All notifications marked as read');
        } catch (err) {
          console.error('[Notifications] Mark all read error:', err);
        }
      };
    }

    const panel = container.firstElementChild;
    if (container.style.display === 'none' || !container.style.display || container.style.opacity === '0') {
      container.style.display = 'flex';
      requestAnimationFrame(() => {
        container.style.opacity = '1';
        if (panel) panel.style.transform = 'translateX(0)';
      });
      window.fetchTaskaNotifications();
    } else {
      container.style.opacity = '0';
      if (panel) panel.style.transform = 'translateX(100%)';
      setTimeout(() => { container.style.display = 'none'; }, 200);
    }
  };

  function renderNotificationDrawerList(list) {
    const listEl = document.getElementById('taska-notif-list-container');
    if (!listEl) return;

    if (!list || list.length === 0) {
      listEl.innerHTML = `
        <div style="padding:48px 20px; text-align:center; color:var(--muted);">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" style="margin-bottom:12px; opacity:0.5;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <div style="font-weight:600; font-size:0.95rem; color:var(--green-900); margin-bottom:4px;">No notifications yet</div>
          <div style="font-size:0.8rem;">You will receive alerts here when major account actions happen.</div>
        </div>
      `;
      return;
    }

    // Limit the drawer list strictly to the 6 most recent notifications
    const recentList = list.slice(0, 6);

    let html = recentList.map(item => {
      const isUnread = !item.isRead;
      const type = item.type || '';
      let iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
      let iconBg = 'var(--mint-100, #E1F5E8)';
      let iconColor = 'var(--green-700, #146C34)';

      if (type.includes('DEPOSIT') || type.includes('WITHDRAWAL') || type.includes('ESCROW')) {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>`;
        iconBg = '#ECFDF5';
        iconColor = '#059669';
      } else if (type.includes('TASK') || type.includes('APPLICATION') || type.includes('HIRED')) {
        iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
        iconBg = '#EFF6FF';
        iconColor = '#2563EB';
      }

      const diffMs = new Date() - new Date(item.createdAt);
      const diffMins = Math.floor(diffMs / 60000);
      let timeStr = 'Just now';
      if (diffMins >= 1 && diffMins < 60) timeStr = `${diffMins}m ago`;
      else if (diffMins >= 60 && diffMins < 1440) timeStr = `${Math.floor(diffMins/60)}h ago`;
      else if (diffMins >= 1440) timeStr = `${Math.floor(diffMins/1440)}d ago`;

      const safeTitle = window.escapeHtml ? window.escapeHtml(item.title || 'Notification') : (item.title || 'Notification');
      const safeBody = window.escapeHtml ? window.escapeHtml(item.body || '') : (item.body || '');

      return `
        <div class="taska-notif-item ${isUnread ? 'is-unread' : ''}" data-id="${item.id}" data-link="${item.link || ''}" style="padding:12px 14px; border-radius:var(--radius-sm, 12px); margin-bottom:8px; background:${isUnread ? 'rgba(34,145,80,0.05)' : 'var(--surface, #fff)'}; border:1px solid ${isUnread ? 'var(--mint-150, #CDEEDA)' : 'var(--line, #e2e8f0)'}; cursor:pointer; transition:all 0.15s ease; display:flex; gap:10px; align-items:flex-start; position:relative; box-sizing:border-box;">
          <div style="width:34px; height:34px; border-radius:50%; background:${iconBg}; color:${iconColor}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;">
            ${iconSvg}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px; margin-bottom:2px;">
              <span style="font-weight:700; font-size:0.86rem; color:var(--green-900); line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${safeTitle}</span>
              <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                <span style="font-size:0.72rem; color:var(--muted);">${timeStr}</span>
                ${isUnread ? `<span style="width:7px; height:7px; border-radius:50%; background:#EF4444; display:inline-block;"></span>` : ''}
              </div>
            </div>
            <div style="font-size:0.8rem; color:var(--ink-soft); line-height:1.45; word-break:break-word; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${safeBody}</div>
          </div>
        </div>
      `;
    }).join('');

    // Append "View All" button footer
    html += `
      <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--line, #e2e8f0); text-align:center;">
        <button id="taska-open-all-notif-btn" type="button" style="width:100%; padding:10px 14px; background:var(--surface, #fff); border:1px solid var(--line, #e2e8f0); border-radius:var(--radius-sm, 10px); font-size:0.84rem; font-weight:600; color:var(--green-900); cursor:pointer; transition:all 0.15s ease; text-align:center;">
          View All Notifications (${list.length}) →
        </button>
      </div>
    `;

    listEl.innerHTML = html;

    listEl.querySelectorAll('.taska-notif-item').forEach(item => {
      item.onclick = async () => {
        const id = item.getAttribute('data-id');
        const link = item.getAttribute('data-link');
        if (id && window.supabaseClient) {
          try {
            await window.supabaseClient.from('Notification').update({ isRead: true }).eq('id', id);
            window.fetchTaskaNotifications();
          } catch (_) {}
        }
        if (link) {
          window.location.href = normalizeNotificationUrl(link);
        }
      };
    });

    const openAllBtn = listEl.querySelector('#taska-open-all-notif-btn');
    if (openAllBtn) {
      openAllBtn.onclick = () => window.openAllNotificationsModal(list);
    }
  }

  function normalizeNotificationUrl(rawLink) {
    if (!rawLink) return '/tasker/dashboard';
    let url = rawLink.replace(/https?:\/\/(taska\.(ng|com\.ng)|localhost:\d+|[^\/]+)/i, '');
    if (!url.startsWith('/')) url = '/' + url;

    const match = url.match(/^([^?#]*)(.*)$/);
    let path = (match ? match[1] : url).toLowerCase();
    const queryAndHash = match ? match[2] : '';

    path = path.replace(/\/index\.html$/, '').replace(/\.html$/, '');
    if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1);

    if (path === '/wallet' || path === '/wallet/wallet') return '/wallet' + queryAndHash;
    if (path === '/poster/mytasks' || path === '/poster/my-tasks' || path === '/poster/mypostedtasks' || path === '/poster/my-posted-tasks' || path === '/mypostedtasks') return '/my-posted-tasks' + queryAndHash;
    if (path === '/tasker/myapplications' || path === '/tasker/my-applications' || path === '/myapplications') return '/my-applications' + queryAndHash;
    if (path === '/tasker/browsetasks' || path === '/tasker/browse-tasks' || path === '/browsetasks') return '/browse-tasks' + queryAndHash;
    if (path === '/poster/posttask' || path === '/poster/post-task' || path === '/posttask') return '/post-task' + queryAndHash;
    if (path === '/dashboard') return '/tasker/dashboard' + queryAndHash;
    if (path === '/settings/account') return '/settings/account' + queryAndHash;
    if (path === '/settings/kyc') return '/settings/kyc' + queryAndHash;
    if (path === '/settings' || path === '/settings/index') return '/settings' + queryAndHash;
    if (path === '/chats') return '/chats' + queryAndHash;
    if (path === '/auth/login' || path === '/login') return '/login' + queryAndHash;
    if (path === '/auth/signup' || path === '/signup') return '/signup' + queryAndHash;
    if (path === '/auth/forgot-password' || path === '/forgot-password') return '/forgot-password' + queryAndHash;

    return path + queryAndHash;
  }

  // ─── ALL NOTIFICATIONS POP-UP MODAL ──────────────────────────────────────
  function ensureNotificationResponsiveStyles() {
    if (document.getElementById('taska-notif-dynamic-styles')) return;
    const style = document.createElement('style');
    style.id = 'taska-notif-dynamic-styles';
    style.textContent = `
      .taska-notif-modal-overlay {
        position: fixed; inset: 0; z-index: 1000000; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.55); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); padding: 20px; box-sizing: border-box;
      }
      .taska-notif-modal-card {
        background: var(--paper, #fff); border-radius: var(--radius-md, 16px); max-width: 580px; width: 100%;
        max-height: 88vh; display: flex; flex-direction: column; border: 1px solid var(--line, #e2e8f0);
        box-shadow: 0 16px 48px rgba(0,0,0,0.28); position: relative; overflow: hidden; box-sizing: border-box;
      }
      .taska-notif-modal-header {
        padding: 18px 22px 14px; border-bottom: 1px solid var(--line, #e2e8f0); background: var(--surface, #fff); flex-shrink: 0; box-sizing: border-box;
      }
      .taska-notif-modal-top-bar {
        display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
      }
      .taska-notif-modal-title-wrap { flex: 1; min-width: 0; }
      .taska-notif-modal-title {
        font-size: 1.15rem; font-weight: 700; margin: 0 0 4px 0; color: var(--green-900, #064E3B);
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      }
      .taska-notif-modal-count-pill {
        font-size: 0.74rem; font-weight: 700; background: var(--mint-100, #E1F5E8); color: var(--green-700, #146C34);
        padding: 2px 8px; border-radius: 999px; border: 1px solid var(--mint-200, #bbf0cb);
      }
      .taska-notif-modal-subtitle { font-size: 0.78rem; color: var(--muted, #64748b); display: block; }
      .taska-notif-modal-close-btn {
        background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--muted, #64748b);
        padding: 6px; border-radius: 8px; line-height: 1; display: flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; flex-shrink: 0; transition: all 0.15s ease;
      }
      .taska-notif-modal-close-btn:hover { background: var(--bg-soft, #f1f5f9); color: var(--ink, #0f172a); }
      .taska-notif-modal-actions-bar {
        display: flex; align-items: center; gap: 8px; margin-top: 10px; padding-top: 10px;
        border-top: 1px dashed var(--line-soft, #f1f5f9); justify-content: flex-end;
      }
      .taska-notif-action-btn {
        display: inline-flex; align-items: center; gap: 5px; background: var(--bg-soft, #f8fafc);
        border: 1px solid var(--line, #e2e8f0); border-radius: 8px; font-size: 0.78rem; font-weight: 600;
        cursor: pointer; padding: 6px 11px; transition: all 0.15s ease; line-height: 1.2;
      }
      .taska-notif-action-read { color: var(--green-700, #146C34); }
      .taska-notif-action-read:hover { background: var(--mint-050, #f0fdf4); border-color: var(--mint-200, #bbf0cb); }
      .taska-notif-action-clear { color: var(--red, #b23a2e); }
      .taska-notif-action-clear:hover { background: #FEF2F2; border-color: #FECACA; }
      .taska-notif-modal-body {
        flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box;
      }
      .taska-modal-notif-row {
        padding: 14px 16px; border-radius: var(--radius-sm, 12px); background: var(--surface, #fff);
        border: 1px solid var(--line, #e2e8f0); display: flex; gap: 12px; align-items: flex-start;
        position: relative; transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
        box-sizing: border-box; width: 100%;
      }
      .taska-modal-notif-row.is-unread { background: rgba(34,145,80,0.04); border-color: var(--mint-150, #CDEEDA); }
      .taska-modal-notif-row:hover { border-color: var(--mint-300, #86efac); }
      .taska-notif-icon-col {
        width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; margin-top: 1px;
      }
      .taska-notif-content-col { flex: 1; min-width: 0; cursor: pointer; }
      .taska-notif-row-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 3px; }
      .taska-notif-row-title {
        font-weight: 700; font-size: 0.92rem; color: var(--green-900, #064E3B); line-height: 1.35; flex: 1;
        min-width: 0; word-break: break-word; overflow-wrap: break-word;
      }
      .taska-notif-row-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .taska-notif-unread-dot { width: 8px; height: 8px; border-radius: 50%; background: #EF4444; flex-shrink: 0; display: inline-block; }
      .taska-notif-delete-btn {
        background: none; border: none; cursor: pointer; color: var(--muted, #94a3b8); padding: 4px;
        border-radius: 6px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;
      }
      .taska-notif-delete-btn:hover { color: var(--red, #b23a2e); background: #FEE2E2; }
      .taska-notif-row-meta {
        font-size: 0.74rem; color: var(--muted, #64748b); margin-bottom: 6px; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
      }
      .taska-notif-row-body {
        font-size: 0.84rem; color: var(--ink-soft, #334155); line-height: 1.5; word-break: break-word; overflow-wrap: break-word;
      }
      @media (max-width: 600px) {
        .taska-notif-modal-overlay { padding: 8px !important; align-items: flex-end !important; }
        .taska-notif-modal-card {
          max-height: 92vh !important; max-width: 100% !important; border-radius: 18px 18px 10px 10px !important;
          box-shadow: 0 -8px 32px rgba(0,0,0,0.3) !important;
        }
        .taska-notif-modal-header { padding: 14px 14px 10px !important; }
        .taska-notif-modal-title { font-size: 1.05rem !important; }
        .taska-notif-modal-actions-bar { justify-content: space-between !important; gap: 8px !important; margin-top: 8px !important; padding-top: 8px !important; }
        .taska-notif-action-btn { flex: 1 !important; justify-content: center !important; padding: 7px 8px !important; font-size: 0.76rem !important; }
        .taska-notif-modal-body { padding: 10px 12px !important; gap: 8px !important; }
        .taska-modal-notif-row { padding: 12px !important; gap: 10px !important; border-radius: 10px !important; }
        .taska-notif-icon-col { width: 32px !important; height: 32px !important; }
        .taska-notif-icon-col svg { width: 16px !important; height: 16px !important; }
        .taska-notif-row-title { font-size: 0.88rem !important; }
        .taska-notif-row-body { font-size: 0.81rem !important; line-height: 1.45 !important; }
        #taska-notification-drawer > div { max-width: 100% !important; width: 100% !important; }
      }
    `;
    document.head.appendChild(style);
  }

  window.openAllNotificationsModal = function(list) {
    ensureNotificationResponsiveStyles();
    const allList = list || window.__taskaNotifications || [];
    let modal = document.getElementById('taska-all-notifications-modal');

    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'taska-all-notifications-modal';
      modal.className = 'taska-notif-modal-overlay';
      modal.innerHTML = `
        <div class="taska-notif-modal-card">
          <div class="taska-notif-modal-header">
            <div class="taska-notif-modal-top-bar">
              <div class="taska-notif-modal-title-wrap">
                <h3 class="taska-notif-modal-title" id="taska-all-notif-title">
                  All Notifications
                  <span class="taska-notif-modal-count-pill" id="taska-all-notif-count-pill">${allList.length}</span>
                </h3>
                <span class="taska-notif-modal-subtitle">Complete historical notification log</span>
              </div>
              <button id="taska-close-all-notif-modal" class="taska-notif-modal-close-btn" aria-label="Close notification log">✕</button>
            </div>
            <div class="taska-notif-modal-actions-bar">
              <button id="modal-mark-all-read-btn" class="taska-notif-action-btn taska-notif-action-read">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Mark all read
              </button>
              <button id="modal-clear-all-notif-btn" class="taska-notif-action-btn taska-notif-action-clear" title="Permanently delete all notifications">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Clear all
              </button>
            </div>
          </div>

          <div id="taska-all-notif-scroll-body" class="taska-notif-modal-body">
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.querySelector('#taska-close-all-notif-modal').onclick = () => {
        modal.style.display = 'none';
      };
      modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = 'none';
      };

      modal.querySelector('#modal-clear-all-notif-btn').onclick = async () => {
        const profile = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
        const userId = profile?.userId || (window.Clerk?.user?.id);
        if (!userId || !window.supabaseClient) return;

        const confirmed = window.showConfirmDialog ? await window.showConfirmDialog({
          title: 'Clear All Notifications',
          message: 'Are you sure you want to permanently delete all notifications from the database? This cannot be undone.',
          confirmText: 'Clear All',
          cancelText: 'Cancel',
          isDanger: true,
        }) : window.confirm('Are you sure you want to permanently clear all notifications?');

        if (!confirmed) return;

        try {
          const { error } = await window.supabaseClient
            .from('Notification')
            .delete()
            .eq('userId', userId);

          if (error) throw error;

          window.__taskaNotifications = [];
          renderNotificationDrawerList([]);
          document.querySelectorAll('.taska-notif-badge').forEach(b => { b.style.display = 'none'; b.textContent = '0'; });
          document.querySelectorAll('.taska-notif-bell-btn, .bell-icon-svg').forEach(el => el.classList.remove('has-unread'));

          modal.style.display = 'none';
          if (window.showToast) window.showToast('All notifications permanently deleted');
        } catch (err) {
          console.error('[Notifications] Modal clear error:', err);
          if (window.showToast) window.showToast('Failed to clear notifications');
        }
      };

      modal.querySelector('#modal-mark-all-read-btn').onclick = async () => {
        const profile = window.__taskaProfile || (window.getTaskaProfile ? window.getTaskaProfile() : null);
        const userId = profile?.userId || (window.Clerk?.user?.id);
        if (!userId || !window.supabaseClient) return;

        try {
          await window.supabaseClient
            .from('Notification')
            .update({ isRead: true })
            .eq('userId', userId);
          await window.fetchTaskaNotifications();
          window.openAllNotificationsModal(window.__taskaNotifications);
          if (window.showToast) window.showToast('All notifications marked as read');
        } catch (err) {
          console.error('[Notifications] Modal mark read error:', err);
        }
      };
    }

    const countPill = modal.querySelector('#taska-all-notif-count-pill');
    if (countPill) countPill.textContent = `${allList.length}`;

    const bodyEl = modal.querySelector('#taska-all-notif-scroll-body');
    if (!bodyEl) return;

    if (allList.length === 0) {
      bodyEl.innerHTML = `
        <div style="padding:48px 20px; text-align:center; color:var(--muted);">
          <div style="font-weight:600; font-size:1rem; color:var(--green-900); margin-bottom:4px;">No notifications found</div>
          <div style="font-size:0.82rem;">Your notification log is currently empty.</div>
        </div>
      `;
    } else {
      bodyEl.innerHTML = allList.map(item => {
        const isUnread = !item.isRead;
        const type = item.type || '';
        let iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
        let iconBg = 'var(--mint-100, #E1F5E8)';
        let iconColor = 'var(--green-700, #146C34)';

        if (type.includes('DEPOSIT') || type.includes('WITHDRAWAL') || type.includes('ESCROW')) {
          iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>`;
          iconBg = '#ECFDF5';
          iconColor = '#059669';
        } else if (type.includes('TASK') || type.includes('APPLICATION') || type.includes('HIRED')) {
          iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
          iconBg = '#EFF6FF';
          iconColor = '#2563EB';
        }

        const dateObj = new Date(item.createdAt || Date.now());
        const dateFormatted = !isNaN(dateObj.getTime())
          ? dateObj.toLocaleDateString('en-NG', {
              month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
            })
          : '';

        const diffMs = Date.now() - dateObj.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        let timeAgoStr = '';
        if (diffMins < 1) timeAgoStr = 'Just now';
        else if (diffMins < 60) timeAgoStr = `${diffMins}m ago`;
        else if (diffMins < 1440) timeAgoStr = `${Math.floor(diffMins / 60)}h ago`;
        else timeAgoStr = `${Math.floor(diffMins / 1440)}d ago`;

        const safeTitle = window.escapeHtml ? window.escapeHtml(item.title || 'Notification') : (item.title || 'Notification');
        const safeBody = window.escapeHtml ? window.escapeHtml(item.body || '') : (item.body || '');

        return `
          <div class="taska-modal-notif-row ${isUnread ? 'is-unread' : ''}" data-id="${item.id}" data-link="${item.link || ''}">
            <div class="taska-notif-icon-col" style="background:${iconBg}; color:${iconColor};">
              ${iconSvg}
            </div>
            <div class="taska-notif-content-col notif-body-click">
              <div class="taska-notif-row-header">
                <span class="taska-notif-row-title">${safeTitle}</span>
                <div class="taska-notif-row-actions">
                  ${isUnread ? `<span class="taska-notif-unread-dot" title="Unread"></span>` : ''}
                  <button type="button" class="btn-delete-single-notif taska-notif-delete-btn" data-id="${item.id}" title="Delete notification" aria-label="Delete notification">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
              <div class="taska-notif-row-meta">
                <span>${dateFormatted}</span>
                ${timeAgoStr ? `<span>· ${timeAgoStr}</span>` : ''}
              </div>
              <div class="taska-notif-row-body">${safeBody}</div>
            </div>
          </div>
        `;
      }).join('');

      // Wire click on notification body to mark read & navigate
      bodyEl.querySelectorAll('.notif-body-click').forEach(bodyDiv => {
        bodyDiv.onclick = async () => {
          const row = bodyDiv.closest('.taska-modal-notif-row');
          const id = row.getAttribute('data-id');
          const link = row.getAttribute('data-link');
          if (id && window.supabaseClient) {
            try {
              await window.supabaseClient.from('Notification').update({ isRead: true }).eq('id', id);
              window.fetchTaskaNotifications();
            } catch (_) {}
          }
          if (link) {
            window.location.href = normalizeNotificationUrl(link);
          }
        };
      });

      // Wire individual delete buttons
      bodyEl.querySelectorAll('.btn-delete-single-notif').forEach(delBtn => {
        delBtn.onclick = async (e) => {
          e.stopPropagation();
          const notifId = delBtn.getAttribute('data-id');
          if (!notifId || !window.supabaseClient) return;

          delBtn.disabled = true;
          try {
            const { error } = await window.supabaseClient
              .from('Notification')
              .delete()
              .eq('id', notifId);

            if (error) throw error;

            // Remove from memory
            window.__taskaNotifications = (window.__taskaNotifications || []).filter(n => n.id !== notifId);
            renderNotificationDrawerList(window.__taskaNotifications);

            // Animate removal from modal
            const row = delBtn.closest('.taska-modal-notif-row');
            if (row) {
              row.style.opacity = '0';
              row.style.transform = 'scale(0.95)';
              setTimeout(() => {
                row.remove();
                if (window.openAllNotificationsModal) {
                  window.openAllNotificationsModal(window.__taskaNotifications);
                }
              }, 150);
            }

            // Update badge count
            const unreadCount = (window.__taskaNotifications || []).filter(n => !n.isRead).length;
            document.querySelectorAll('.taska-notif-badge').forEach(badge => {
              if (unreadCount > 0) {
                badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                badge.style.display = 'inline-flex';
              } else {
                badge.style.display = 'none';
              }
            });

            if (window.showToast) window.showToast('Notification deleted');
          } catch (err) {
            console.error('Delete single notification error:', err);
            delBtn.disabled = false;
            if (window.showToast) window.showToast('Could not delete notification');
          }
        };
      });
    }

    modal.style.display = 'flex';
  };

  // Polling interval every 30s to update unread notifications automatically
  setInterval(() => {
    if (window.fetchTaskaNotifications) window.fetchTaskaNotifications();
  }, 30000);

  // Auto-init on DOMContentLoaded and upon profile ready
  document.addEventListener('DOMContentLoaded', () => {
    window.initSidebar();
  });

  window.addEventListener('taska:ready', () => {
    window.initSidebar();
  });

})();
