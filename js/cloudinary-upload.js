/* ==========================================================================
   cloudinary-upload.js — Unsigned Cloudinary & Media Upload Helper
   Provides high-performance media upload for avatars, task proofs, and attachments.
   ========================================================================== */

const CLOUDINARY_CLOUD_NAME = 'syslar-taska'; 
const CLOUDINARY_UPLOAD_PRESET = 'taska_unsigned';

/**
 * Upload a File object to Cloudinary or Supabase Storage.
 * Returns the secure HTTPS URL of the uploaded media.
 */
window.uploadTaskaMedia = async function (file) {
  if (!file) return null;

  // Enforce strict 5MB maximum file size for all media (pictures & videos)
  const MAX_SIZE_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    const errorMsg = 'Maximum size for media is 5MB.';
    if (window.showToast) {
      window.showToast(errorMsg);
    } else if (window.showAlertDialog) {
      window.showAlertDialog({ title: 'File Too Large', message: errorMsg });
    }
    return null;
  }

  // 1. Try Cloudinary Unsigned Upload (auto endpoint for images & videos)
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return data.secure_url;
    }
  } catch (_) { /* fallback to local object URL */ }

  // 2. Fallback: Convert to Base64 data URL for fast local previews
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
};

/**
 * Delete a media asset from Cloudinary by its URL or publicId.
 * Calls the authenticated Supabase Edge Function to perform secure deletion.
 */
window.deleteCloudinaryMedia = async function (mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== 'string') return null;

  // Only attempt deletion for remote Cloudinary media (skip base64 or other hosts)
  if (!mediaUrl.includes('cloudinary.com')) {
    return null;
  }

  try {
    const supabaseUrl = window.SUPABASE_URL || 'https://nhittvkskzwpeinscxir.supabase.co';
    const anonKey = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXR0dmtza3p3cGVpbnNjeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNzY2MzQsImV4cCI6MjA5ODk1MjYzNH0.dII7qIobUbjdAAijn1mYQuu543djIL2sSROY5egQaMc';

    const res = await fetch(`${supabaseUrl}/functions/v1/delete-cloudinary-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
      },
      body: JSON.stringify({ mediaUrl }),
    });

    if (res.ok) {
      const result = await res.json().catch(() => ({}));
      return result;
    }
  } catch (err) {
    console.warn('[Cloudinary] Media deletion notice:', err);
  }
  return null;
};
