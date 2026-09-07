/**
 * Taska Skeleton Loader — Universal Template & Layout Engine
 * Provides reusable animated skeleton layouts for cards, tables,
 * stat grids, profiles, and lists across all pages.
 */
(function() {
  const TaskaSkeleton = {
    // 1. Task / Gig Card Skeleton (Grid layout)
    card(count = 4) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="taska-skeleton-card" style="animation-delay:${i * 0.1}s;">
            <div class="taska-skeleton-card-header">
              <div class="taska-skeleton taska-skeleton-avatar"></div>
              <div style="flex:1;">
                <div class="taska-skeleton taska-skeleton-line medium" style="height:14px; margin-bottom:6px;"></div>
                <div class="taska-skeleton taska-skeleton-line short" style="height:11px;"></div>
              </div>
              <div class="taska-skeleton taska-skeleton-badge"></div>
            </div>
            <div class="taska-skeleton-card-body">
              <div class="taska-skeleton taska-skeleton-line full" style="height:16px; margin-bottom:8px;"></div>
              <div class="taska-skeleton taska-skeleton-line long" style="height:12px; margin-bottom:6px;"></div>
              <div class="taska-skeleton taska-skeleton-line medium" style="height:12px;"></div>
            </div>
            <div class="taska-skeleton-card-footer">
              <div class="taska-skeleton taska-skeleton-line short" style="height:14px; margin:0;"></div>
              <div class="taska-skeleton taska-skeleton-badge" style="width:84px; height:26px;"></div>
            </div>
          </div>
        `;
      }
      return html;
    },

    // 2. Table / Transaction / Activity Rows
    tableRows(count = 5) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="taska-skeleton-row" style="animation-delay:${i * 0.08}s;">
            <div class="taska-skeleton-row-left">
              <div class="taska-skeleton taska-skeleton-avatar sm"></div>
              <div style="flex:1;">
                <div class="taska-skeleton taska-skeleton-line medium" style="height:14px; margin-bottom:6px;"></div>
                <div class="taska-skeleton taska-skeleton-line short" style="height:11px;"></div>
              </div>
            </div>
            <div class="taska-skeleton-row-right">
              <div class="taska-skeleton taska-skeleton-line" style="width:80px; height:15px; margin-bottom:4px;"></div>
              <div class="taska-skeleton taska-skeleton-line" style="width:50px; height:10px;"></div>
            </div>
          </div>
        `;
      }
      return html;
    },

    // 3. Compact Task List Rows (e.g. Dashboard active tasks)
    taskRows(count = 4) {
      return this.tableRows(count);
    },

    // 4. Metric / Stat Cards Grid (e.g. Dashboard top summary cards)
    statCards(count = 4) {
      let html = '';
      for (let i = 0; i < count; i++) {
        html += `
          <div class="taska-skeleton-stat" style="animation-delay:${i * 0.1}s;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div class="taska-skeleton taska-skeleton-line short" style="height:13px; margin:0;"></div>
              <div class="taska-skeleton taska-skeleton-avatar sm" style="width:28px; height:28px;"></div>
            </div>
            <div class="taska-skeleton taska-skeleton-line medium" style="height:26px; margin:4px 0;"></div>
            <div class="taska-skeleton taska-skeleton-line short" style="height:11px; margin:0;"></div>
          </div>
        `;
      }
      return html;
    },

    // 5. Profile Bio / Summary Skeleton
    profileSummary() {
      return `
        <div style="display:flex; gap:20px; align-items:center; padding:20px; background:#fff; border-radius:14px; border:1px solid #E2E8F0;">
          <div class="taska-skeleton taska-skeleton-avatar lg"></div>
          <div style="flex:1;">
            <div class="taska-skeleton taska-skeleton-line medium" style="height:20px; margin-bottom:10px;"></div>
            <div class="taska-skeleton taska-skeleton-line short" style="height:14px; margin-bottom:8px;"></div>
            <div class="taska-skeleton taska-skeleton-line long" style="height:12px;"></div>
          </div>
        </div>
      `;
    },

    // 6. Application / Proposal Card Skeleton
    applicationCard(count = 3) {
      return this.card(count);
    },

    // Helper: Render template directly into an element or selector
    render(target, templateType = 'card', count = 4) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return null;

      let markup = '';
      if (typeof this[templateType] === 'function') {
        markup = this[templateType](count);
      } else {
        markup = this.card(count);
      }

      el.innerHTML = markup;
      return el;
    },

    // Helper: Clear skeleton
    clear(target) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (el) el.innerHTML = '';
    }
  };

  // Attach globally
  window.TaskaSkeleton = TaskaSkeleton;
})();
