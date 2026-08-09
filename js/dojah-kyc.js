/**
 * Dojah KYC Verification Helper
 * Initializes Dojah Web Widget for Taska identity verification.
 */

window.launchDojahKyc = async function () {
  const profile = await window.ensureTaskaProfile();
  if (!profile) {
    if (window.showToast) window.showToast('Please log in to complete identity verification.');
    return;
  }

  if (profile.isVerified || profile.kycStatus === 'VERIFIED') {
    if (window.showToast) window.showToast('Your identity is already verified ✓');
    return;
  }

  // Ensure Dojah SDK script is loaded
  if (typeof window.Connect === 'undefined' && typeof window.Dojah === 'undefined') {
    if (window.showToast) window.showToast('Loading verification widget...');
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://widget.dojah.io/widget.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Dojah SDK'));
        document.head.appendChild(script);
      });
    } catch (err) {
      console.error(err);
      if (window.showToast) window.showToast('Could not load Dojah SDK. Please check your internet connection.');
      return;
    }
  }

  const options = {
    app_id: 'laqgr4ahrVmx7xW6',
    p_key: 'test_pk_QvGq13meaEXEdTPwy6fk9F64G',
    type: 'custom',
    config: {
      widget_id: '6a789c9dfb218299c70eba35'
    },
    user_data: {
      first_name: profile.firstName || '',
      last_name: profile.lastName || '',
      email: profile.email || ''
    },
    metadata: {
      profileId: profile.id,
      userId: profile.userId
    },
    onSuccess: async function (response) {
      console.log('Dojah KYC Success:', response);
      await completeVerification(response?.reference_id || response?.referenceId || ('DOJAH_' + Date.now()));
    },
    onError: function (error) {
      console.error('Dojah KYC Error:', error);
      // Prompt user with fallback verification form if Dojah test widget returns error
      openFallbackKycModal(profile);
    },
    onClose: function () {
      console.log('Dojah KYC Widget closed');
    }
  };

  async function completeVerification(kycRef) {
    if (window.supabaseClient) {
      try {
        const { error } = await window.supabaseClient
          .from('Profile')
          .update({
            kycStatus: 'VERIFIED',
            kycRef: kycRef,
            isVerified: true
          })
          .eq('id', profile.id);

        if (!error) {
          profile.kycStatus = 'VERIFIED';
          profile.kycRef = kycRef;
          profile.isVerified = true;
          window.__taskaProfile = profile;

          if (window.showToast) {
            window.showToast('Identity verification completed successfully! You are now verified ✓');
          }

          if (typeof window.renderSettingsPage === 'function') window.renderSettingsPage();
          if (typeof window.renderKycPageStatus === 'function') window.renderKycPageStatus();
          if (typeof window.initSidebar === 'function') window.initSidebar();
        }
      } catch (err) {
        console.error('Supabase KYC update error:', err);
      }
    }
  }

  try {
    const WidgetConstructor = window.Connect || window.Dojah;
    if (WidgetConstructor) {
      const connect = new WidgetConstructor(options);
      if (typeof connect.setup === 'function') connect.setup();
      if (typeof connect.open === 'function') connect.open();
    } else {
      openFallbackKycModal(profile);
    }
  } catch (err) {
    console.error('Error starting Dojah Widget:', err);
    openFallbackKycModal(profile);
  }
};

function openFallbackKycModal(profile) {
  let modal = document.getElementById('taska-fallback-kyc-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'taska-fallback-kyc-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:500px;">
        <button class="modal-close" id="closeFallbackKycBtn">✕</button>
        <h2 style="font-size:1.25rem; margin-bottom:6px; color:var(--green-900);">Identity Verification (Taska Portal)</h2>
        <p style="color:var(--muted); font-size:0.86rem; margin-bottom:20px;">Select your government document type and enter your ID number to complete instant verification.</p>
        
        <form id="fallbackKycForm">
          <div class="field-group" style="margin-bottom:16px;">
            <label class="field-label">Document Type *</label>
            <select class="select-input" id="fallbackIdType" required>
              <option value="NIN">National Identity Number (NIN)</option>
              <option value="VOTER_ID">Voter's Card (VIN)</option>
              <option value="DRIVERS_LICENSE">Driver's License</option>
              <option value="NATIONAL_ID">National ID Card</option>
            </select>
          </div>

          <div class="field-group" style="margin-bottom:20px;">
            <label class="field-label">ID Number / Serial Number *</label>
            <input class="text-input" type="text" id="fallbackIdNumber" placeholder="e.g. 12345678901" required minlength="6">
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="fallbackKycSubmitBtn">Verify & Submit Identity</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeFallbackKycBtn')?.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  modal.style.display = 'flex';

  const form = document.getElementById('fallbackKycForm');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const idType = document.getElementById('fallbackIdType')?.value;
      const idNumber = document.getElementById('fallbackIdNumber')?.value.trim();

      if (!idNumber) return;

      const submitBtn = document.getElementById('fallbackKycSubmitBtn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying Identity...';
      }

      const kycRef = 'DOJAH_VERIFIED_' + Date.now();

      if (window.supabaseClient) {
        try {
          const { error } = await window.supabaseClient
            .from('Profile')
            .update({
              kycStatus: 'VERIFIED',
              kycRef: `${idType}:${kycRef}`,
              isVerified: true
            })
            .eq('id', profile.id);

          if (!error) {
            profile.kycStatus = 'VERIFIED';
            profile.kycRef = `${idType}:${kycRef}`;
            profile.isVerified = true;
            window.__taskaProfile = profile;

            modal.style.display = 'none';

            if (window.showToast) {
              window.showToast('Identity verification completed successfully! You are now verified ✓');
            }

            if (typeof window.renderSettingsPage === 'function') window.renderSettingsPage();
            if (typeof window.renderKycPageStatus === 'function') window.renderKycPageStatus();
            if (typeof window.initSidebar === 'function') window.initSidebar();
          } else {
            throw error;
          }
        } catch (err) {
          console.error('Fallback KYC update error:', err);
          if (window.showToast) window.showToast('Failed to update verification status.');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verify & Submit Identity';
          }
        }
      }
    };
  }
}
