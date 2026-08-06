/* ==========================================================================
   supabase-client.js — Direct Supabase Integration & Rate Limiter
   Provides secure, direct database access via public anon key + RLS.
   ========================================================================== */

const SUPABASE_URL = 'https://nhittvkskzwpeinscxir.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5oaXR0dmtza3p3cGVpbnNjeGlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzNzY2MzQsImV4cCI6MjA5ODk1MjYzNH0.dII7qIobUbjdAAijn1mYQuu543djIL2sSROY5egQaMc';

// Initialize global Supabase Client
if (window.supabase && window.supabase.createClient) {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn('Supabase JS SDK not loaded yet. Waiting for script...');
}

// ─── Rate Limiter & Throttler Utility ──────────────────────────────────────────
window.TaskaRateLimiter = (function () {
  const lastExecutions = new Map();

  return {
    /**
     * Prevents an action from running more than once per `intervalMs`.
     * @param {string} key - Unique identifier for the action (e.g. 'post-task', 'check-username')
     * @param {number} intervalMs - Minimum milliseconds between executions (default 1000ms)
     * @returns {boolean} - Returns true if allowed, false if rate limited.
     */
    canExecute: function (key, intervalMs = 1000) {
      const now = Date.now();
      const last = lastExecutions.get(key) || 0;
      if (now - last < intervalMs) {
        return false;
      }
      lastExecutions.set(key, now);
      return true;
    },

    /**
     * Debounce helper for search / live input checks
     */
    debounce: function (func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }
  };
})();
