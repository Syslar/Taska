// supabase/functions/task-escrow/index.ts
// POST https://<project>.supabase.co/functions/v1/task-escrow
//
// Performs atomic, secure escrow locking, payout release, revision requests, and auto-release operations:
//   - action: 'lock' (locks poster funds for agreed budget upon hire)
//   - action: 'release' (releases net payout to tasker and deducts 10% platform commission)
//   - action: 'request_changes' (poster requests deliverable changes, reverts to IN_PROGRESS)
//   - action: 'auto_release_check' (auto-releases escrow for deliverables untouched for 7 days)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@4.15.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FRONTEND_API_URL = Deno.env.get('FRONTEND_API_URL') || 'https://modest-sturgeon-45.clerk.accounts.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const JWKS = createRemoteJWKSet(new URL(`${FRONTEND_API_URL}/.well-known/jwks.json`));

async function authenticateCaller(req: Request, supabase: any, targetProfileId?: string) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Authentication required: missing Bearer token', status: 401 };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: 'Empty token', status: 401 };

  try {
    const { payload } = await jwtVerify(token, JWKS);
    const clerkUserId = payload.sub;

    if (!clerkUserId) {
      return { error: 'Invalid token subject', status: 401 };
    }

    if (targetProfileId) {
      const { data: profile, error } = await supabase
        .from('Profile')
        .select('id, userId')
        .eq('id', targetProfileId)
        .maybeSingle();

      if (error || !profile) {
        return { error: 'Profile not found', status: 404 };
      }

      if (profile.userId !== clerkUserId) {
        return { error: 'Unauthorized: You do not own this profile', status: 403 };
      }

      return { ok: true, clerkUserId, profile };
    }

    return { ok: true, clerkUserId };
  } catch (err: any) {
    console.error('[task-escrow] Auth error:', err.message || err);
    return { error: 'Invalid or expired session token. Please log in again.', status: 401 };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const respond = (data: object, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await req.json(); } catch {
    return respond({ error: 'Invalid JSON body' }, 400);
  }

  const { action, taskId, posterId, applicationId, revisionNotes } = body;

  if (!action) {
    return respond({ error: 'action is required' }, 400);
  }

  try {
    // 1. Auto Release Check (Can be triggered by cron or authenticated client)
    if (action === 'auto_release_check') {
      const { data, error } = await supabase.rpc('auto_release_expired_escrow');
      if (error) {
        console.error('[task-escrow] auto_release_expired_escrow RPC error:', error);
        return respond({ error: error.message || 'Auto-release check failed' }, 500);
      }
      return respond({ success: true, result: data });
    }

    // All poster-specific actions require taskId and posterId
    if (!taskId || !posterId) {
      return respond({ error: 'taskId and posterId are required' }, 400);
    }

    // Enforce JWT Authentication & Profile Ownership
    const authResult = await authenticateCaller(req, supabase, posterId);
    if (authResult.error) {
      return respond({ error: authResult.error }, authResult.status || 401);
    }

    // 2. Lock Escrow on Hire
    if (action === 'lock') {
      if (!applicationId) {
        return respond({ error: 'applicationId required for escrow lock' }, 400);
      }

      const { data, error } = await supabase.rpc('task_escrow_lock', {
        p_task_id: taskId,
        p_application_id: applicationId,
        p_poster_id: posterId,
      });

      if (error) {
        const msg = error.message || '';
        if (msg.includes('INSUFFICIENT_BALANCE')) {
          return respond({ error: 'Insufficient wallet balance to secure this task in escrow' }, 400);
        }
        console.error('[task-escrow] lock RPC error:', error);
        return respond({ error: msg || 'Failed to lock escrow' }, 400);
      }

      return respond({ success: true, result: data });

    // 3. Release Escrow on Approval (10% Taska commission taken)
    } else if (action === 'release') {
      const { data, error } = await supabase.rpc('task_escrow_release', {
        p_task_id: taskId,
        p_poster_id: posterId,
      });

      if (error) {
        console.error('[task-escrow] release RPC error:', error);
        return respond({ error: error.message || 'Failed to release payout' }, 400);
      }

      return respond({ success: true, result: data });

    // 4. Request Changes on Submitted Deliverable
    } else if (action === 'request_changes') {
      const { data, error } = await supabase.rpc('task_request_changes', {
        p_task_id: taskId,
        p_poster_id: posterId,
        p_revision_notes: revisionNotes || '',
      });

      if (error) {
        console.error('[task-escrow] request_changes RPC error:', error);
        return respond({ error: error.message || 'Failed to request changes' }, 400);
      }

      return respond({ success: true, result: data });

    } else {
      return respond({ error: `Invalid action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error('[task-escrow] Unhandled error:', err);
    return respond({ error: 'Internal server error' }, 500);
  }
});
