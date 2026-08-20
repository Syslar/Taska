/**
 * Dojah KYC Verification Helper
 * Initializes Dojah Web Widget for Taska identity verification with clean SVG status,
 * and enforces strict correlation checks between government documents and Taska profile (DOB & Gender).
 */

window.launchDojahKyc = async function () {
  const profile = await window.ensureTaskaProfile();
  if (!profile) {
    if (window.showToast) window.showToast('Please log in to complete identity verification.');
    return;
  }

  if (profile.isVerified || profile.kycStatus === 'VERIFIED') {
    if (window.showToast) window.showToast('Your identity is already verified.');
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
    type: 'verification',
    config: {
      widget_id: '6a789c9dfb218299c70eba35'
    },
    user_data: {
      first_name: profile.firstName || '',
      last_name: profile.lastName || '',
      email: profile.email || '',
      dob: profile.dateOfBirth || ''
    },
    metadata: {
      profileId: profile.id,
      userId: profile.userId
    },
    onSuccess: async function (response) {
      console.log('Dojah KYC Success:', response);
      await processKycResponse(response);
    },
    onError: function (error) {
      console.error('Dojah KYC Error:', error);
      const errMsg = error?.message || (typeof error === 'string' ? error : 'Unable to connect to verification servers');
      if (window.showAlertDialog) {
        window.showAlertDialog({
          title: 'Verification Service Unavailable',
          message: `Dojah identity verification could not be initialized (${errMsg}). Please check your internet connection or try again shortly.`,
          isDanger: true
        });
      } else if (window.showToast) {
        window.showToast(`Verification failed: ${errMsg}`);
      }
    },
    onClose: function () {
      console.log('Dojah KYC Widget closed');
    }
  };

  async function processKycResponse(response) {
    const kycRef = response?.reference_id || response?.referenceId || response?.id || ('DOJAH_' + Date.now());
    const docData = response?.data || response?.verification_data || response?.user_data || {};

    // Correlate Document Data against Taska Profile
    const docDob = docData.dob || docData.date_of_birth || docData.birthdate;
    const docGender = docData.gender || docData.sex;

    if (profile.dateOfBirth && docDob) {
      const pDob = new Date(profile.dateOfBirth).toISOString().split('T')[0];
      const dDob = new Date(docDob).toISOString().split('T')[0];
      if (pDob !== dDob) {
        const errorMsg = `KYC Verification Failed: The Date of Birth on your government document (${dDob}) does not match your declared profile Date of Birth (${pDob}). Please update your profile information or provide matching documentation.`;
        if (window.showAlertDialog) {
          window.showAlertDialog({ title: 'KYC Verification Mismatch', message: errorMsg, isDanger: true });
        } else if (window.showToast) {
          window.showToast(errorMsg);
        }
        return;
      }
    }

    if (profile.gender && docGender) {
      const pG = profile.gender.trim().toUpperCase()[0];
      const dG = docGender.trim().toUpperCase()[0];
      if (pG !== dG) {
        const errorMsg = `KYC Verification Failed: The gender recorded on your official ID (${docGender}) does not correlate with your declared profile gender (${profile.gender}).`;
        if (window.showAlertDialog) {
          window.showAlertDialog({ title: 'KYC Verification Mismatch', message: errorMsg, isDanger: true });
        } else if (window.showToast) {
          window.showToast(errorMsg);
        }
        return;
      }
    }

    // Correlation passed! Complete verification
    await completeVerification(kycRef);
  }

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

          try {
            localStorage.setItem('taska_cached_profile', JSON.stringify(profile));
          } catch (_) {}

          if (window.showAlertDialog) {
            window.showAlertDialog({
              title: 'Identity Verified!',
              message: 'Your government identity documents correlate with your Taska profile. You have been awarded the verified badge and can now apply for all verified tasks.'
            });
          } else if (window.showToast) {
            window.showToast('Identity verification completed successfully! You are now verified.');
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
      if (window.showToast) window.showToast('Verification widget could not be started.');
    }
  } catch (err) {
    console.error('Error starting Dojah Widget:', err);
    if (window.showAlertDialog) {
      window.showAlertDialog({
        title: 'Verification Widget Error',
        message: 'Could not initialize Dojah widget. Please try again.',
        isDanger: true
      });
    }
  }
};
