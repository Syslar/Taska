import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export async function checkAdminStatus(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Authentication required: missing Bearer token', status: 401 };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  
  // Use getUser() to verify the token securely.
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { error: 'Invalid or expired session token.', status: 401 };
  }

  // Enforce allowed email domains
  if (!user.email || (!user.email.endsWith('@taska.com.ng') && !user.email.endsWith('@syslar.com'))) {
    return { error: 'Unauthorized: Email domain not allowed', status: 403 };
  }

  // Check Profile table for role = ADMIN or SUPER_ADMIN
  // Note: Since we are using Supabase Auth for admins instead of Clerk, the user.id is the Supabase Auth id.
  const { data: profile, error: profileError } = await supabase
    .from('Profile')
    .select('*')
    .eq('userId', user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return { error: 'Admin profile not found', status: 404 };
  }

  if (profile.role !== 'ADMIN' && profile.role !== 'SUPER_ADMIN') {
    return { error: 'Unauthorized: User is not an admin', status: 403 };
  }

  return { ok: true, user, profile };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const authResult = await checkAdminStatus(req, supabase);
  
  if (authResult.error) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ 
    success: true, 
    profile: authResult.profile 
  }), { 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  });
});
