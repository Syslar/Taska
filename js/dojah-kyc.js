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
      widget_id: 'laqgr4ahrVmx7xW6'
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
      const kycRef = response?.reference_id || response?.referenceId || ('DOJAH_' + Date.now());

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

            // Refresh UI state
            if (typeof window.renderSettingsPage === 'function') {
              window.renderSettingsPage();
            }
            if (typeof window.initSidebar === 'function') {
              window.initSidebar();
            }
          }
        } catch (err) {
          console.error('Supabase KYC update error:', err);
        }
      }
    },
    onError: function (error) {
      console.error('Dojah KYC Error:', error);
      if (window.showToast) {
        window.showToast('Verification could not be completed. Please try again.');
      }
    },
    onClose: function () {
      console.log('Dojah KYC Widget closed');
    }
  };

  try {
    const WidgetConstructor = window.Connect || window.Dojah;
    if (WidgetConstructor) {
      const connect = new WidgetConstructor(options);
      if (typeof connect.setup === 'function') connect.setup();
      if (typeof connect.open === 'function') connect.open();
    } else {
      if (window.showToast) window.showToast('Dojah Widget Constructor not available.');
    }
  } catch (err) {
    console.error('Error starting Dojah Widget:', err);
    if (window.showToast) window.showToast('Failed to open verification modal.');
  }
};
