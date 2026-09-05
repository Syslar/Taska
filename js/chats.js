/**
 * Taska Messaging & Chat Page Controller
 * Real-time messaging, multi-device mobile responsive, Supabase Realtime + smart polling fallback.
 */

let currentProfile = null;
let activeChatPeerId = null;
let activeChatTaskId = null;
let activeChatTaskData = null;
let chatPollInterval = null;
let chatRealtimeChannel = null;
let selectedChatMediaFile = null;
let cachedConversations = [];
let lastLoadedMessageIds = '';

if (typeof window.openImageLightbox !== 'function') {
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
}

async function resolveUserProfile() {
  if (window.__taskaProfile) return window.__taskaProfile;

  let profile = null;
  if (typeof window.ensureTaskaProfile === 'function') {
    profile = await window.ensureTaskaProfile();
  }

  if (!profile) {
    profile = await new Promise((resolve) => {
      const onReady = () => {
        window.removeEventListener('taska:ready', onReady);
        resolve(window.__taskaProfile || null);
      };
      window.addEventListener('taska:ready', onReady);
      setTimeout(() => {
        window.removeEventListener('taska:ready', onReady);
        resolve(window.__taskaProfile || null);
      }, 5000);
    });
  }

  if (!profile) {
    try {
      const cached = localStorage.getItem('taska_cached_profile');
      if (cached) profile = JSON.parse(cached);
    } catch (_) {}
  }

  return profile;
}

async function initChatsPage() {
  currentProfile = await resolveUserProfile();
  if (!currentProfile) {
    console.warn('[Chats] Waiting for authenticated user session...');
    return;
  }

  // Ensure Supabase client is initialized
  if (!window.supabaseClient && window.supabase && window.supabase.createClient) {
    window.supabaseClient = window.supabase.createClient(
      'https://nhittvkskzwpeinscxir.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXR0dmtza3p3cGVpbnNjeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNzY2MzQsImV4cCI6MjA5ODk1MjYzNH0.dII7qIobUbjdAAijn1mYQuu543djIL2sSROY5egQaMc'
    );
  }

  // Parse URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const targetUserParam = urlParams.get('user');
  const targetTaskParam = urlParams.get('task');

  if (targetTaskParam) {
    activeChatTaskId = targetTaskParam;
    loadTaskContext(targetTaskParam);
  }

  if (targetUserParam) {
    await resolveTargetUserParam(targetUserParam);
  }

  // Initial load of conversation threads
  await loadChatConversations();

  // If a user was specified in the URL, open that conversation
  if (activeChatPeerId) {
    await selectChatConversation(activeChatPeerId, activeChatTaskId);
  }

  // Bind Mobile Back Button
  const mobileBackBtn = document.getElementById('chat-mobile-back-btn');
  if (mobileBackBtn) {
    mobileBackBtn.onclick = () => {
      deselectActiveChat();
    };
  }

  // Search / filter conversations
  const searchInput = document.getElementById('chat-threads-search');
  if (searchInput) {
    searchInput.oninput = (e) => {
      const query = (e.target.value || '').trim().toLowerCase();
      filterConversationList(query);
    };
  }

  // Media attachment picker handler
  setupMediaPicker();

  // Form submission handler
  setupSendMessageForm();

  // Setup Supabase Realtime channel for instant message delivery
  setupRealtimeSubscription();

  // Polling fallback every 5 seconds
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => {
    if (activeChatPeerId) {
      loadChatMessages(activeChatPeerId, true);
    }
    loadChatConversations(true);
  }, 5000);
}

async function resolveTargetUserParam(userParam) {
  if (!userParam || !window.supabaseClient) return;

  try {
    let query = window.supabaseClient
      .from('Profile')
      .select('id, firstName, lastName, username, avatarUrl, isVerified, role, userId');

    if (userParam.startsWith('user_')) {
      query = query.eq('userId', userParam);
    } else {
      query = query.eq('id', userParam);
    }

    const { data: peer, error } = await query.maybeSingle();
    if (!error && peer) {
      if (currentProfile && peer.id === currentProfile.id) {
        if (window.showToast) window.showToast('You cannot start a chat conversation with yourself.');
        activeChatPeerId = null;
        return;
      }
      activeChatPeerId = peer.id;
    }
  } catch (err) {
    console.warn('[Chats] Failed to resolve target user param:', err);
  }
}

