// js/termii-otp.js
// Taska Reusable Termii Phone OTP Verification Module & Modal
// Provides seamless 6-digit SMS OTP verification across all Taska pages

(function () {
  'use strict';

  const SUPABASE_FN_URL = 'https://nhittvkskzwpeinscxir.supabase.co/functions/v1/termii-otp';

  // ── Phone Formatting & Normalization Helper ──────────────────────────────
  function parseNigerianPhone(input) {
    if (!input) return { isValid: false, error: 'Phone number is required.' };

    // Strip all non-digits
    let digits = String(input).trim().replace(/\D/g, '');

    // Strip leading country code 234 if present
    if (digits.startsWith('234')) {
      digits = digits.slice(3);
    }
    // Strip leading trunk prefix 0 if present
    if (digits.startsWith('0')) {
      digits = digits.slice(1);
    }

    // Must be 10 digits starting with 7, 8, or 9 (Nigerian mobile prefixes)
    if (digits.length !== 10 || !/^[789][01]\d{8}$/.test(digits)) {
      return {
        isValid: false,
        error: 'Please enter a valid 11-digit Nigerian phone number (e.g. 0801 234 5678).'
      };
    }

    const core10 = digits;
    const canonical = '+234' + core10;
    const termiiFormat = '234' + core10;
    const localFormat = '0' + core10;
    const display = `+234 ${core10.slice(0, 3)} ${core10.slice(3, 6)} ${core10.slice(6)}`;

    return {
      isValid: true,
      core10,
      canonical,
      termiiFormat,
      localFormat,
      display
    };
  }

  // ── Core API Helpers ────────────────────────────────────────────────────────
  async function sendPhoneOtp(phone, userId, profileId) {
    const parsed = parseNigerianPhone(phone);
    const targetPhone = parsed.isValid ? parsed.termiiFormat : phone;

    const res = await fetch(SUPABASE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_otp', phone: targetPhone, userId, profileId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || data.message || 'Failed to send OTP code');
    }
    return data;
  }

  async function verifyPhoneOtp(pinId, pin, phone, userId, profileId) {
    const parsed = parseNigerianPhone(phone);
    const targetPhone = parsed.isValid ? parsed.termiiFormat : phone;

    const res = await fetch(SUPABASE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'verify_otp', pinId, pin, phone: targetPhone, userId, profileId }),
    });
    const data = await res.json();
    if (!res.ok || !data.success || !data.verified) {
      throw new Error(data.error || data.message || 'Invalid or expired verification code');
    }
    return data;
  }

  async function checkPhoneVerificationStatus(userId, profileId) {
    const res = await fetch(SUPABASE_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_status', userId, profileId }),
    });
    const data = await res.json();
    return data;
  }

  // ── Inject CSS Styles for Modal ─────────────────────────────────────────────
  function injectModalStyles() {
    if (document.getElementById('taska-otp-styles')) return;
    const style = document.createElement('style');
    style.id = 'taska-otp-styles';
    style.textContent = `
      .taska-otp-overlay {
        position: fixed;
        inset: 0;
        background: rgba(18, 32, 26, 0.65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 16px;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s ease, visibility 0.2s ease;
      }
      .taska-otp-overlay.is-active {
        opacity: 1;
        visibility: visible;
      }
      .taska-otp-modal {
        background: var(--surface, #FFFFFF);
        border: 1px solid var(--line, #E4E7E0);
        border-radius: 20px;
        padding: 32px 28px;
        max-width: 440px;
        width: 100%;
        box-shadow: 0 20px 40px rgba(18, 32, 26, 0.16);
        text-align: center;
        position: relative;
        transform: translateY(12px) scale(0.98);
        transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .taska-otp-overlay.is-active .taska-otp-modal {
        transform: translateY(0) scale(1);
      }
      .taska-otp-close {
        position: absolute;
        top: 18px;
        right: 18px;
        background: var(--bg-soft, #F6F7F3);
        border: 1px solid var(--line, #E4E7E0);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: var(--muted, #6B776E);
        font-size: 14px;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .taska-otp-close:hover {
        background: #FEE2E2;
        color: #B91C1C;
      }
      .taska-otp-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: #E1F5E8;
        color: #146C34;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
      }
      .taska-otp-title {
        font-family: 'Space Grotesk', -apple-system, sans-serif;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--green-900, #0E3A22);
        margin: 0 0 6px 0;
      }
      .taska-otp-desc {
        font-size: 0.86rem;
        color: var(--muted, #6B776E);
        margin: 0 0 24px 0;
        line-height: 1.5;
      }
      .taska-otp-desc strong {
        color: var(--green-900, #0E3A22);
        font-family: 'IBM Plex Mono', monospace;
      }
      .taska-otp-inputs {
        display: flex;
        gap: 8px;
        justify-content: center;
        margin-bottom: 20px;
      }
      .taska-otp-cell {
        width: 48px;
        height: 54px;
        border: 2px solid var(--line, #E4E7E0);
        border-radius: 12px;
        text-align: center;
        font-size: 1.4rem;
        font-weight: 700;
        font-family: 'Space Grotesk', 'IBM Plex Mono', monospace;
        color: var(--green-900, #0E3A22);
        background: var(--surface, #FFFFFF);
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
      }
      .taska-otp-cell:focus {
        border-color: #146C34;
        box-shadow: 0 0 0 3px rgba(20, 108, 52, 0.15);
        transform: translateY(-2px);
      }
      .taska-otp-cell.is-filled {
        background: #F1FAF4;
        border-color: #229150;
      }
      .taska-otp-cell.is-error {
        border-color: #EF4444;
        background: #FEF2F2;
        animation: otpShake 0.3s ease;
      }
      @keyframes otpShake {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-4px); }
        40%, 80% { transform: translateX(4px); }
      }
      .taska-otp-error {
        font-size: 0.82rem;
        color: #DC2626;
        margin-bottom: 14px;
        min-height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .taska-otp-timer-wrap {
        font-size: 0.82rem;
        color: var(--muted, #6B776E);
        margin-bottom: 20px;
      }
      .taska-otp-resend-btn {
        background: none;
        border: none;
        color: #146C34;
        font-weight: 600;
        cursor: pointer;
        padding: 0;
        font-size: 0.82rem;
        text-decoration: underline;
      }
      .taska-otp-resend-btn:disabled {
        color: var(--muted, #6B776E);
        text-decoration: none;
        cursor: not-allowed;
        opacity: 0.65;
      }
      .taska-otp-verify-btn {
        width: 100%;
        padding: 13px 20px;
        background: #146C34;
        color: #FFFFFF;
        border: none;
        border-radius: 10px;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, opacity 0.15s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }
      .taska-otp-verify-btn:hover:not(:disabled) {
        background: #0E3A22;
      }
      .taska-otp-verify-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Open Interactive OTP Modal ──────────────────────────────────────────────
  let currentModalInstance = null;

  function openPhoneOtpModal(options = {}) {
    injectModalStyles();

    const {
      phone,
      userId,
      profileId,
      onVerified,
      onCancel,
    } = options;

    if (!phone) {
      if (window.showToast) window.showToast('Please enter a valid phone number', 'error');
      return;
    }

    // Remove existing modal if any
    if (currentModalInstance) {
      currentModalInstance.remove();
      currentModalInstance = null;
    }

    const overlay = document.createElement('div');
    overlay.className = 'taska-otp-overlay';

    overlay.innerHTML = `
      <div class="taska-otp-modal" role="dialog" aria-modal="true" aria-labelledby="taska-otp-title">
        <button type="button" class="taska-otp-close" id="taska-otp-close-btn" aria-label="Close modal">&times;</button>
        
        <div class="taska-otp-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
        </div>

        <h2 class="taska-otp-title" id="taska-otp-title">Verify Phone Number</h2>
        <p class="taska-otp-desc">
          Enter the 6-digit verification code sent via SMS to <br>
          <strong id="taska-otp-phone-display">${phone}</strong>
        </p>

        <div class="taska-otp-inputs">
          <input type="text" maxlength="1" class="taska-otp-cell" data-index="0" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" autofocus>
          <input type="text" maxlength="1" class="taska-otp-cell" data-index="1" inputmode="numeric" pattern="[0-9]*">
          <input type="text" maxlength="1" class="taska-otp-cell" data-index="2" inputmode="numeric" pattern="[0-9]*">
          <input type="text" maxlength="1" class="taska-otp-cell" data-index="3" inputmode="numeric" pattern="[0-9]*">
          <input type="text" maxlength="1" class="taska-otp-cell" data-index="4" inputmode="numeric" pattern="[0-9]*">
          <input type="text" maxlength="1" class="taska-otp-cell" data-index="5" inputmode="numeric" pattern="[0-9]*">
        </div>

        <div class="taska-otp-error" id="taska-otp-error"></div>

        <div class="taska-otp-timer-wrap">
          Didn't get code? 
          <button type="button" class="taska-otp-resend-btn" id="taska-otp-resend-btn" disabled>
            Resend SMS (<span id="taska-otp-countdown">60</span>s)
          </button>
        </div>

        <button type="button" class="taska-otp-verify-btn" id="taska-otp-submit-btn" disabled>
          Verify Phone Number
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    currentModalInstance = overlay;

    // Trigger open animation
    requestAnimationFrame(() => overlay.classList.add('is-active'));

    const cells = overlay.querySelectorAll('.taska-otp-cell');
    const errorEl = overlay.querySelector('#taska-otp-error');
    const resendBtn = overlay.querySelector('#taska-otp-resend-btn');
    const countdownEl = overlay.querySelector('#taska-otp-countdown');
    const submitBtn = overlay.querySelector('#taska-otp-submit-btn');
    const closeBtn = overlay.querySelector('#taska-otp-close-btn');
    const phoneDisplayEl = overlay.querySelector('#taska-otp-phone-display');

    let currentPinId = null;
    let timerInterval = null;
    let countdownSecs = 60;

    function getEnteredPin() {
      return Array.from(cells).map(c => c.value).join('');
    }

    function checkSubmitState() {
      const pin = getEnteredPin();
      submitBtn.disabled = pin.length !== 6;
      cells.forEach(c => {
        if (c.value) c.classList.add('is-filled');
        else c.classList.remove('is-filled');
      });
    }

    function startResendTimer() {
      if (timerInterval) clearInterval(timerInterval);
      countdownSecs = 60;
      resendBtn.disabled = true;
      countdownEl.textContent = countdownSecs;

      timerInterval = setInterval(() => {
        countdownSecs--;
        if (countdownSecs <= 0) {
          clearInterval(timerInterval);
          resendBtn.disabled = false;
          resendBtn.innerHTML = 'Resend SMS now';
        } else {
          countdownEl.textContent = countdownSecs;
        }
      }, 1000);
    }

    // Trigger initial SMS send
    async function triggerSendSms() {
      errorEl.textContent = '';
      submitBtn.disabled = true;
      resendBtn.disabled = true;
      try {
        const data = await sendPhoneOtp(phone, userId, profileId);
        currentPinId = data.pinId;
        if (data.phoneDisplay && phoneDisplayEl) {
          phoneDisplayEl.textContent = data.phoneDisplay;
        }
        startResendTimer();
        if (window.showToast) window.showToast('Verification SMS sent!', 'success');
      } catch (err) {
        errorEl.textContent = err.message || 'Failed to send SMS';
        resendBtn.disabled = false;
        resendBtn.textContent = 'Retry sending SMS';
      }
    }

    triggerSendSms();

    // ── Input Navigation & Paste Handling ─────────────────────────────────────
    cells.forEach((cell, idx) => {
      cell.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val ? val.slice(-1) : '';

        if (e.target.value && idx < cells.length - 1) {
          cells[idx + 1].focus();
        }
        checkSubmitState();
        if (getEnteredPin().length === 6) {
          triggerVerify();
        }
      });

      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !cell.value && idx > 0) {
          cells[idx - 1].focus();
        } else if (e.key === 'ArrowLeft' && idx > 0) {
          cells[idx - 1].focus();
        } else if (e.key === 'ArrowRight' && idx < cells.length - 1) {
          cells[idx + 1].focus();
        } else if (e.key === 'Enter') {
          triggerVerify();
        }
      });

      cell.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        if (pasted) {
          const digits = pasted.slice(0, 6).split('');
          digits.forEach((d, i) => {
            if (cells[i]) cells[i].value = d;
          });
          const nextIdx = Math.min(digits.length, 5);
          cells[nextIdx].focus();
          checkSubmitState();
          if (digits.length === 6) {
            triggerVerify();
          }
        }
      });
    });

    // ── Verify PIN Handler ───────────────────────────────────────────────────
    async function triggerVerify() {
      const pin = getEnteredPin();
      if (pin.length !== 6) {
        errorEl.textContent = 'Please enter all 6 digits of the verification code';
        return;
      }
      if (!currentPinId) {
        errorEl.textContent = 'SMS not yet sent. Please wait or click Resend';
        return;
      }

      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <svg style="animation:spin 1s linear infinite;" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        Verifying...
      `;
      cells.forEach(c => c.classList.remove('is-error'));

      try {
        const result = await verifyPhoneOtp(currentPinId, pin, phone, userId, profileId);
        submitBtn.innerHTML = '✓ Verified!';
        submitBtn.style.background = '#059669';

        if (window.showToast) {
          window.showToast('Phone number verified successfully!', 'success');
        }

        setTimeout(() => {
          closeModal();
          if (typeof onVerified === 'function') {
            onVerified(result);
          }
        }, 800);

      } catch (err) {
        cells.forEach(c => c.classList.add('is-error'));
        errorEl.textContent = err.message || 'Incorrect verification code. Please try again.';
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Verify Phone Number';
        cells[0].focus();
      }
    }

    submitBtn.addEventListener('click', triggerVerify);

    resendBtn.addEventListener('click', () => {
      if (!resendBtn.disabled) {
        resendBtn.disabled = true;
        resendBtn.textContent = 'Sending...';
        triggerSendSms();
      }
    });

    function closeModal() {
      if (timerInterval) clearInterval(timerInterval);
      overlay.classList.remove('is-active');
      setTimeout(() => {
        overlay.remove();
        if (currentModalInstance === overlay) currentModalInstance = null;
      }, 200);
      if (typeof onCancel === 'function') onCancel();
    }

    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Auto-focus first input cell
    setTimeout(() => {
      if (cells[0]) cells[0].focus();
    }, 100);
  }

  // ── Global Export ──────────────────────────────────────────────────────────
  window.parseNigerianPhone = parseNigerianPhone;
  window.sendPhoneOtp = sendPhoneOtp;
  window.verifyPhoneOtp = verifyPhoneOtp;
  window.checkPhoneVerificationStatus = checkPhoneVerificationStatus;
  window.openPhoneOtpModal = openPhoneOtpModal;

})();
