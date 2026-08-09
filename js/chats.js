/**
 * Taska Messaging & Chat Page Controller
 */

let activeChatPeerId = null;
let activeChatTaskId = null;
let chatPollInterval = null;
let selectedChatMediaFile = null;

async function initChatsPage() {
  const profile = await window.ensureTaskaProfile();
  if (!profile) return;

  // Check URL params for direct chat target
  const urlParams = new URLSearchParams(window.location.search);
  const targetUser = urlParams.get('user');
  const targetTask = urlParams.get('task');

  if (targetUser) {
    activeChatPeerId = targetUser;
  }
  if (targetTask) {
    activeChatTaskId = targetTask;
  }

  await loadChatConversations();

  if (activeChatPeerId) {
    await selectChatConversation(activeChatPeerId, activeChatTaskId);
  }

  // Setup media file picker change handler
  const fileInput = document.getElementById('chatFileInput');
  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('Maximum size for media is 5MB.');
        fileInput.value = '';
        return;
      }
      selectedChatMediaFile = file;
      const previewWrap = document.getElementById('chat-media-preview-wrap');
      const filenameEl = document.getElementById('chat-media-filename');
      if (previewWrap && filenameEl) {
        filenameEl.textContent = `📎 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
        previewWrap.style.display = 'flex';
      }
    };
  }

  document.getElementById('chat-media-remove-btn')?.addEventListener('click', () => {
    selectedChatMediaFile = null;
    const fileInput = document.getElementById('chatFileInput');
    if (fileInput) fileInput.value = '';
    const previewWrap = document.getElementById('chat-media-preview-wrap');
    if (previewWrap) previewWrap.style.display = 'none';
  });

  // Chat message send handler
  document.getElementById('chat-send-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeChatPeerId) {
      if (window.showToast) window.showToast('Please select a conversation thread first.');
      return;
    }

    const input = document.getElementById('chatInputText');
    const bodyText = input ? input.value.trim() : '';

    if (!bodyText && !selectedChatMediaFile) return;

    let mediaUrl = null;
    if (selectedChatMediaFile) {
      if (window.showToast) window.showToast('Uploading attachment...');
      mediaUrl = await window.uploadTaskaMedia(selectedChatMediaFile);
      if (!mediaUrl) {
        if (window.showToast) window.showToast('Failed to upload media attachment.');
        return;
      }
    }

    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
      const { error } = await window.supabaseClient
        .from('Message')
        .insert({
          senderId: profile.id,
          receiverId: activeChatPeerId,
          taskId: activeChatTaskId || null,
          body: bodyText,
          content: bodyText,
          mediaUrl: mediaUrl
        });

      if (error) throw error;

      if (input) input.value = '';
      selectedChatMediaFile = null;
      const fileInput = document.getElementById('chatFileInput');
      if (fileInput) fileInput.value = '';
      const previewWrap = document.getElementById('chat-media-preview-wrap');
      if (previewWrap) previewWrap.style.display = 'none';

      await loadChatMessages(activeChatPeerId);
      await loadChatConversations();
    } catch (err) {
      console.error('Send message error:', err);
      if (window.showToast) window.showToast('Could not send message.');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  });

  // Poll for new messages every 4 seconds
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(() => {
    if (activeChatPeerId) {
      loadChatMessages(activeChatPeerId, true);
    }
    loadChatConversations(true);
  }, 4000);
}

async function loadChatConversations(silent = false) {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const container = document.getElementById('chat-threads-list');
  if (!container) return;

  try {
    const { data: messages, error } = await window.supabaseClient
      .from('Message')
      .select('*, sender:senderId(id, firstName, lastName, username, avatarUrl), receiver:receiverId(id, firstName, lastName, username, avatarUrl)')
      .or(`senderId.eq.${profile.id},receiverId.eq.${profile.id}`)
      .order('createdAt', { ascending: false });

    if (error) throw error;

    const peersMap = new Map();
    (messages || []).forEach(m => {
      const isSender = m.senderId === profile.id;
      const peer = isSender ? m.receiver : m.sender;
      if (peer && peer.id && !peersMap.has(peer.id)) {
        peersMap.set(peer.id, {
          peer: peer,
          lastMsg: m.body || m.content || (m.mediaUrl ? '📷 Attachment' : 'Message'),
          time: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    });

    if (peersMap.size === 0 && !activeChatPeerId) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--muted); font-size:0.85rem;">No active conversations yet.</div>';
      return;
    }

    let html = '';
    peersMap.forEach((val, pId) => {
      const p = val.peer;
      const isActive = pId === activeChatPeerId;
      const pName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.username || 'User';
      const avatarHTML = p.avatarUrl
        ? `<img src="${p.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
        : (p.firstName || 'U')[0].toUpperCase();

      html += `
        <div class="chat-thread-item ${isActive ? 'is-active' : ''}" data-peer-id="${p.id}" style="padding:10px 12px; border-radius:var(--radius-sm); cursor:pointer; display:flex; align-items:center; gap:10px; background:${isActive ? 'var(--mint-100)' : 'transparent'}; transition:background 0.15s;">
          <div class="sidebar-user-avatar" style="width:36px; height:36px; font-size:0.85rem; flex-shrink:0;">${avatarHTML}</div>
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-weight:600; font-size:0.86rem; color:var(--green-900); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${pName}</span>
              <span style="font-size:0.72rem; color:var(--muted);">${val.time}</span>
            </div>
            <div style="font-size:0.78rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${val.lastMsg}</div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

    // Bind click listeners
    container.querySelectorAll('.chat-thread-item').forEach(item => {
      item.addEventListener('click', () => {
        const pId = item.dataset.peerId;
        selectChatConversation(pId);
      });
    });
  } catch (err) {
    console.error('Load conversations error:', err);
  }
}

async function selectChatConversation(peerId, taskId = null) {
  activeChatPeerId = peerId;
  if (taskId) activeChatTaskId = taskId;

  document.querySelectorAll('.chat-thread-item').forEach(item => {
    item.style.background = item.dataset.peerId === peerId ? 'var(--mint-100)' : 'transparent';
  });

  // Load Peer Details
  try {
    const { data: peer } = await window.supabaseClient
      .from('Profile')
      .select('id, firstName, lastName, username, avatarUrl, isVerified')
      .eq('id', peerId)
      .single();

    if (peer) {
      const pName = `${peer.firstName || ''} ${peer.lastName || ''}`.trim() || peer.username || 'User';
      const peerAvatar = document.getElementById('chat-peer-avatar');
      const peerNameEl = document.getElementById('chat-peer-name');
      const peerUserEl = document.getElementById('chat-peer-username');

      if (peerAvatar) {
        if (peer.avatarUrl) {
          peerAvatar.innerHTML = `<img src="${peer.avatarUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
        } else {
          peerAvatar.textContent = (peer.firstName || 'U')[0].toUpperCase();
        }
      }

      if (peerNameEl) {
        peerNameEl.innerHTML = `<a href="../Profile/index.html?id=${peer.id}" style="color:var(--green-900); text-decoration:none;">${pName} ${peer.isVerified ? '<span style="color:var(--green-700); font-size:0.8rem;">✓</span>' : ''}</a>`;
      }
      if (peerUserEl) peerUserEl.textContent = `@${peer.username || 'user'}`;
    }
  } catch (_) {}

  await loadChatMessages(peerId);
}

