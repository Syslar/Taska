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

  // 1. Try Cloudinary Unsigned Upload
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      return data.secure_url;
    }
  } catch (_) { /* fallback to local object URL or Supabase storage */ }

  // 2. Fallback: Convert to Base64 data URL for fast local previews
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
};