async function loadTaskContext(taskId) {
  if (!taskId || !window.supabaseClient) return;
  try {
    const { data: task } = await window.supabaseClient
      .from('Task')
      .select('id, title, budget, budgetType, status')
      .eq('id', taskId)
      .maybeSingle();

    if (task) {
      activeChatTaskData = task;
      renderTaskContextBadge(task);
    }
  } catch (err) {
    console.warn('[Chats] Failed to load task context:', err);
  }
}

function renderTaskContextBadge(task) {
  const badgeWrap = document.getElementById('chat-header-task-context');
  const linkEl = document.getElementById('chat-header-task-link');
  if (!badgeWrap || !linkEl) return;

  if (!task) {
    badgeWrap.style.display = 'none';
    return;
  }

  const budgetStr = task.budget ? ` · ${window.formatNaira ? window.formatNaira(task.budget) : '₦' + task.budget}` : '';
  const safeTitle = window.escapeHtml ? window.escapeHtml(task.title) : task.title;

  linkEl.textContent = `${task.title}${budgetStr}`;
  linkEl.href = `/task-details?id=${task.id}`;
  badgeWrap.style.display = 'inline-flex';
}

async function loadChatConversations(silent = false) {
  if (!currentProfile || !window.supabaseClient) return;

  const container = document.getElementById('chat-threads-list');
  if (!container) return;

  try {
    const { data: messages, error } = await window.supabaseClient
      .from('Message')
      .select('*, sender:senderId(id, firstName, lastName, username, avatarUrl, isVerified, role), receiver:receiverId(id, firstName, lastName, username, avatarUrl, isVerified, role)')
      .or(`senderId.eq.${currentProfile.id},receiverId.eq.${currentProfile.id}`)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const peersMap = new Map();
    (messages || []).forEach(m => {
      const isSender = m.senderId === currentProfile.id;
      const peer = isSender ? m.receiver : m.sender;
      if (peer && peer.id) {
        if (!peersMap.has(peer.id)) {
          peersMap.set(peer.id, {
            peer: peer,
            taskId: m.taskId || null,
            lastMsg: m.body || m.content || (m.mediaUrl ? '📎 Attachment' : 'Message'),
            time: formatMessageTime(m.createdAt),
            rawTime: new Date(m.createdAt).getTime(),
            unreadCount: 0
          });
        }
        // Count unread incoming messages from this user
        if (!isSender && !m.readAt) {
          const conv = peersMap.get(peer.id);
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }
      }
    });

    // If there is an activeChatPeerId that does NOT have any messages yet, insert a placeholder at the top
    if (activeChatPeerId && !peersMap.has(activeChatPeerId)) {
      const { data: draftPeer } = await window.supabaseClient
        .from('Profile')
        .select('id, firstName, lastName, username, avatarUrl, isVerified, role')
        .eq('id', activeChatPeerId)
        .maybeSingle();

      if (draftPeer) {
        peersMap.set(activeChatPeerId, {
          peer: draftPeer,
          taskId: activeChatTaskId,
          lastMsg: 'New conversation (send a message)',
          time: 'Draft',
          rawTime: Date.now() + 1000,
          unreadCount: 0
        });
      }
    }

    cachedConversations = Array.from(peersMap.values());

    const countEl = document.getElementById('chat-threads-count');
    if (countEl) countEl.textContent = peersMap.size;

    const searchVal = (document.getElementById('chat-threads-search')?.value || '').trim().toLowerCase();
    if (searchVal) {
      filterConversationList(searchVal);
    } else {
      renderConversationList(cachedConversations);
    }

  } catch (err) {
    console.error('[Chats] Load conversations error:', err);
    if (!silent && container) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted); font-size:0.85rem;">Failed to load conversations.</div>';
    }
  }
}

