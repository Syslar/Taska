import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
// Use the service_role key so the backend bypasses RLS.
// Our backend already authenticates users via Clerk JWT,
// so it is a trusted server and should have full DB access.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

// Realtime is disabled — this is a pure REST/PostgREST backend.
// Disabling it removes the native WebSocket requirement from @supabase/realtime-js.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    timeout: 0,
    heartbeatIntervalMs: 0,
    reconnectAfterMs: () => 99_999_999,
  },
  global: {
    headers: { 'X-Client-Info': 'taska-backend' },
  },
});
