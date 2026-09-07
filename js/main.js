/* ==========================================================================
   TASKA — Shared interactions
   Vanilla JS. No dependencies. Progressive enhancement throughout.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Mobile nav toggle (marketing header) ---- */
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('is-open');
      navToggle.classList.toggle('is-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('is-open');
        navToggle.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /* ---- Animated counters on scroll into view (landing trust stats) ---- */
  const counters = document.querySelectorAll('[data-counter]');
  if (counters.length) {
    const animateCounter = (el) => {
      const target = parseFloat(el.dataset.counter);
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      const decimals = el.dataset.decimals ? parseInt(el.dataset.decimals) : 0;
      const duration = 1200;
      const start = performance.now();
      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = target * eased;
        el.textContent = prefix + value.toLocaleString('en-NG', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        }) + suffix;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(c => io.observe(c));
  }

  /* ---- Category / filter chip toggling ---- */
  document.querySelectorAll('[data-chip-group]').forEach(group => {
    group.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        if (typeof window.onChipFilter === 'function') {
          window.onChipFilter(group.dataset.chipGroup, chip.dataset.value);
        }
      });
    });
  });

  /* ---- Toggle groups (fixed / negotiable, income / expense, etc.) ---- */
  document.querySelectorAll('[data-toggle-group]').forEach(group => {
    group.querySelectorAll('.toggle-option').forEach(opt => {
      opt.addEventListener('click', () => {
        group.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('is-active'));
        opt.classList.add('is-active');
        const revealTarget = opt.dataset.reveals;
        if (group.dataset.revealWrap) {
          document.querySelectorAll(`[data-reveal-in="${group.dataset.revealWrap}"]`)
            .forEach(el => el.style.display = 'none');
          if (revealTarget) {
            const el = document.querySelector(`[data-reveal="${revealTarget}"]`);
            if (el) el.style.display = '';
          }
        }
      });
    });
  });

  /* ---- Auth tabs (login / signup) ---- */
  const authTabs = document.querySelectorAll('.auth-tab');
  if (authTabs.length) {
    authTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        document.querySelectorAll('[data-auth-panel]').forEach(panel => {
          panel.style.display = panel.dataset.authPanel === tab.dataset.authTab ? '' : 'none';
        });
      });
    });
  }

  /* ---- OTP input auto-advance ---- */
  const otpBoxes = document.querySelectorAll('.otp-box');
  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', () => {
      box.value = box.value.replace(/[^0-9]/g, '').slice(0, 1);
      if (box.value && otpBoxes[i + 1]) otpBoxes[i + 1].focus();
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && otpBoxes[i - 1]) otpBoxes[i - 1].focus();
    });
  });

  /* ---- Password visibility toggle (Eye button with Open/Close animation) ---- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-toggle-password, [data-toggle-password]');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const targetId = btn.dataset.target;
    const input = targetId ? document.getElementById(targetId) : btn.parentElement.querySelector('input');
    if (!input) return;

    const willBeVisible = (input.type === 'password');
    input.type = willBeVisible ? 'text' : 'password';

    const eyeOpen = btn.querySelector('.icon-eye-open, .eye-open');
    const eyeClosed = btn.querySelector('.icon-eye-closed, .eye-closed');

    if (willBeVisible) {
      // Password is now VIEWABLE -> Eye is OPEN
      if (eyeClosed) eyeClosed.style.display = 'none';
      if (eyeOpen) {
        eyeOpen.style.display = 'block';
        eyeOpen.classList.remove('eye-animate-pop');
        void eyeOpen.offsetWidth; // trigger reflow for animation restart
        eyeOpen.classList.add('eye-animate-pop');
      }
      btn.classList.add('is-active');
      btn.style.color = 'var(--green-700, #047857)';
      btn.setAttribute('aria-label', 'Hide password');
    } else {
      // Password is now HIDDEN -> Eye is CLOSED
      if (eyeOpen) eyeOpen.style.display = 'none';
      if (eyeClosed) {
        eyeClosed.style.display = 'block';
        eyeClosed.classList.remove('eye-animate-pop');
        void eyeClosed.offsetWidth; // trigger reflow for animation restart
        eyeClosed.classList.add('eye-animate-pop');
      }
      btn.classList.remove('is-active');
      btn.style.color = 'var(--muted, #94A3B8)';
      btn.setAttribute('aria-label', 'Show password');
    }

    // Preserve focus & cursor position at the end of input
    try {
      const valLen = input.value.length;
      input.focus();
      input.setSelectionRange(valLen, valLen);
    } catch (_) {}
  });

  /* ---- Modal open / close (task detail) ---- */
  const modalOverlay = document.querySelector('[data-modal]');
  if (modalOverlay) {
    const openers = document.querySelectorAll('[data-modal-open]');
    const closers = modalOverlay.querySelectorAll('[data-modal-close]');
    const openModal = (payload) => {
      modalOverlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      if (payload) {
        modalOverlay.querySelectorAll('[data-fill]').forEach(el => {
          const key = el.dataset.fill;
          if (payload[key] !== undefined) el.textContent = payload[key];
        });
      }
    };
    const closeModal = () => {
      modalOverlay.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    openers.forEach(btn => {
      btn.addEventListener('click', () => {
        const payload = {
          title: btn.dataset.title,
          category: btn.dataset.category,
          budget: btn.dataset.budget,
          location: btn.dataset.location,
          desc: btn.dataset.desc,
          poster: btn.dataset.poster,
        };
        openModal(payload);
      });
    });
    closers.forEach(btn => btn.addEventListener('click', closeModal));
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  }

  /* ---- Toast notifications with Lifetime Bar & Hover-Pause ---- */
  if (!window.showToast || !window.showToast._isEnhanced) {
    (function () {
      let toastEl = null;
      let progressBarEl = null;
      let msgEl = null;
      let rafId = null;
      const TOTAL_DURATION = 4000;
      let remainingTime = TOTAL_DURATION;
      let startTime = 0;
      let isPaused = false;

      function initToastDOM() {
        toastEl = document.querySelector('.toast');
        if (!toastEl) {
          toastEl = document.createElement('div');
          toastEl.className = 'toast';
          toastEl.innerHTML = `
            <span class="toast-dot"></span>
            <span class="toast-msg"></span>
            <div class="toast-progress-track">
              <div class="toast-progress-bar"></div>
            </div>
          `;
          document.body.appendChild(toastEl);
        } else if (!toastEl.querySelector('.toast-progress-track')) {
          const existingMsg = toastEl.querySelector('.toast-msg')?.textContent || '';
          toastEl.innerHTML = `
            <span class="toast-dot"></span>
            <span class="toast-msg">${window.escapeHtml?.(existingMsg) || existingMsg}</span>
            <div class="toast-progress-track">
              <div class="toast-progress-bar"></div>
            </div>
          `;
        }

        msgEl = toastEl.querySelector('.toast-msg');
        progressBarEl = toastEl.querySelector('.toast-progress-bar');

        if (!toastEl._hasToastListeners) {
          toastEl.addEventListener('mouseenter', () => {
            if (!toastEl.classList.contains('is-visible')) return;
            const elapsed = Date.now() - startTime;
            remainingTime = Math.max(0, remainingTime - elapsed);
            isPaused = true;
          });

          toastEl.addEventListener('mouseleave', () => {
            if (!toastEl.classList.contains('is-visible') || remainingTime <= 0) return;
            startTime = Date.now();
            isPaused = false;
          });

          toastEl._hasToastListeners = true;
        }
      }

      function tick() {
        if (!toastEl || !toastEl.classList.contains('is-visible')) return;

        if (!isPaused) {
          const elapsed = Date.now() - startTime;
          const currentRemaining = Math.max(0, remainingTime - elapsed);
          const percent = Math.min(100, Math.max(0, (currentRemaining / TOTAL_DURATION) * 100));

          if (progressBarEl) {
            progressBarEl.style.width = `${percent}%`;
          }

          if (currentRemaining <= 0) {
            toastEl.classList.remove('is-visible');
            return;
          }
        }

        rafId = requestAnimationFrame(tick);
      }

      window.showToast = function (message) {
        if (!message) return;
        initToastDOM();

        if (rafId) cancelAnimationFrame(rafId);

        if (msgEl) msgEl.textContent = message;

        remainingTime = TOTAL_DURATION;
        startTime = Date.now();
        isPaused = false;

        if (progressBarEl) {
          progressBarEl.style.width = '100%';
        }

        if (toastEl.parentElement !== document.body) {
          document.body.appendChild(toastEl);
        }

        toastEl.classList.add('is-visible');
        rafId = requestAnimationFrame(tick);
      };
      window.showToast._isEnhanced = true;
    })();
  }

  document.querySelectorAll('[data-toast]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (el.tagName === 'FORM') return; // handled on submit instead
      window.showToast(el.dataset.toast);
    });
  });

  /* ---- Form submit intercept + validation (post a task, auth) ---- */
  document.querySelectorAll('form[data-validate]').forEach(form => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let valid = true;
      form.querySelectorAll('[required]').forEach(field => {
        const group = field.closest('.field-group') || field.parentElement;
        const empty = !field.value || !field.value.trim();
        if (group) group.classList.toggle('has-error', empty);
        if (empty) valid = false;
      });
      if (valid) {
        const msg = form.dataset.successToast || 'Done';
        window.showToast(msg);
        if (form.dataset.resetOnSuccess !== 'false') form.reset();
        form.querySelectorAll('.has-error').forEach(g => g.classList.remove('has-error'));
      }
    });
    form.querySelectorAll('[required]').forEach(field => {
      field.addEventListener('input', () => {
        const group = field.closest('.field-group');
        if (group) group.classList.remove('has-error');
      });
    });
  });

  /* ---- Dropzone (post a task media upload) ---- */
  document.querySelectorAll('.dropzone').forEach(zone => {
    const input = zone.querySelector('input[type="file"]');
    const label = zone.querySelector('[data-dz-label]');
    zone.addEventListener('click', () => input && input.click());
    ['dragenter', 'dragover'].forEach(evt => {
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('is-dragover'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
      zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('is-dragover'); });
    });
    zone.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files.length && label) label.textContent = `${files.length} file(s) selected`;
    });
    if (input) {
      input.addEventListener('change', () => {
        if (input.files.length && label) label.textContent = `${input.files.length} file(s) selected`;
      });
    }
  });

  /* ---- Wallet tab switching ---- */
  const walletTabs = document.querySelectorAll('.wallet-tab');
  if (walletTabs.length) {
    walletTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        walletTabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        document.querySelectorAll('[data-wallet-panel]').forEach(panel => {
          panel.style.display = panel.dataset.walletPanel === tab.dataset.walletTab ? '' : 'none';
        });
      });
    });
  }

  /* ---- Browse gigs: search + category filter (client-side demo) ---- */
  const gigSearch = document.querySelector('#gigSearch');
  const gigCards = document.querySelectorAll('[data-gig-card]');
  const applyGigFilters = () => {
    const query = (gigSearch?.value || '').toLowerCase();
    const activeChip = document.querySelector('[data-chip-group="category"] .chip.is-active');
    const category = activeChip ? activeChip.dataset.value : 'all';
    gigCards.forEach(card => {
      const matchesQuery = card.dataset.title.toLowerCase().includes(query);
      const matchesCategory = category === 'all' || card.dataset.category === category;
      card.style.display = (matchesQuery && matchesCategory) ? '' : 'none';
    });
  };
  if (gigSearch) gigSearch.addEventListener('input', applyGigFilters);
  window.onChipFilter = (group, value) => { if (group === 'category') applyGigFilters(); };

});