function renderConversationList(threads) {
  const container = document.getElementById('chat-threads-list');
  if (!container) return;

  if (!threads || threads.length === 0) {
    container.innerHTML = `
      <div style="padding:32px 16px; text-align:center; color:var(--muted); font-size:0.85rem;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="margin-bottom:8px; opacity:0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <div>No conversations yet.</div>
        <div style="font-size:0.78rem; margin-top:4px;">Messages with Taskers and Posters will appear here.</div>
      </div>
    `;
    return;
  }

  let html = '';
  threads.forEach(item => {
    const p = item.peer;
    const isActive = p.id === activeChatPeerId;
    const unreadCount = item.unreadCount || 0;
    const rawName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.username || 'Taska User';
    const pName = window.escapeHtml ? window.escapeHtml(rawName) : rawName;
    const safeLastMsg = window.escapeHtml ? window.escapeHtml(item.lastMsg) : item.lastMsg;
    const avatarHTML = p.avatarUrl
      ? `<img src="${p.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="${pName}">`
      : (p.firstName || 'U')[0].toUpperCase();

    html += `
      <div class="chat-thread-item ${isActive ? 'is-active' : ''} ${unreadCount > 0 ? 'has-unread' : ''}" data-peer-id="${p.id}" data-task-id="${item.taskId || ''}">
        <div class="sidebar-user-avatar" style="width:38px; height:38px; font-size:0.88rem; flex-shrink:0;">${avatarHTML}</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span style="font-weight:${unreadCount > 0 ? '700' : '600'}; font-size:0.86rem; color:var(--green-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pName}</span>
            <span style="font-size:0.7rem; color:${unreadCount > 0 ? 'var(--green-600, #16a34a)' : 'var(--muted)'}; font-weight:${unreadCount > 0 ? '700' : 'normal'}; flex-shrink:0;">${item.time}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-top:2px;">
            <div style="font-size:0.78rem; color:${isActive ? 'var(--green-900)' : (unreadCount > 0 ? 'var(--green-950, #0a2717)' : 'var(--muted)')}; font-weight:${unreadCount > 0 ? '600' : 'normal'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1;">${safeLastMsg}</div>
            ${unreadCount > 0 ? `<span class="chat-thread-unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind thread clicks
  container.querySelectorAll('.chat-thread-item').forEach(el => {
    el.addEventListener('click', () => {
      const pId = el.dataset.peerId;
      const tId = el.dataset.taskId || null;
      selectChatConversation(pId, tId);
    });
  });
}

function filterConversationList(query) {
  if (!query) {
    renderConversationList(cachedConversations);
    return;
  }

  const filtered = cachedConversations.filter(c => {
    const fullName = `${c.peer?.firstName || ''} ${c.peer?.lastName || ''}`.toLowerCase();
    const username = (c.peer?.username || '').toLowerCase();
    const lastMsg = (c.lastMsg || '').toLowerCase();
    return fullName.includes(query) || username.includes(query) || lastMsg.includes(query);
  });

  renderConversationList(filtered);
}

async function selectChatConversation(peerId, taskId = null) {
  if (!peerId) return;

  activeChatPeerId = peerId;
  if (taskId) {
    activeChatTaskId = taskId;
    loadTaskContext(taskId);
  }

  // Mark all unread messages from this peer as read
  markMessagesAsRead(peerId);

  // Add mobile class so the chat panel occupies full screen on mobile
  const container = document.getElementById('chat-container');
  if (container) {
    container.classList.add('has-active-chat');
  }

  // Update active state in left thread list
  document.querySelectorAll('.chat-thread-item').forEach(el => {
    if (el.dataset.peerId === peerId) {
      el.classList.add('is-active');
    } else {
      el.classList.remove('is-active');
    }
  });

  // Load and display peer details in the chat header
  await loadPeerHeader(peerId);

  // Load message history
  await loadChatMessages(peerId);
}

async function markMessagesAsRead(peerId) {
  if (!window.supabaseClient || !currentProfile || !peerId) return;

  try {
    const { error } = await window.supabaseClient
      .from('Message')
      .update({ readAt: new Date().toISOString() })
      .eq('senderId', peerId)
      .eq('receiverId', currentProfile.id)
      .is('readAt', null);

    if (!error) {
      if (Array.isArray(cachedConversations)) {
        const conv = cachedConversations.find(c => c.peer?.id === peerId);
        if (conv && conv.unreadCount > 0) {
          conv.unreadCount = 0;
          renderConversationList(cachedConversations);
        }
      }
      if (typeof window.fetchUnreadChatsCount === 'function') {
        window.fetchUnreadChatsCount();
      }
    }
  } catch (err) {
    console.warn('[Chats] Error marking messages as read:', err);
  }
}

function deselectActiveChat() {
  activeChatPeerId = null;
  const container = document.getElementById('chat-container');
  if (container) {
    container.classList.remove('has-active-chat');
  }

  document.querySelectorAll('.chat-thread-item').forEach(el => {
    el.classList.remove('is-active');
  });

  const peerNameEl = document.getElementById('chat-peer-name');
  const peerUserEl = document.getElementById('chat-peer-username');
  const peerAvatar = document.getElementById('chat-peer-avatar');
  const taskBadge = document.getElementById('chat-header-task-context');

  if (peerNameEl) peerNameEl.textContent = 'Select a conversation';
  if (peerUserEl) peerUserEl.textContent = 'Select a thread on the left to start chatting';
  if (peerAvatar) peerAvatar.textContent = '--';
  if (taskBadge) taskBadge.style.display = 'none';

  const bodyEl = document.getElementById('chat-messages-body');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div style="margin:auto; text-align:center; color:var(--muted); font-size:0.9rem; display:flex; flex-direction:column; align-items:center; gap:10px; padding:20px;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="color:var(--muted); opacity:0.6;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span style="font-weight:600; color:var(--green-900);">No conversation selected</span>
        <span style="font-size:0.82rem; max-width:300px; line-height:1.4;">Select a thread on the left or click &ldquo;Message&rdquo; on any task or applicant to chat.</span>
      </div>
    `;
  }
}

async function loadPeerHeader(peerId) {
  if (!window.supabaseClient) return;

  try {
    const { data: peer } = await window.supabaseClient
      .from('Profile')
      .select('id, firstName, lastName, username, avatarUrl, isVerified, role')
      .eq('id', peerId)
      .maybeSingle();

    if (peer) {
      const rawName = `${peer.firstName || ''} ${peer.lastName || ''}`.trim() || peer.username || 'User';
      const pName = window.escapeHtml ? window.escapeHtml(rawName) : rawName;
      const peerAvatar = document.getElementById('chat-peer-avatar');
      const peerNameEl = document.getElementById('chat-peer-name');
      const peerUserEl = document.getElementById('chat-peer-username');

      if (peerAvatar) {
        if (peer.avatarUrl) {
          peerAvatar.innerHTML = `<img src="${peer.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="${pName}">`;
        } else {
          peerAvatar.textContent = (peer.firstName || 'U')[0].toUpperCase();
        }
      }

      const isTasker = peer.role === 'TASKER';
      const userParam = peer.username ? `u=${encodeURIComponent(peer.username)}` : `id=${peer.id}`;
      const profilePath = isTasker ? `/tasker/profile?${userParam}` : `/poster/profile?${userParam}`;
      const checkIcon = window.TaskaIcons?.verified || '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; display:inline-block;"><polyline points="20 6 9 17 4 12"/></svg>';

      if (peerNameEl) {
        peerNameEl.innerHTML = `
          <a href="${profilePath}" style="color:var(--green-900); text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
            ${pName}
            ${peer.isVerified ? `<span style="color:var(--green-700); font-size:0.8rem;" title="Verified Member">${checkIcon}</span>` : ''}
          </a>
        `;
      }

      if (peerUserEl) {
        peerUserEl.innerHTML = `
          <span>@${window.escapeHtml ? window.escapeHtml(peer.username || 'user') : peer.username}</span>
          <span style="margin:0 4px;">·</span>
          <span style="color:var(--green-800); font-weight:600;">${isTasker ? 'Tasker' : 'Poster'}</span>
        `;
      }
    }
  } catch (err) {
    console.warn('[Chats] Error loading peer header:', err);
  }
}

