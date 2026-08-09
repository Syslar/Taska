/**
 * Taska Post Task Controller
 */

document.addEventListener('DOMContentLoaded', () => {

  const form = document.getElementById('post-task-form');
  const mediaInput = document.getElementById('task-media-input');
  let selectedMediaFile = null;

  if (mediaInput) {
    mediaInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        alert('Maximum size for media is 5MB.');
        mediaInput.value = '';
        return;
      }
      selectedMediaFile = file;
      const previewWrap = document.getElementById('task-media-preview-wrap');
      const filenameEl = document.getElementById('task-media-filename');
      if (previewWrap && filenameEl) {
        filenameEl.textContent = `📎 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`;
        previewWrap.style.display = 'flex';
      }
    };
  }

  document.getElementById('task-media-remove-btn')?.addEventListener('click', () => {
    selectedMediaFile = null;
    if (mediaInput) mediaInput.value = '';
    const previewWrap = document.getElementById('task-media-preview-wrap');
    if (previewWrap) previewWrap.style.display = 'none';
  });

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();

      const profile = await window.ensureTaskaProfile();
      if (!profile) {
        if (window.showToast) window.showToast('Please log in to post a task.');
        return;
      }

      const title = document.getElementById('task-title')?.value.trim();
      const category = document.getElementById('task-category')?.value;
      const budget = parseFloat(document.getElementById('task-budget')?.value || '0');
      const location = document.getElementById('task-location')?.value.trim();
      const description = document.getElementById('task-desc')?.value.trim();

      if (!title || !category || budget <= 0 || !description) {
        if (window.showToast) window.showToast('Please fill out all required task details.');
        return;
      }

      const submitBtn = document.getElementById('post-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting Task...';
      }

      let imageUrl = null;
      if (selectedMediaFile) {
        if (window.showToast) window.showToast('Uploading task attachment...');
        imageUrl = await window.uploadTaskaMedia(selectedMediaFile);
      }

      try {
        const { error } = await window.supabaseClient
          .from('Task')
          .insert({
            posterId: profile.id,
            title,
            category,
            budget,
            location: location || 'Remote / Anywhere',
            description,
            imageUrl: imageUrl || null,
            status: 'OPEN'
          });

        if (error) throw error;

        if (window.showToast) window.showToast('Task posted successfully! ✓');
        window.location.href = 'my-tasks.html';
      } catch (err) {
        console.error('Post task error:', err);
        if (window.showToast) window.showToast('Failed to post task. Please try again.');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Post Task Now';
        }
      }
    };
  }

});