async function loadChatMessages(peerId, silent = false) {
  const profile = await window.ensureTaskaProfile();
  if (!profile || !window.supabaseClient) return;

  const bodyEl = document.getElementById('chat-messages-body');
  if (!bodyEl) return;

  if (!silent) {
    bodyEl.innerHTML = '<div style="margin:auto; color:var(--muted); font-size:0.88rem;">Loading messages...</div>';
  }

  try {
    const { data: messages, error } = await window.supabaseClient
      .from('Message')
      .select('*')
      .or(`and(senderId.eq.${profile.id},receiverId.eq.${peerId}),and(senderId.eq.${peerId},receiverId.eq.${profile.id})`)
      .order('createdAt', { ascending: true });

    if (error) throw error;

    if (!messages || messages.length === 0) {
      bodyEl.innerHTML = '<div style="margin:auto; color:var(--muted); font-size:0.88rem;">No messages yet. Send a message to start the conversation!</div>';
      return;
    }

    let html = '';
    messages.forEach(m => {
      const isMine = m.senderId === profile.id;
      const timeStr = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const text = m.body || m.content || '';
      let mediaHTML = '';
      if (m.mediaUrl) {
        if (m.mediaUrl.match(/\.(mp4|webm|mov)$/i)) {
          mediaHTML = `<video src="${m.mediaUrl}" controls style="max-width:240px; max-height:180px; border-radius:8px; margin-bottom:6px; display:block;"></video>`;
        } else {
          mediaHTML = `<a href="${m.mediaUrl}" target="_blank"><img src="${m.mediaUrl}" style="max-width:240px; max-height:180px; border-radius:8px; margin-bottom:6px; object-fit:cover; display:block;"></a>`;
        }
      }

      html += `
        <div style="display:flex; flex-direction:column; align-items:${isMine ? 'flex-end' : 'flex-start'}; margin-bottom:6px;">
          <div style="max-width:75%; padding:10px 14px; border-radius:${isMine ? '14px 14px 2px 14px' : '14px 14px 14px 2px'}; background:${isMine ? 'var(--green-900)' : 'var(--paper)'}; color:${isMine ? '#fff' : 'var(--body)'}; border:${isMine ? 'none' : '1px solid var(--line)'}; font-size:0.9rem; line-height:1.45;">
            ${mediaHTML}
            ${text ? `<div>${text}</div>` : ''}
          </div>
          <div style="font-size:0.7rem; color:var(--muted); margin-top:3px; padding:0 4px;">${timeStr}</div>
        </div>
      `;
    });

    bodyEl.innerHTML = html;
    bodyEl.scrollTop = bodyEl.scrollHeight;
  } catch (err) {
    console.error('Load chat messages error:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initChatsPage();
});