async function loadChatMessages(peerId, silent = false) {
  if (!currentProfile || !window.supabaseClient || !peerId) return;

  const bodyEl = document.getElementById('chat-messages-body');
  if (!bodyEl) return;

  if (!silent && !bodyEl.dataset.hasLoaded) {
    bodyEl.innerHTML = '<div style="margin:auto; color:var(--muted); font-size:0.88rem;">Loading messages…</div>';
  }

  try {
    const { data: messages, error } = await window.supabaseClient
      .from('Message')
      .select('*')
      .or(`and(senderId.eq.${currentProfile.id},receiverId.eq.${peerId}),and(senderId.eq.${peerId},receiverId.eq.${currentProfile.id})`)
      .order('createdAt', { ascending: true });

    if (error) throw error;

    bodyEl.dataset.hasLoaded = 'true';

    // Track if message list changed to prevent DOM jumping & image flickering
    const currentMsgIds = (messages || []).map(m => m.id).join(',');
    if (currentMsgIds === lastLoadedMessageIds && silent) {
      return;
    }
    lastLoadedMessageIds = currentMsgIds;

    if (!messages || messages.length === 0) {
      bodyEl.innerHTML = `
        <div style="margin:auto; text-align:center; color:var(--muted); font-size:0.88rem; padding:20px;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="margin-bottom:8px; opacity:0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <div style="font-weight:600; color:var(--green-900); margin-bottom:4px;">No messages yet</div>
          <div>Send a message below to start this conversation!</div>
        </div>
      `;
      return;
    }

    const isNearBottom = (bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight) < 100;

    let html = '';
    messages.forEach(m => {
      html += buildMessageBubbleHTML(m, currentProfile);
    });

    bodyEl.innerHTML = html;

    // Auto-scroll to bottom on first load, or if user is already near bottom
    if (!silent || isNearBottom) {
      bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    // Mark any unread messages from this peer as read
    const hasUnread = (messages || []).some(m => m.senderId === peerId && !m.readAt);
    if (hasUnread) {
      markMessagesAsRead(peerId);
    }
  } catch (err) {
    console.error('[Chats] Load chat messages error:', err);
    if (!silent) {
      bodyEl.innerHTML = '<div style="margin:auto; color:var(--muted); font-size:0.88rem;">Failed to load messages.</div>';
    }
  }
}

function buildMessageBubbleHTML(m, profile) {
  const isMine = m.senderId === profile.id;
  const timeStr = formatMessageTime(m.createdAt);
  const rawText = m.body || m.content || '';
  const safeText = window.escapeHtml ? window.escapeHtml(rawText) : rawText;

  let mediaHTML = '';
  if (m.mediaUrl && typeof m.mediaUrl === 'string') {
    const trimmedUrl = m.mediaUrl.trim();
    const isSafeProtocol = /^https:\/\//i.test(trimmedUrl) || /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(trimmedUrl);
    if (isSafeProtocol) {
      const safeUrl = window.escapeHtml ? window.escapeHtml(trimmedUrl) : encodeURI(trimmedUrl);
      if (trimmedUrl.match(/\.(mp4|webm|mov)(\?.*)?$/i)) {
        mediaHTML = `<video src="${safeUrl}" controls style="max-width:260px; max-height:200px; border-radius:8px; margin-bottom:6px; display:block;"></video>`;
      } else {
        mediaHTML = `
          <div class="taska-chat-media-wrap" onclick="if(window.openImageLightbox){window.openImageLightbox('${safeUrl}', 'Attachment');} event.preventDefault(); event.stopPropagation();" style="cursor:pointer; display:inline-block; border-radius:8px; overflow:hidden;" title="Click to view full image in-app">
            <img src="${safeUrl}" alt="Attachment" class="chat-attached-image lightbox-img" style="max-width:260px; max-height:200px; border-radius:8px; margin-bottom:6px; object-fit:cover; display:block; transition:transform 0.15s ease; box-shadow:0 1px 4px rgba(0,0,0,0.1);" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
          </div>
        `;
      }
    }
  }

  const deleteBtnHTML = isMine
    ? `<button class="chat-msg-delete-btn" onclick="requestDeleteChatMessage('${m.id}', '${m.mediaUrl ? encodeURIComponent(m.mediaUrl) : ''}')" title="Delete message" aria-label="Delete message">
         <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
       </button>`
    : '';

  return `
    <div class="chat-msg-wrapper ${isMine ? 'is-mine' : 'is-peer'}" id="chat-msg-${m.id}" data-msg-id="${m.id}" style="display:flex; flex-direction:column; align-items:${isMine ? 'flex-end' : 'flex-start'}; margin-bottom:8px; position:relative;">
      <div style="display:flex; align-items:center; gap:6px; flex-direction:${isMine ? 'row' : 'row-reverse'}; max-width:85%;">
        ${isMine ? deleteBtnHTML : ''}
        <div class="chat-msg-bubble" style="max-width:100%; padding:10px 14px; border-radius:${isMine ? '14px 14px 2px 14px' : '14px 14px 14px 2px'}; background:${isMine ? 'var(--green-900)' : 'var(--paper)'}; color:${isMine ? '#fff' : 'var(--body)'}; border:${isMine ? 'none' : '1px solid var(--line)'}; font-size:0.9rem; line-height:1.45; word-break:break-word; box-shadow:0 1px 2px rgba(0,0,0,0.05); position:relative;">
          ${mediaHTML}
          ${safeText ? `<div>${safeText}</div>` : ''}
        </div>
      </div>
      <div style="font-size:0.68rem; color:var(--muted); margin-top:3px; padding:0 4px;">${timeStr}</div>
    </div>
  `;
}

window.requestDeleteChatMessage = async function(msgId, encodedMediaUrl) {
  if (!msgId || !window.supabaseClient || !currentProfile) return;

  let confirmed = false;
  if (window.showConfirmDialog) {
    confirmed = await window.showConfirmDialog({
      title: 'Delete Message?',
      message: 'Are you sure you want to delete this message? Any attachments will also be permanently removed.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      isDanger: true
    });
  } else if (window.confirm) {
    confirmed = window.confirm('Delete this message? Any attachments will also be removed.');
  } else {
    confirmed = true;
  }
  if (!confirmed) return;

  const mediaUrl = encodedMediaUrl ? decodeURIComponent(encodedMediaUrl) : null;

  try {
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.style.opacity = '0.3';
      el.style.pointerEvents = 'none';
    }

    // 1. If message had a Cloudinary media attachment, delete it from Cloudinary
    if (mediaUrl && typeof window.deleteCloudinaryMedia === 'function') {
      window.deleteCloudinaryMedia(mediaUrl).catch(err => {
        console.warn('[Chats] Cloudinary attachment cleanup notice:', err);
      });
    }

    // 2. Delete message from database
    const { error } = await window.supabaseClient
      .from('Message')
      .delete()
      .eq('id', msgId)
      .eq('senderId', currentProfile.id);

    if (error) throw error;

    // 3. Smoothly animate out and remove from DOM
    if (el) {
      el.style.transition = 'all 0.2s ease';
      el.style.transform = 'scale(0.95)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 200);
    }

    // 4. Update cached conversations & thread preview
    loadChatConversations(true);

    if (window.showToast) window.showToast('Message deleted');
  } catch (err) {
    console.error('[Chats] Failed to delete message:', err);
    const el = document.getElementById(`chat-msg-${msgId}`);
    if (el) {
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
    }
    if (window.showToast) window.showToast('Could not delete message. Please try again.');
  }
};

