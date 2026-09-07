/**
 * Taska Native SPA Client Router
 * Persistent layout shell, flicker-free transitions, zero full-page reloads.
 * Vanilla JS. No dependencies.
 */
(function () {
  'use strict';

  // Prevent multiple router instances
  if (window.__taskaRouterInitialized) return;
  window.__taskaRouterInitialized = true;

  // Mark existing page-specific styles on initial load so they get cleaned up when navigating away
  function tagInitialPageStyles() {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      if (!href.includes('styles.css') && !href.includes('fonts.googleapis.com')) {
        link.setAttribute('data-page-style', 'true');
      }
    });
    document.querySelectorAll('head style').forEach(style => {
      if (style.id !== 'taska-notif-dynamic-styles' && !style.hasAttribute('data-page-style')) {
        style.setAttribute('data-page-style', 'true');
      }
    });
  }
  tagInitialPageStyles();

  // ── 1. DOMContentLoaded Polyfill for Dynamically Loaded Scripts ──────────────
  // If a page script calls document.addEventListener('DOMContentLoaded', fn)
  // after the initial page load has completed, immediately execute fn on next tick.
  const originalAddEventListener = document.addEventListener;
  document.addEventListener = function (type, listener, options) {
    if (type === 'DOMContentLoaded' && document.readyState !== 'loading') {
      setTimeout(() => {
        try {
          if (typeof listener === 'function') listener(new Event('DOMContentLoaded'));
          else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent(new Event('DOMContentLoaded'));
        } catch (err) {
          console.error('[TaskaRouter] Error in DOMContentLoaded callback:', err);
        }
      }, 0);
      return;
    }
    return originalAddEventListener.call(document, type, listener, options);
  };

  // ── 2. Top Progress Loading Bar ───────────────────────────────────────────────
  let progressBar = null;
  let progressTimer = null;

  function ensureProgressBar() {
    if (progressBar && document.body.contains(progressBar)) return progressBar;
    progressBar = document.createElement('div');
    progressBar.id = 'taska-top-progress';
    progressBar.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      height: 3px;
      width: 0%;
      background: linear-gradient(90deg, #10B981, #059669, #34D399);
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.7);
      z-index: 9999999;
      pointer-events: none;
      transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
      opacity: 0;
    `;
    document.body.appendChild(progressBar);
    return progressBar;
  }

  function startProgress() {
    const bar = ensureProgressBar();
    if (progressTimer) clearTimeout(progressTimer);
    bar.style.transition = 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease';
    bar.style.opacity = '1';
    bar.style.width = '20%';

    progressTimer = setTimeout(() => {
      bar.style.width = '65%';
      progressTimer = setTimeout(() => {
        bar.style.width = '85%';
      }, 300);
    }, 120);
  }

  function finishProgress() {
    const bar = ensureProgressBar();
    if (progressTimer) clearTimeout(progressTimer);
    bar.style.width = '100%';
    setTimeout(() => {
      bar.style.opacity = '0';
      setTimeout(() => {
        bar.style.width = '0%';
      }, 250);
    }, 150);
  }

  // ── 3. Route Interception Checks ─────────────────────────────────────────────
  function isInternalAppRoute(href) {
    if (!href) return false;
    try {
      const targetUrl = new URL(href, window.location.origin);

      // Must belong to the exact same origin
      if (targetUrl.origin !== window.location.origin) return false;

      const path = targetUrl.pathname.toLowerCase();

      // Don't intercept auth pages (isolated security flows)
      if (path.startsWith('/login') || path.startsWith('/signup') || path.startsWith('/forgot-password') || path.startsWith('/auth/')) {
        return false;
      }

      // Don't intercept root marketing homepage if user wants full landing page
      if (path === '/' || path === '/index.html') {
        return false;
      }

      // Don't intercept direct file downloads/assets
      if (/\.(pdf|png|jpe?g|svg|webp|gif|zip|ico|json|webmanifest)$/i.test(path)) {
        return false;
      }

      // Only intercept application / dashboard pages
      const isAppPage =
        path.includes('/dashboard') ||
        path.includes('/browse-tasks') ||
        path.includes('/browsetasks') ||
        path.includes('/post-task') ||
        path.includes('/posttask') ||
        path.includes('/my-posted-tasks') ||
        path.includes('/mypostedtasks') ||
        path.includes('/my-applications') ||
        path.includes('/myapplications') ||
        path.includes('/chats') ||
        path.includes('/wallet') ||
        path.includes('/settings') ||
        path.includes('/profile') ||
        path.startsWith('/tasker') ||
        path.startsWith('/poster');

      return isAppPage;
    } catch (_) {
      return false;
    }
  }

  // ── 4. Main Navigation Function ──────────────────────────────────────────────
  let activeAbortController = null;
  let isNavigating = false;

  async function taskaNavigate(url, options = {}) {
    const targetUrl = new URL(url, window.location.origin);
    const targetHref = targetUrl.pathname + targetUrl.search + targetUrl.hash;
    const currentHref = window.location.pathname + window.location.search + window.location.hash;

    // If identical URL (ignoring hash change), do nothing
    if (targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search && !options.force) {
      if (targetUrl.hash) {
        window.location.hash = targetUrl.hash;
      }
      return;
    }

    if (!isInternalAppRoute(targetUrl.href)) {
      window.location.href = targetUrl.href;
      return;
    }

    // Cancel any pending in-flight request
    if (activeAbortController) {
      activeAbortController.abort();
    }
    activeAbortController = new AbortController();
    const { signal } = activeAbortController;

    isNavigating = true;
    startProgress();

    // Trigger pre-navigate cleanup event
    window.dispatchEvent(new CustomEvent('taska:before-navigate', { detail: { targetUrl: targetUrl.href } }));

    // Close any open modals and dropdowns
    document.querySelectorAll('.modal-backdrop, [data-modal], .sidebar-switcher-menu').forEach(el => {
      if (el.id === 'sidebar-switcher-menu') {
        el.style.display = 'none';
      } else if (el.classList.contains('modal-backdrop')) {
        el.style.display = 'none';
      }
    });

    // Close notification drawer & modal if open
    const notifDrawer = document.getElementById('taska-notification-drawer');
    if (notifDrawer) {
      notifDrawer.style.opacity = '0';
      setTimeout(() => { if (notifDrawer.parentNode) notifDrawer.remove(); }, 150);
    }
    const notifModal = document.getElementById('taska-all-notifications-modal');
    if (notifModal) notifModal.style.display = 'none';

    // Close mobile navigation drawer if open
    const sidebarEl = document.getElementById('sidebar') || document.querySelector('aside.sidebar');
    if (sidebarEl && sidebarEl.classList.contains('is-open')) {
      sidebarEl.classList.remove('is-open');
    }

    try {
      const response = await fetch(targetUrl.href, {
        signal,
        headers: {
          'X-Requested-With': 'Taska-SPA'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to load page: HTTP ${response.status}`);
      }

      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      const newMain = doc.querySelector('.main-content');
      const currentMain = document.querySelector('.main-content');

      if (!newMain || !currentMain) {
        // Fallback to traditional navigation if layout container is missing
        window.location.href = targetUrl.href;
        return;
      }

      // 1. Update Browser History State
      if (!options.fromPopState) {
        if (options.replace) {
          window.history.replaceState(null, '', targetHref);
        } else {
          window.history.pushState(null, '', targetHref);
        }
      }

      // 2. Update Page Title
      if (doc.title) {
        document.title = doc.title;
      }

      // 3. Synchronize Stylesheets and inline <style> blocks (await external links)
      await syncStylesheets(doc);

      // 4. Synchronize Page-Specific Modals (e.g. #task-detail-modal, wallet modals)
      syncPageModals(doc);

      // 5. Swap Main Content with Smooth Transition
      currentMain.classList.remove('page-content-fadein');
      currentMain.innerHTML = newMain.innerHTML;

      // Copy any attributes from new main (e.g. data attributes or custom classes)
      Array.from(newMain.attributes).forEach(attr => {
        if (attr.name !== 'class') {
          currentMain.setAttribute(attr.name, attr.value);
        }
      });

      // Restart entry animation
      void currentMain.offsetWidth; // trigger reflow
      currentMain.classList.add('page-content-fadein');

      // 6. Reset Scroll to top of page/main container
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      currentMain.scrollTop = 0;

      // 7. Update Persistent Sidebar & Navigation without re-rendering
      if (typeof window.updateSidebarActiveState === 'function') {
        window.updateSidebarActiveState(targetUrl.pathname);
      } else if (typeof window.initSidebar === 'function') {
        window.initSidebar();
      }

      // Populate user info (name, username, email, phone, avatar) on newly swapped page
      const currentProfile = window.__taskaProfile || (typeof window.getTaskaProfile === 'function' ? window.getTaskaProfile() : null);
      if (currentProfile && typeof window.populateSidebar === 'function') {
        try {
          window.populateSidebar(currentProfile);
        } catch (_) {}
      }

      // 8. Execute New Page Scripts inside try/catch so script issues NEVER trigger a full reload
      try {
        await executePageScripts(doc);
      } catch (scriptErr) {
        console.error('[TaskaRouter] Page script error (non-fatal):', scriptErr);
      }

      // 9. Dispatch Lifecycle Events
      window.dispatchEvent(new CustomEvent('taska:page-change', { detail: { path: targetUrl.pathname } }));
      if (window.__taskaReady) {
        window.dispatchEvent(new Event('taska:ready'));
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        // Ignored, user clicked another link before this one finished
        return;
      }
      console.warn('[TaskaRouter] Navigation fallback to standard reload:', err);
      window.location.href = targetUrl.href;
    } finally {
      isNavigating = false;
      finishProgress();
    }
  }

  // ── 5. Stylesheet & Inline Styles Synchronization ────────────────────────────
  async function syncStylesheets(newDoc) {
    const existingLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
    const newLinks = Array.from(newDoc.querySelectorAll('link[rel="stylesheet"]'));
    const linkPromises = [];

    // 1. Synchronize <link rel="stylesheet">
    newLinks.forEach(newLink => {
      const href = newLink.getAttribute('href');
      if (!href) return;

      // Skip base shared styles that are already present
      if (href.includes('styles.css') || href.includes('fonts.googleapis.com')) return;

      const cleanHref = href.split('?')[0];
      const isAlreadyPresent = existingLinks.some(el => {
        const curHref = el.getAttribute('href');
        return curHref && curHref.split('?')[0] === cleanHref;
      });

      if (!isAlreadyPresent) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.setAttribute('data-page-style', 'true');

        const p = new Promise(resolve => {
          link.onload = resolve;
          link.onerror = resolve;
          setTimeout(resolve, 1500); // 1.5s safe fallback
        });
        linkPromises.push(p);
        document.head.appendChild(link);
      }
    });

    // Remove obsolete page-specific link stylesheets
    existingLinks.forEach(existing => {
      if (!existing.hasAttribute('data-page-style')) return;
      const href = existing.getAttribute('href');
      const cleanHref = href ? href.split('?')[0] : '';
      const isNeededInNewDoc = newLinks.some(nl => {
        const nHref = nl.getAttribute('href');
        return nHref && nHref.split('?')[0] === cleanHref;
      });

      if (!isNeededInNewDoc) {
        existing.remove();
      }
    });

    // 2. Synchronize inline <style> blocks
    // Remove previous page-specific <style> tags
    document.querySelectorAll('style[data-page-style="true"]').forEach(el => el.remove());

    // Copy all <style> blocks from newDoc (<head> and <body>)
    const newStyles = Array.from(newDoc.querySelectorAll('head style, body > style'));
    newStyles.forEach(st => {
      if (st.id === 'taska-notif-dynamic-styles') return;
      const styleEl = document.createElement('style');
      styleEl.setAttribute('data-page-style', 'true');
      styleEl.textContent = st.textContent;
      document.head.appendChild(styleEl);
    });

    // Wait for any new external stylesheets to finish loading before swapping DOM
    if (linkPromises.length > 0) {
      await Promise.all(linkPromises);
    }
  }

  // ── 6. Page-Specific Modals Synchronization ──────────────────────────────────
  function syncPageModals(newDoc) {
    // Clean up previous page modals that have [data-page-modal]
    document.querySelectorAll('[data-page-modal="true"]').forEach(el => el.remove());

    // Look for modal backdrops outside <main> in new doc
    const newModals = newDoc.querySelectorAll('.modal-backdrop, [data-modal], .crime-scene-overlay, #task-detail-modal, #withdraw-modal, #deposit-modal, #review-modal, #proof-modal');
    newModals.forEach(modal => {
      // Avoid copying mobile topbar or sidebar modals if any
      if (modal.closest('#sidebar') || modal.closest('.mobile-topbar')) return;

      // Mark modal as page-specific so it will be cleaned on next navigation
      modal.setAttribute('data-page-modal', 'true');

      // Append to dashboard-layout or body
      const layout = document.querySelector('.dashboard-layout') || document.body;
      layout.appendChild(modal.cloneNode(true));
    });
  }

  // ── 7. Script Execution ──────────────────────────────────────────────────────
  // Core scripts that should stay loaded once and NOT be re-executed
  const CORE_SCRIPTS = [
    'clerk.browser.js',
    'supabase-client.js',
    'supabase-js',
    'sidebar-component.js',
    'auth-guard.js',
    'router.js',
    'cloudinary-upload.js',
    'dojah-kyc.js',
    'termii-otp.js',
    'paystack',
    'widget.dojah.io'
  ];

  async function executePageScripts(newDoc) {
    const scripts = Array.from(newDoc.querySelectorAll('script'));

    for (const script of scripts) {
      const src = script.getAttribute('src');

      if (src) {
        // 1. Skip core libraries that are already initialized globally
        const isCore = CORE_SCRIPTS.some(core => src.includes(core));
        if (isCore) {
          const cleanSrc = src.split('?')[0];
          const isLoaded = Array.from(document.querySelectorAll('script')).some(s => {
            const curSrc = s.getAttribute('src');
            return curSrc && curSrc.split('?')[0] === cleanSrc;
          });
          if (!isLoaded) {
            await new Promise(resolve => {
              const coreEl = document.createElement('script');
              Array.from(script.attributes).forEach(attr => coreEl.setAttribute(attr.name, attr.value));
              coreEl.onload = resolve;
              coreEl.onerror = resolve;
              document.head.appendChild(coreEl);
            });
          }
          continue;
        }

        // 2. Page-specific controller script (e.g. poster-dashboard.js, wallet.js, chats.js, etc.)
        try {
          const res = await fetch(src);
          if (res.ok) {
            const scriptCode = await res.text();
            // Wrap in an IIFE so top-level let/const declarations never throw
            // "Identifier has already been declared" SyntaxErrors across page switches.
            const wrapped = `(function() {\ntry {\n${scriptCode}\n} catch (err) {\n  console.error('[TaskaRouter] Error running ${src}:', err);\n}\n})();\n//# sourceURL=${src}`;
            const scriptEl = document.createElement('script');
            scriptEl.type = 'text/javascript';
            scriptEl.text = wrapped;
            document.body.appendChild(scriptEl);
            scriptEl.remove(); // execute and clean up tag from DOM
          } else {
            console.warn('[TaskaRouter] Could not fetch page script:', src, res.status);
          }
        } catch (fetchErr) {
          console.error('[TaskaRouter] Failed to load page script:', src, fetchErr);
        }
      } else {
        // 3. Inline script
        const content = script.textContent.trim();
        if (content && !content.includes('data-clerk-publishable-key') && !content.includes('initSidebar')) {
          try {
            const inlineScript = document.createElement('script');
            inlineScript.textContent = `(function() {\ntry {\n${content}\n} catch (e) {\n  console.error('[TaskaRouter] Error in inline script:', e);\n}\n})();`;
            document.body.appendChild(inlineScript);
            inlineScript.remove(); // execute and remove
          } catch (err) {
            console.error('[TaskaRouter] Error executing inline script:', err);
          }
        }
      }
    }
  }

  // ── 8. Global Click Event Delegation (Capturing Phase) ──────────────────────
  document.addEventListener('click', (e) => {
    // Only intercept primary left clicks without modifier keys
    if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;

    // 1. Regular <a> links
    const link = e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (!href) return;

      // Ignore hash-only, javascript:, mailto:, tel: links
      if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      // Ignore links with target="_blank" or download
      if (link.target === '_blank' || link.hasAttribute('download')) {
        return;
      }

      // Ignore logout links
      if (link.id === 'logout-btn' || link.id === 'dropdown-logout-btn') {
        return;
      }

      if (isInternalAppRoute(link.href)) {
        e.preventDefault();
        e.stopPropagation();
        taskaNavigate(link.href);
        return;
      }
    }

    // 2. Elements with inline onclick="window.location.href='...'"
    const clickableEl = e.target.closest('[onclick*="location.href"], [onclick*="location.replace"], [data-href]');
    if (clickableEl) {
      if (clickableEl.dataset && clickableEl.dataset.href && isInternalAppRoute(clickableEl.dataset.href)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        taskaNavigate(clickableEl.dataset.href);
        return;
      }

      const onclickAttr = clickableEl.getAttribute('onclick') || '';
      const match = onclickAttr.match(/(?:window\.)?location\.(?:href|replace)\s*=\s*['"`]([^'"`]+)['"`]/);
      if (match && match[1] && isInternalAppRoute(match[1])) {
        e.preventDefault();
        e.stopImmediatePropagation();
        taskaNavigate(match[1]);
        return;
      }
    }
  }, true);

  // ── 9. Browser History PopState (Back / Forward) ─────────────────────────────
  window.addEventListener('popstate', () => {
    taskaNavigate(window.location.href, { fromPopState: true });
  });

  // ── 10. Expose Public Router API ─────────────────────────────────────────────
  window.taskaNavigate = taskaNavigate;
  window.isTaskaNavigating = () => isNavigating;

})();
