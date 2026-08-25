/**
 * Dynamic Sidebar & Topbar Component Builder for Taska
 * 100% Emoji-Free, Pure SVG Production Icons & Robust Multi-Depth Routing.
 */
(function() {

  window.initSidebar = async function() {
    const path = window.location.pathname;
    const hash = window.location.hash.replace('#', '') || '';

    // Determine subfolder location & calculate relative root links
    const inPoster   = path.includes('/Poster/');
    const inTasker   = path.includes('/Tasker/');
    const inSettings = path.includes('/Settings/');
    const inChats    = path.includes('/Chats/');
    const inWallet   = path.includes('/Wallet/');

    let storedRole = null;
    try { storedRole = localStorage.getItem('taska_active_role'); } catch (_) {}
    const currentRole  = inTasker ? 'TASKER' : inPoster ? 'POSTER' : (storedRole || (window.getTaskaRole ? window.getTaskaRole() : 'POSTER'));
    const isTaskerMode = currentRole === 'TASKER';

    const posterRoot   = inPoster   ? '../' : (inTasker ? '../../Poster/' : '../Poster/');
    const taskerRoot   = inTasker   ? '../' : (inPoster ? '../../Tasker/' : '../Tasker/');
    const settingsRoot = inSettings ? ''    : (inPoster || inTasker ? '../../Settings/' : '../Settings/');
    const chatsRoot    = inChats    ? ''    : (inPoster || inTasker ? '../../Chats/' : '../Chats/');
    const walletRoot   = inWallet   ? ''    : (inPoster || inTasker ? '../../Wallet/' : '../Wallet/');
    const assetsRoot   = (inPoster || inTasker) ? '../../Assets/' : (inSettings || inChats || inWallet ? '../Assets/' : 'Assets/');

    const profileLink = isTaskerMode ? `${taskerRoot}Profile/index.html` : `${posterRoot}Profile/index.html`;

    // Determine active tab
    let activeTab = 'dashboard';
    if (inSettings) activeTab = 'settings';
    else if (inChats) activeTab = 'messages';
    else if (inWallet) activeTab = 'wallet';
    else if (path.includes('Profile/')) activeTab = 'profile';
    else if (path.includes('BrowseTasks/')) activeTab = 'browse';
    else if (path.includes('PostTask/')) activeTab = 'post';
    else if (path.includes('MyPostedTasks/') || path.includes('MyApplications/')) activeTab = 'my-tasks';
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

    // Declare all URL vars once, hoisted above all usages
    const dashUrl    = isTaskerMode ? `${taskerRoot}Dashboard/index.html`       : `${posterRoot}Dashboard/index.html`;
    const myTasksUrl = isTaskerMode ? `${taskerRoot}MyApplications/index.html`  : `${posterRoot}MyPostedTasks/index.html`;
    const actionUrl  = isTaskerMode ? `${taskerRoot}BrowseTasks/index.html`     : `${posterRoot}PostTask/index.html`;

    const sidebarEl = document.getElementById('sidebar') || document.querySelector('aside.sidebar');
    if (sidebarEl) {

      sidebarEl.innerHTML = `
        <a href="${dashUrl}" class="sidebar-logo" style="text-decoration:none;">
          <img src="${assetsRoot}icon.png" alt="Taska" style="width:32px; height:32px; border-radius:8px; object-fit:contain; display:block;">
          <span style="font-weight:700; font-size:1.18rem; color:#fff; letter-spacing:-0.01em;">Taska</span>
        </a>

        <nav class="sidebar-nav">
          <a href="${dashUrl}" class="sidebar-link desktop-only ${activeTab === 'dashboard' ? 'is-active' : ''}" data-tab="dashboard">
            <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg></span>
            Dashboard
          </a>

          ${isTaskerMode ? `
            <a href="${taskerRoot}BrowseTasks/index.html" class="sidebar-link desktop-only ${activeTab === 'browse' ? 'is-active' : ''}" data-tab="browse">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="M21 21L16.5 16.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
              Browse Tasks
            </a>
          ` : `
            <a href="${posterRoot}PostTask/index.html" class="sidebar-link desktop-only ${activeTab === 'post' ? 'is-active' : ''}" data-tab="post">
              <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>
              Post a Task
            </a>
          `}

          <a href="${myTasksUrl}" class="sidebar-link ${activeTab === 'my-tasks' ? 'is-active' : ''}" data-tab="my-tasks">
            <span class="sidebar-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            ${isTaskerMode ? 'My Applications' : 'My Posted Tasks'}
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
            <span class="sidebar-icon">${settingsIcon}</span>
            Settings
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
        <a href="${chatsRoot}index.html" class="tab-item ${activeTab === 'messages' ? 'is-active' : ''}" data-tab="messages">
          <svg viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="1.7"/></svg>
          Chats
        </a>
        <a href="${walletRoot}index.html" class="tab-item ${activeTab === 'wallet' ? 'is-active' : ''}" data-tab="wallet">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M3 10H21" stroke="currentColor" stroke-width="1.7"/></svg>
          Wallet
        </a>
      </div>
    `;

    // Inject Desktop Header Notification Bell if header action area exists
    const appHeader = document.querySelector('.app-header');
    if (appHeader && !document.getElementById('desktop-notif-bell')) {
      let actionArea = appHeader.querySelector('div[style*="display:flex"]') || appHeader.querySelector('div:last-child');
      if (actionArea && actionArea !== appHeader.firstElementChild) {
        const bellBtn = document.createElement('button');
        bellBtn.id = 'desktop-notif-bell';
        bellBtn.className = 'btn btn-secondary btn-sm taska-notif-bell-btn desktop-only';
        bellBtn.style.cssText = 'position:relative; border-radius:var(--radius-pill); display:inline-flex; align-items:center; gap:6px; margin-right:4px;';
        bellBtn.innerHTML = `
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span>Notifications</span>
          <span class="taska-notif-badge" id="desktop-notif-badge" style="display:none; background:#EF4444; color:#fff; font-size:0.68rem; font-weight:700; border-radius:999px; padding:1px 6px; line-height:1.2;">0</span>
        `;
        actionArea.insertBefore(bellBtn, actionArea.firstChild);
      }
    }

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
        const path = window.location.pathname;
        const inPoster = path.includes('/Poster/');
        const inTasker = path.includes('/Tasker/');
        const target = (inPoster || inTasker) ? '../../Settings/index.html' : (path.includes('/Settings/') ? 'index.html' : '../Settings/index.html');
        window.location.href = target;
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
        const path = window.location.pathname;
        const inSubSub = path.includes('/Poster/') || path.includes('/Tasker/');
        window.location.href = inSubSub ? '../../Auth/login.html' : '../Auth/login.html';
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

      renderNotificationDrawerList(list || []);
    } catch (err) {
      console.error('[Notifications] Fetch exception:', err);
    }
  };

  window.toggleNotificationDrawer = function() {
    let container = document.getElementById('taska-notification-drawer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'taska-notification-drawer';
      container.style.cssText = `
        position: fixed; inset: 0; z-index: 999999; display: flex; justify-content: flex-end;
        background: rgba(0,0,0,0.45); backdrop-filter: blur(3px); opacity: 0; transition: opacity 0.2s ease;
      `;
      container.innerHTML = `
        <div style="background:var(--paper, #fff); width:100%; max-width:420px; height:100%; display:flex; flex-direction:column; box-shadow:-8px 0 32px rgba(0,0,0,0.25); transform:translateX(100%); transition:transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
          <div style="padding:18px 20px; border-bottom:1px solid var(--line, #e2e8f0); display:flex; align-items:center; justify-content:space-between; background:var(--surface, #fff);">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:34px; height:34px; border-radius:50%; background:var(--mint-100, #E1F5E8); color:var(--green-700, #146C34); display:flex; align-items:center; justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <h3 style="font-size:1.1rem; margin:0; color:var(--green-900);">Notifications</h3>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button id="taska-mark-all-read-btn" style="background:none; border:none; color:var(--green-700); font-weight:600; font-size:0.78rem; cursor:pointer; padding:4px 8px; border-radius:6px;">Mark all read</button>
              <button id="taska-close-notif-drawer" style="background:none; border:none; color:var(--muted); font-size:1.3rem; cursor:pointer; padding:4px 8px;" aria-label="Close">✕</button>
            </div>
          </div>

          <div id="taska-notif-list-container" style="flex:1; overflow-y:auto; padding:12px 16px;">
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

    listEl.innerHTML = list.map(item => {
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

      return `
        <div class="taska-notif-item" data-id="${item.id}" data-link="${item.link || ''}" style="padding:14px; border-radius:var(--radius-sm, 10px); margin-bottom:8px; background:${isUnread ? 'rgba(34,145,80,0.06)' : 'var(--surface, #fff)'}; border:1px solid ${isUnread ? 'var(--mint-150, #CDEEDA)' : 'var(--line, #e2e8f0)'}; cursor:pointer; transition:transform 0.12s ease, background 0.12s ease; display:flex; gap:12px; align-items:flex-start; position:relative;">
          <div style="width:36px; height:36px; border-radius:50%; background:${iconBg}; color:${iconColor}; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px;">
            ${iconSvg}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
              <span style="font-weight:600; font-size:0.86rem; color:var(--green-900); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:8px;">${item.title || 'Notification'}</span>
              <span style="font-size:0.72rem; color:var(--muted); white-space:nowrap;">${timeStr}</span>
            </div>
            <div style="font-size:0.8rem; color:var(--ink-soft); line-height:1.4; word-break:break-word;">${item.body || ''}</div>
          </div>
          ${isUnread ? `<span style="width:8px; height:8px; border-radius:50%; background:#EF4444; position:absolute; top:12px; right:12px;"></span>` : ''}
        </div>
      `;
    }).join('');

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
        if (link) window.location.href = link;
      };
    });
  }

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