function appendSingleMessageToChat(m) {
  const bodyEl = document.getElementById('chat-messages-body');
  if (!bodyEl || !currentProfile) return;

  const isNearBottom = (bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight) < 120;
  const isMine = m.senderId === currentProfile.id;

  // If container is in "No messages yet" or loading state, clear it
  if (!bodyEl.dataset.hasLoaded || bodyEl.querySelector('svg')) {
    bodyEl.innerHTML = '';
    bodyEl.dataset.hasLoaded = 'true';
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildMessageBubbleHTML(m, currentProfile);
  bodyEl.appendChild(wrapper.firstElementChild);

  if (isMine || isNearBottom) {
    bodyEl.scrollTop = bodyEl.scrollHeight;
  }
}

function setupMediaPicker() {
  const fileInput = document.getElementById('chatFileInput');
  if (!fileInput) return;

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      if (window.showToast) window.showToast('Maximum media file size is 5MB.');
      fileInput.value = '';
      return;
    }

    selectedChatMediaFile = file;
    const previewWrap = document.getElementById('chat-media-preview-wrap');
    const filenameEl = document.getElementById('chat-media-filename');
    if (previewWrap && filenameEl) {
      filenameEl.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
      previewWrap.style.display = 'flex';
    }
  };

  document.getElementById('chat-media-remove-btn')?.addEventListener('click', () => {
    selectedChatMediaFile = null;
    if (fileInput) fileInput.value = '';
    const previewWrap = document.getElementById('chat-media-preview-wrap');
    if (previewWrap) previewWrap.style.display = 'none';
  });
}

