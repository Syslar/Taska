import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function checkAdminStatus(req: Request, supabase: any) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: 'Authentication required: missing Bearer token', status: 401 };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { error: 'Invalid or expired session token.', status: 401 };
  }

  const { data: profile, error: profileError } = await supabase
    .from('Profile')
    .select('*')
    .eq('userId', user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== 'ADMIN') {
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

  const url = new URL(req.url);
  const resource = url.searchParams.get('resource');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  
  const start = (page - 1) * limit;
  const end = start + limit - 1;

  try {
    if (resource === 'users') {
      const { data, error, count } = await supabase
        .from('Profile')
        .select('*', { count: 'exact' })
        .neq('role', 'ADMIN')
        .neq('role', 'SUPER_ADMIN')
        .order('createdAt', { ascending: false })
        .range(start, end);
        
      if (error) throw error;

      const { count: postersCount } = await supabase.from('Profile').select('*', { count: 'exact', head: true }).eq('role', 'USER');
      const { count: taskersCount } = await supabase.from('Profile').select('*', { count: 'exact', head: true }).eq('role', 'TASKER');
      const { count: suspendedCount } = await supabase.from('Profile').select('*', { count: 'exact', head: true }).eq('status', 'SUSPENDED').neq('role', 'ADMIN').neq('role', 'SUPER_ADMIN');
      const { count: posterRoleCount } = await supabase.from('Profile').select('*', { count: 'exact', head: true }).eq('role', 'POSTER');
      
      const stats = {
        total: count || 0,
        posters: (postersCount || 0) + (posterRoleCount || 0),
        taskers: taskersCount || 0,
        suspended: suspendedCount || 0
      };

      return new Response(JSON.stringify({ success: true, data, count, stats }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    if (resource === 'tasks') {
      const { data, error, count } = await supabase
        .from('Task')
        .select('*, poster:posterId(firstName, lastName, email), assignedTo(firstName, lastName)', { count: 'exact' })
        .order('createdAt', { ascending: false })
        .range(start, end);
        
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data, count }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    if (resource === 'disputes') {
      const { data, error, count } = await supabase
        .from('Task')
        .select('*, poster:posterId(firstName, lastName, email), assignedTo(firstName, lastName)', { count: 'exact' })
        .eq('status', 'DISPUTED')
        .order('createdAt', { ascending: false })
        .range(start, end);
        
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, data, count }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Invalid resource' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error(`Error fetching ${resource}:`, err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
