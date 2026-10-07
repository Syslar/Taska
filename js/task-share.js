/* ==========================================================================
   task-share.js — Universal Task Sharing Modal & Link Utilities
   Supports:
   - One-click public URL copying with visual feedback
   - External sharing (WhatsApp, X/Twitter, Telegram, Native Device Share)
   - In-app Taska Chat DM forwarding to active contacts
   ========================================================================== */

(function () {
  'use strict';

  // ── Helper: Canonical Task URL ─────────────────────────────────────────────
  window.getTaskUrl = function (taskId) {
    if (!taskId) return window.location.origin + '/browse-tasks';
    const origin = (window.location && window.location.origin) ? window.location.origin : 'https://taska.com.ng';
    return `${origin}/task/?id=${encodeURIComponent(taskId)}`;
  };

  // ── Helper: One-click Copy Task Link ───────────────────────────────────────
  window.copyTaskLink = async function (taskId, taskTitle) {
    const url = window.getTaskUrl(taskId);
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch (_) {}

    if (!copied) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        copied = document.execCommand('copy');
      } catch (_) {}
      ta.remove();
    }

    if (copied) {
      if (typeof window.showToast === 'function') {
        window.showToast('Task link copied to clipboard! Share it anywhere.', 'success');
      }
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('Please copy the link manually: ' + url, 'info');
      }
    }
    return url;
  };

  // ── Universal Task Share Modal ─────────────────────────────────────────────
  window.openShareTaskModal = function (shareData) {
    if (!shareData || !shareData.taskId) {
      console.warn('openShareTaskModal: Missing shareData or taskId');
      return;
    }

    // Remove any existing modals
    document.querySelectorAll('.taska-share-modal-backdrop').forEach((d) => d.remove());

    const taskId = shareData.taskId;
    const title = shareData.title || 'Task Opportunity';
    const budget = Number(shareData.budget || 0).toLocaleString();
    const category = shareData.category || 'General';
    const location = shareData.location || 'Remote / Anywhere';
    const desc = (shareData.description || '').slice(0, 180);
    const taskUrl = window.getTaskUrl(taskId);

    const safeTitle = window.escapeHtml ? window.escapeHtml(title) : title;
    const safeCat = window.escapeHtml ? window.escapeHtml(category) : category;
    const safeLoc = window.escapeHtml ? window.escapeHtml(location) : location;
    const safeDesc = window.escapeHtml ? window.escapeHtml(desc) : desc;

    // External share links
    const shareText = `Check out this task on Taska: "${title}" (Budget: ₦${budget}, Location: ${location})`;
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n\n' + taskUrl)}`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(taskUrl)}`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(taskUrl)}&text=${encodeURIComponent(shareText)}`;

    const backdrop = document.createElement('div');
    backdrop.className = 'taska-share-modal-backdrop';
    backdrop.style.cssText = `
      position: fixed; inset: 0; background: rgba(10, 25, 18, 0.62);
      z-index: 999999; display: flex; align-items: center; justify-content: center;
      padding: 16px; backdrop-filter: blur(5px); opacity: 0;
      transition: opacity 0.22s ease;
    `;

    backdrop.innerHTML = `
      <div class="taska-share-modal-card" style="
        background: var(--paper, #ffffff);
        border: 1px solid var(--line, #e2e8f0);
        border-radius: 18px;
        max-width: 480px;
        width: 100%;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24);
        overflow: hidden;
        transform: translateY(14px) scale(0.98);
        transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        font-family: inherit;
      ">
        <!-- Header -->
        <div style="padding: 18px 22px 14px; border-bottom: 1px solid var(--line-soft, #f1f5f9); display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--surface, #ffffff);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: var(--mint-100, #d1fae5); color: var(--green-800, #065f46); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </div>
            <div>
              <h3 style="margin: 0; font-size: 1.12rem; font-weight: 700; color: var(--green-900, #064e3b);">Share Task</h3>
              <p style="margin: 2px 0 0; font-size: 0.8rem; color: var(--muted, #64748b);">Forward internally or copy link for WhatsApp & social</p>
            </div>
          </div>
          <button id="taska-share-close-btn" style="background: none; border: none; font-size: 1.4rem; cursor: pointer; color: var(--muted, #64748b); padding: 4px; line-height: 1; border-radius: 6px;" aria-label="Close">✕</button>
        </div>

        <div style="padding: 18px 22px; overflow-y: auto; flex: 1;">
          <!-- Task Preview Snippet -->
          <div style="padding: 14px 16px; background: linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%); border: 1px solid #A7F3D0; border-radius: 12px; margin-bottom: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 6px;">
              <span style="font-size: 0.72rem; font-weight: 700; color: var(--green-700, #047857); text-transform: uppercase; letter-spacing: 0.05em;">${safeCat}</span>
              <span style="font-size: 1.15rem; font-weight: 800; color: var(--green-800, #065f46);">₦${budget}</span>
            </div>
            <div style="font-size: 0.98rem; font-weight: 700; color: var(--green-900, #064e3b); line-height: 1.35; margin-bottom: 4px;">${safeTitle}</div>
            ${safeDesc ? `<div style="font-size: 0.82rem; color: #334155; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 6px;">${safeDesc}</div>` : ''}
            <div style="font-size: 0.75rem; color: var(--muted, #475569); display: flex; align-items: center; gap: 4px;">
              <span>📍</span> <span>${safeLoc}</span>
            </div>
          </div>

          <!-- Section 1: Copy Link (Outside Taska) -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--green-900, #064e3b); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em;">
              Public Task Link (Copy & Share Anywhere)
            </label>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="text" id="share-link-input" readonly value="${taskUrl}" style="
                flex: 1; padding: 10px 12px; font-size: 0.85rem; border: 1px solid var(--line, #cbd5e1);
                border-radius: 10px; background: var(--surface, #f8fafc); color: var(--ink, #1e293b);
                font-family: 'IBM Plex Mono', monospace; outline: none; select: all;
              " onclick="this.select()">
              <button id="share-copy-btn" class="btn btn-primary" style="
                padding: 10px 16px; font-size: 0.85rem; font-weight: 600; border-radius: 10px;
                display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0;
                background: var(--green-900, #064e3b); color: #fff; border: none; cursor: pointer;
              ">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>Copy Link</span>
              </button>
            </div>
          </div>

          <!-- Section 2: Quick Social Buttons -->
          <div style="margin-bottom: 22px;">
            <div style="font-size: 0.8rem; font-weight: 700; color: var(--muted, #64748b); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px;">
              Share to Apps & Social
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(95px, 1fr)); gap: 8px;">
              <!-- WhatsApp -->
              <a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="
                display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 10px;
                background: #25D366; color: #fff; text-decoration: none; border-radius: 10px;
                font-size: 0.82rem; font-weight: 600; transition: opacity 0.15s;
              " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                WhatsApp
              </a>

              <!-- X / Twitter -->
              <a href="${twitterUrl}" target="_blank" rel="noopener noreferrer" style="
                display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 10px;
                background: #000; color: #fff; text-decoration: none; border-radius: 10px;
                font-size: 0.82rem; font-weight: 600; transition: opacity 0.15s;
              " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                X (Twitter)
              </a>

              <!-- Telegram -->
              <a href="${tgUrl}" target="_blank" rel="noopener noreferrer" style="
                display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 10px;
                background: #229ED9; color: #fff; text-decoration: none; border-radius: 10px;
                font-size: 0.82rem; font-weight: 600; transition: opacity 0.15s;
              " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
                <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.458c.537-.196 1.006.128.832.939z"/></svg>
                Telegram
              </a>

              <!-- Native Share (if supported) -->
              <button id="share-native-btn" style="
                display: none; align-items: center; justify-content: center; gap: 6px; padding: 9px 10px;
                background: var(--mint-150, #a7f3d0); color: var(--green-900, #064e3b); border: none;
                border-radius: 10px; font-size: 0.82rem; font-weight: 700; cursor: pointer;
              ">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                More…
              </button>
            </div>
          </div>

          <!-- Section 3: Forward via Taska DM -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 0.82rem; font-weight: 700; color: var(--green-900, #064e3b); text-transform: uppercase; letter-spacing: 0.04em;">
                Forward via Taska DM
              </span>
              <span style="font-size: 0.72rem; color: var(--muted, #64748b);">Direct chat message</span>
            </div>
            
            <div id="share-dm-search-wrap" style="display: none; margin-bottom: 8px;">
              <input type="text" id="share-dm-search-input" placeholder="Search contacts…" style="
                width: 100%; box-sizing: border-box; padding: 7px 12px; font-size: 0.82rem;
                border: 1px solid var(--line, #e2e8f0); border-radius: 8px; background: var(--surface, #f8fafc);
              ">
            </div>

            <div id="share-conversation-list" style="
              max-height: 220px; overflow-y: auto; padding: 4px;
              border: 1px solid var(--line-soft, #f1f5f9); border-radius: 12px;
              background: var(--surface, #f8fafc);
            ">
              <div style="text-align: center; padding: 22px; color: var(--muted, #64748b); font-size: 0.85rem;">
                Loading conversations…
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      const card = backdrop.querySelector('.taska-share-modal-card');
      if (card) card.style.transform = 'translateY(0) scale(1)';
    });

    const closeModal = () => {
      backdrop.style.opacity = '0';
      const card = backdrop.querySelector('.taska-share-modal-card');
      if (card) card.style.transform = 'translateY(14px) scale(0.98)';
      setTimeout(() => backdrop.remove(), 220);
    };

    backdrop.querySelector('#taska-share-close-btn').onclick = closeModal;
    backdrop.onclick = (e) => {
      if (e.target === backdrop) closeModal();
    };

    // Copy button handling
    const copyBtn = backdrop.querySelector('#share-copy-btn');
    copyBtn.onclick = async () => {
      await window.copyTaskLink(taskId, title);
      copyBtn.style.background = 'var(--green-700, #047857)';
      copyBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>✓ Copied!</span>
      `;
      setTimeout(() => {
        copyBtn.style.background = 'var(--green-900, #064e3b)';
        copyBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy Link</span>
        `;
      }, 2000);
    };

    // Native Device Share (mobile browsers)
    const nativeBtn = backdrop.querySelector('#share-native-btn');
    if (navigator.share) {
      nativeBtn.style.display = 'inline-flex';
      nativeBtn.onclick = async () => {
        try {
          await navigator.share({
            title: title,
            text: shareText,
            url: taskUrl
          });
        } catch (_) {}
      };
    }

    // Load active DM contacts
    loadTaskShareDMPeers(shareData, backdrop, closeModal);
  };

  // Backwards compatibility alias
  window.openShareTaskPicker = window.openShareTaskModal;

  // ── Helper: Load DM Peers for Share Modal ──────────────────────────────────
  async function loadTaskShareDMPeers(shareData, backdrop, closeCallback) {
    const listEl = backdrop.querySelector('#share-conversation-list');
    const searchWrap = backdrop.querySelector('#share-dm-search-wrap');
    const searchInput = backdrop.querySelector('#share-dm-search-input');

    const profile = (typeof window.getTaskaProfile === 'function' ? window.getTaskaProfile() : null) || window.__taskaProfile;

    if (!window.supabaseClient || !profile || !profile.id) {
      listEl.innerHTML = `
        <div style="text-align: center; padding: 22px 16px; color: var(--muted, #64748b); font-size: 0.85rem;">
          <div>Log in to Taska to forward tasks directly to other users in chat.</div>
          <a href="/login" class="btn btn-secondary btn-sm" style="margin-top: 10px; display: inline-block;">Log In</a>
        </div>
      `;
      return;
    }

    const myId = profile.id;
    try {
      const { data: messages, error } = await window.supabaseClient
        .from('Message')
        .select('senderId, receiverId, sender:senderId(id,firstName,lastName,username,avatarUrl), receiver:receiverId(id,firstName,lastName,username,avatarUrl)')
        .or(`senderId.eq.${myId},receiverId.eq.${myId}`)
        .order('createdAt', { ascending: false })
        .limit(100);

      if (error) throw error;

      if (!messages || messages.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 22px 14px; color: var(--muted, #64748b); font-size: 0.85rem;">
            No chat conversations yet.<br>Start a conversation from Browse Tasks or Profile to message them.
          </div>
        `;
        return;
      }

      // Deduplicate contacts
      const seen = new Set();
      const peers = [];
      for (const m of messages) {
        const isSender = m.senderId === myId;
        const peer = isSender ? m.receiver : m.sender;
        if (peer && peer.id && !seen.has(peer.id)) {
          seen.add(peer.id);
          peers.push(peer);
        }
      }

      if (peers.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--muted, #64748b); font-size: 0.85rem;">No contacts found.</div>`;
        return;
      }

      if (peers.length > 3 && searchWrap) {
        searchWrap.style.display = 'block';
      }

      const renderPeers = (filteredPeers) => {
        if (filteredPeers.length === 0) {
          listEl.innerHTML = `<div style="text-align: center; padding: 18px; color: var(--muted, #64748b); font-size: 0.82rem;">No matching contacts found.</div>`;
          return;
        }

        listEl.innerHTML = filteredPeers.map((p) => {
          const name = `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.username || 'Taska User';
          const initials = `${(p.firstName || 'U')[0]}${(p.lastName || '')[0] || ''}`.toUpperCase();
          const safeName = window.escapeHtml ? window.escapeHtml(name) : name;
          const safeUsername = window.escapeHtml ? window.escapeHtml(p.username || '') : (p.username || '');
          const avatarHTML = p.avatarUrl
            ? `<img src="${p.avatarUrl}" alt="${safeName}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">`
            : `<div style="width: 36px; height: 36px; border-radius: 50%; background: var(--mint-150, #a7f3d0); color: var(--green-900, #064e3b); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.82rem;">${initials}</div>`;

          return `
            <div class="taska-share-peer-row" data-peer-id="${p.id}" data-peer-name="${safeName}" style="
              display: flex; align-items: center; justify-content: space-between; gap: 10px;
              padding: 8px 10px; border-radius: 10px; transition: background 0.15s; margin-bottom: 2px;
            " onmouseover="this.style.background='var(--mint-050, #ecfdf5)'" onmouseout="this.style.background='transparent'">
              <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                ${avatarHTML}
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 600; font-size: 0.88rem; color: var(--green-900, #064e3b); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeName}</div>
                  ${safeUsername ? `<div style="font-size: 0.74rem; color: var(--muted, #64748b);">@${safeUsername}</div>` : ''}
                </div>
              </div>
              <button class="btn btn-primary btn-sm btn-dm-send" style="
                font-size: 0.76rem; padding: 5px 12px; border-radius: 16px; flex-shrink: 0;
                background: var(--green-900, #064e3b); color: #fff; border: none; cursor: pointer;
              ">Send</button>
            </div>
          `;
        }).join('');

        // Attach send listeners
        listEl.querySelectorAll('.taska-share-peer-row').forEach((row) => {
          const btn = row.querySelector('.btn-dm-send');
          const peerId = row.dataset.peerId;
          const peerName = row.dataset.peerName;
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            btn.textContent = 'Sending…';
            btn.disabled = true;
            try {
              await sendTaskShareMessage(peerId, shareData);
              btn.textContent = '✓ Sent!';
              btn.style.background = 'var(--green-700, #047857)';
              if (window.showToast) window.showToast(`Task forwarded to ${peerName}!`);
              setTimeout(() => closeCallback(), 800);
            } catch (err) {
              console.error('Send task share error:', err);
              btn.textContent = 'Failed';
              btn.disabled = false;
              if (window.showToast) window.showToast('Could not forward task. Please try again.', 'error');
            }
          });
        });
      };

      renderPeers(peers);

      if (searchInput) {
        searchInput.oninput = (e) => {
          const q = (e.target.value || '').toLowerCase().trim();
          if (!q) {
            renderPeers(peers);
            return;
          }
          const filtered = peers.filter((p) => {
            const fullName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
            const uname = (p.username || '').toLowerCase();
            return fullName.includes(q) || uname.includes(q);
          });
          renderPeers(filtered);
        };
      }
    } catch (err) {
      console.error('loadTaskShareDMPeers error:', err);
      listEl.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--red, #ef4444); font-size: 0.85rem;">Could not load conversations.</div>`;
    }
  }

  // ── Helper: Send Task Share into DB ─────────────────────────────────────────
  async function sendTaskShareMessage(peerId, shareData) {
    if (!window.supabaseClient) throw new Error('Database client not initialized');
    const profile = (typeof window.getTaskaProfile === 'function' ? window.getTaskaProfile() : null) || window.__taskaProfile;
    if (!profile || !profile.id) throw new Error('User not logged in');

    const cleanData = {
      taskId: shareData.taskId,
      title: shareData.title || 'Task',
      budget: parseFloat(shareData.budget) || 0,
      category: shareData.category || 'General',
      location: shareData.location || 'Remote / Anywhere',
      description: shareData.description || ''
    };

    const encoded = '__TASK_SHARE__:' + JSON.stringify(cleanData);

    const { error } = await window.supabaseClient.from('Message').insert({
      senderId: profile.id,
      receiverId: peerId,
      body: encoded,
      content: encoded
    });

    if (error) throw error;
  }

  window.sendTaskShareMessage = sendTaskShareMessage;
})();