function setupSendMessageForm() {
  const form = document.getElementById('chat-send-form');
  const input = document.getElementById('chatInputText');
  const sendBtn = document.getElementById('chatSendBtn');

  if (!form) return;

  // Send on Enter key press
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!activeChatPeerId) {
      if (window.showToast) window.showToast('Please select a conversation from the list first.');
      return;
    }

    const bodyText = input ? input.value.trim() : '';
    if (!bodyText && !selectedChatMediaFile) return;

    let mediaUrl = null;
    if (selectedChatMediaFile) {
      if (window.showToast) window.showToast('Uploading attachment...');
      if (typeof window.uploadTaskaMedia === 'function') {
        mediaUrl = await window.uploadTaskaMedia(selectedChatMediaFile);
      }
      if (!mediaUrl) {
        if (window.showToast) window.showToast('Failed to upload attachment. Please try again.');
        return;
      }
    }

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = '0.7';
    }

    try {
      const payload = {
        senderId: currentProfile.id,
        receiverId: activeChatPeerId,
        taskId: activeChatTaskId || null,
        body: bodyText,
        content: bodyText,
        mediaUrl: mediaUrl
      };

      const { data: inserted, error } = await window.supabaseClient
        .from('Message')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      // Clear input and attachments
      if (input) input.value = '';
      selectedChatMediaFile = null;
      const fileInput = document.getElementById('chatFileInput');
      if (fileInput) fileInput.value = '';
      const previewWrap = document.getElementById('chat-media-preview-wrap');
      if (previewWrap) previewWrap.style.display = 'none';

      // Optimistically append the sent message
      if (inserted) {
        appendSingleMessageToChat(inserted);
      }

      // Notify recipient
      dispatchNotification(activeChatPeerId, bodyText || 'Sent an attachment');

      // Refresh conversations list in background
      loadChatConversations(true);

    } catch (err) {
      console.error('[Chats] Send message error:', err);
      if (window.showToast) {
        window.showToast(`Could not send message: ${err.message || 'Please check your connection'}`);
      }
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
      }
      if (input) input.focus();
    }
  });
}

