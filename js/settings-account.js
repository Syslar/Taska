/**
 * Taska Settings Account & Security Controller
 * Manages Transaction PIN verification, updates, rate limits, and frozen states.
 */

(function () {
  'use strict';

  let currentProfile = null;

  async function getAuthToken() {
    if (typeof window.getTaskaToken === 'function') {
      const t = await window.getTaskaToken();
      if (t) return t;
    }
    if (window.Clerk && window.Clerk.session) {
      try {
        return await window.Clerk.session.getToken();
      } catch (_) {}
    }
    return null;
  }

  function showAlert(message, type = 'error') {
    const alertEl = document.getElementById('changePinAlert');
    if (!alertEl) return;

    alertEl.style.display = 'block';
    if (type === 'success') {
      alertEl.style.background = '#ECFDF5';
      alertEl.style.border = '1px solid #A7F3D0';
      alertEl.style.color = '#065F46';
    } else if (type === 'warning' || type === 'rate_limit') {
      alertEl.style.background = '#FFFBEB';
      alertEl.style.border = '1px solid #FCD34D';
      alertEl.style.color = '#92400E';
    } else {
      alertEl.style.background = '#FEF2F2';
      alertEl.style.border = '1px solid #FCA5A5';
      alertEl.style.color = '#991B1B';
    }
    alertEl.textContent = message;
  }

  function hideAlert() {
    const alertEl = document.getElementById('changePinAlert');
    if (alertEl) {
      alertEl.style.display = 'none';
      alertEl.textContent = '';
    }
  }

  function renderStatusBadge(status) {
    const badge = document.getElementById('pinStatusBadge');
    if (!badge) return;

    // Remove skeleton shimmer
    badge.classList.remove('taska-skeleton');
    badge.style.minWidth = '';
    badge.style.minHeight = '';

    if (status === 'FROZEN') {
      badge.style.background = '#FEE2E2';
      badge.style.color = '#DC2626';
      badge.innerHTML = `
        <span style="width:7px; height:7px; border-radius:50%; background:#DC2626; display:inline-block;"></span>
        Wallet Frozen
      `;
    } else if (status === 'NOT_SET') {
      badge.style.background = '#FEF3C7';
      badge.style.color = '#B45309';
      badge.innerHTML = `
        <span style="width:7px; height:7px; border-radius:50%; background:#F59E0B; display:inline-block;"></span>
        Setup Required
      `;
    } else if (status === 'ACTIVE') {
      badge.style.background = '#ECFDF5';
      badge.style.color = '#059669';
      badge.innerHTML = `
        <span style="width:7px; height:7px; border-radius:50%; background:#10B981; display:inline-block;"></span>
        Active & Protected
      `;
    } else {
      badge.style.background = '#F1F5F9';
      badge.style.color = '#475569';
      badge.innerHTML = `
        <span style="width:7px; height:7px; border-radius:50%; background:#94A3B8; display:inline-block;"></span>
        Checking...
      `;
    }
  }

  async function loadPinStatus() {
    try {
      const badge = document.getElementById('pinStatusBadge');
      if (badge) {
        badge.classList.add('taska-skeleton');
        badge.style.cssText += 'min-width:120px;min-height:1.5em;border-radius:20px;display:inline-block;';
        badge.innerHTML = '';
      }
      renderStatusBadge('LOADING');
      if (!currentProfile) {
        currentProfile = await window.ensureTaskaProfile();
      }
      if (!currentProfile) return;

      const token = await getAuthToken();
      if (!token) return;

      const res = await fetch(`https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin?action=status&profileId=${currentProfile.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        console.error('[settings-account] Failed to fetch PIN status:', data.error);
        return;
      }

      const frozenNotice = document.getElementById('settingsWalletFrozenNotice');
      const setupContainer = document.getElementById('settingsPinSetupContainer');
      const changeContainer = document.getElementById('settingsPinChangeContainer');

      if (data.is_frozen) {
        renderStatusBadge('FROZEN');
        if (frozenNotice) frozenNotice.style.display = 'block';
        if (setupContainer) setupContainer.style.display = 'none';
        if (changeContainer) changeContainer.style.display = 'none';
        return;
      }

      if (frozenNotice) frozenNotice.style.display = 'none';

      const isPinSet = Boolean(data.pin_is_set || data.is_set);
      if (!isPinSet) {
        renderStatusBadge('NOT_SET');
        if (setupContainer) setupContainer.style.display = 'block';
        if (changeContainer) changeContainer.style.display = 'none';
      } else {
        renderStatusBadge('ACTIVE');
        if (setupContainer) setupContainer.style.display = 'none';
        if (changeContainer) changeContainer.style.display = 'block';
      }
    } catch (err) {
      console.error('[settings-account] loadPinStatus error:', err);
    }
  }

  function setupPinFormHandlers() {
    const currentInput = document.getElementById('currentPinInput');
    const newInput = document.getElementById('newPinInput');
    const confirmInput = document.getElementById('confirmNewPinInput');
    const submitBtn = document.getElementById('btnUpdatePin');
    const form = document.getElementById('changePinForm');
    const setupBtn = document.getElementById('btnOpenPinSetupModal');

    // Trigger mandatory PIN setup modal if user clicks "Set Up 4-Digit PIN Now"
    setupBtn?.addEventListener('click', async () => {
      if (typeof window.promptTransactionPinSetupModal === 'function') {
        window.promptTransactionPinSetupModal(currentProfile);
      }
    });

    // Enforce 4 numeric digits on all PIN inputs with auto-advance
    const inputs = [currentInput, newInput, confirmInput].filter(Boolean);
    inputs.forEach((input, idx) => {
      input.addEventListener('input', (e) => {
        hideAlert();
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (e.target.value.length === 4 && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          inputs[idx - 1].focus();
        }
      });
    });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();

      const currentPin = currentInput?.value?.trim() || '';
      const newPin = newInput?.value?.trim() || '';
      const confirmPin = confirmInput?.value?.trim() || '';

      if (currentPin.length !== 4) {
        showAlert('Please enter your 4-digit Current PIN.');
        currentInput?.focus();
        return;
      }
      if (newPin.length !== 4) {
        showAlert('Please enter a 4-digit New PIN.');
        newInput?.focus();
        return;
      }
      if (confirmPin.length !== 4) {
        showAlert('Please confirm your new 4-digit PIN.');
        confirmInput?.focus();
        return;
      }
      if (newPin !== confirmPin) {
        showAlert('New PIN and confirmation PIN do not match.');
        confirmInput?.focus();
        return;
      }
      if (currentPin === newPin) {
        showAlert('Your new PIN must be different from your current PIN.');
        newInput?.focus();
        return;
      }

      if (!currentProfile) {
        currentProfile = await window.ensureTaskaProfile();
      }
      const token = await getAuthToken();
      if (!token) {
        showAlert('Authentication error. Please refresh and log in again.');
        return;
      }

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.innerHTML = `
        <svg class="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:middle; display:inline-block; margin-right:4px;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
          <path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path>
        </svg> Updating PIN...
      `;

      try {
        const res = await fetch('https://nhittvkskzwpeinscxir.supabase.co/functions/v1/wallet-pin', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'change',
            profileId: currentProfile.id,
            currentPin,
            newPin,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || data.error) {
          if (res.status === 429 || data.code === 'RATE_LIMITED') {
            showAlert('Rate limit exceeded: You can only change your transaction PIN 3 times in 24 hours. Please try again tomorrow.', 'rate_limit');
            return;
          }

          if (data.code === 'WALLET_FROZEN' || data.is_frozen) {
            renderStatusBadge('FROZEN');
            const frozenNotice = document.getElementById('settingsWalletFrozenNotice');
            const changeContainer = document.getElementById('settingsPinChangeContainer');
            if (frozenNotice) frozenNotice.style.display = 'block';
            if (changeContainer) changeContainer.style.display = 'none';
            showAlert('Wallet frozen due to 3 incorrect attempts. Please contact support@taska.com.ng to appeal.');
            return;
          }

          if (data.code === 'WRONG_PIN') {
            const attempts = typeof data.attempts_remaining === 'number' ? ` (${data.attempts_remaining} attempt${data.attempts_remaining === 1 ? '' : 's'} remaining)` : '';
            showAlert(`Current PIN is incorrect${attempts}.`);
            currentInput.value = '';
            currentInput.focus();
            return;
          }

          showAlert(data.error || 'Failed to update transaction PIN. Please try again.');
          return;
        }

        // Success
        showAlert('Transaction PIN updated successfully! A security confirmation has been dispatched to your email.', 'success');
        if (currentInput) currentInput.value = '';
        if (newInput) newInput.value = '';
        if (confirmInput) confirmInput.value = '';

        if (window.showToast) {
          window.showToast('Transaction PIN updated successfully!', 'success');
        }

        // Refresh PIN status
        await loadPinStatus();

      } catch (err) {
        console.error('[settings-account] Change PIN error:', err);
        showAlert(err.message || 'Network error updating PIN. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    const btnForgotPinSettings = document.getElementById('btnForgotPinSettings');
    if (btnForgotPinSettings) {
      btnForgotPinSettings.addEventListener('click', () => {
        if (typeof window.openForgotPinModal === 'function') {
          window.openForgotPinModal({
            onSuccess: () => {
              if (window.showToast) window.showToast('Transaction PIN reset successfully!', 'success');
              loadPinStatus();
            },
          });
        }
      });
    }
  }

  // Listen for custom event if user sets PIN through the global setup modal while on this page
  window.addEventListener('taska:pin_created', () => {
    loadPinStatus();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadPinStatus();
      setupPinFormHandlers();
    });
  } else {
    loadPinStatus();
    setupPinFormHandlers();
  }

  window.reloadAccountPinSecurity = loadPinStatus;
})();
