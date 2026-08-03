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

  /* ---- Toast notifications ---- */
  window.showToast = (message) => {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = `<span class="toast-dot"></span><span class="toast-msg"></span>`;
      document.body.appendChild(toast);
    }
    toast.querySelector('.toast-msg').textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  };

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