function setupRealtimeSubscription() {
  if (!window.supabaseClient) return;

  try {
    chatRealtimeChannel = window.supabaseClient
      .channel('public:Message')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Message' }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id;
          if (deletedId) {
            const el = document.getElementById(`chat-msg-${deletedId}`);
            if (el) el.remove();
          }
          loadChatConversations(true);
          return;
        }

        const newMsg = payload.new;
        if (!newMsg || !currentProfile) return;

        // Check if message belongs to current active conversation
        const isCurrentThread =
          (newMsg.senderId === currentProfile.id && newMsg.receiverId === activeChatPeerId) ||
          (newMsg.senderId === activeChatPeerId && newMsg.receiverId === currentProfile.id);

        if (isCurrentThread && payload.eventType === 'INSERT') {
          // If message was from peer, append it directly and mark as read immediately
          if (newMsg.senderId !== currentProfile.id) {
            appendSingleMessageToChat(newMsg);
            markMessagesAsRead(activeChatPeerId);
          }
        }

        // Refresh thread sidebar
        loadChatConversations(true);
      })
      .subscribe();
  } catch (err) {
    console.warn('[Chats] Realtime subscription initialization notice:', err);
  }
}

async function dispatchNotification(peerId, snippet) {
  if (!window.supabaseClient || !peerId || !currentProfile) return;

  try {
    const { data: peer } = await window.supabaseClient
      .from('Profile')
      .select('userId, email')
      .eq('id', peerId)
      .maybeSingle();

    const senderName = `${currentProfile.firstName || ''} ${currentProfile.lastName || ''}`.trim() || 'Taska User';
    const notifTitle = `New message from ${senderName}`;
    const truncatedBody = snippet.length > 90 ? snippet.substring(0, 90) + '…' : snippet;

    // NOTE: Direct user-to-user chat messages are indicated via the sidebar chat badge
    // and thread badge, and are not placed under in-app notifications.

    // Global webhook / email dispatcher if configured
    if (window.sendTaskaNotification && peer) {
      window.sendTaskaNotification({
        type: 'NEW_MESSAGE',
        profileId: peerId,
        userId: peer.userId,
        toEmail: peer.email,
        title: notifTitle,
        body: truncatedBody,
        link: `/chats?user=${currentProfile.id}`
      }).catch(() => {});
    }
  } catch (_) {}
}

function formatMessageTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Initialize on DOM ready or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initChatsPage());
} else {
  initChatsPage();
}
