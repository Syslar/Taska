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
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const authResult = await checkAdminStatus(req, supabase);
  
  if (authResult.error) {
    return new Response(JSON.stringify({ error: authResult.error }), {
      status: authResult.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Fetch Wallets to calculate Escrow, User Funds, Revenue
    // (Note: The schema specifies 'Wallet' model with 'balance' and 'escrowBalance' and 'lifetimeEarned')
    const { data: wallets } = await supabase.from('Wallet').select('balance, escrowBalance, lifetimeEarned, lifetimeWithdrawn');
    
    let totalEscrowHeld = 0;
    let totalUserFunds = 0;
    let totalTaskaRevenue = 0; // We'll compute this from platform fees or lifetime stats
    
    if (wallets) {
      wallets.forEach((w: any) => {
        totalEscrowHeld += (w.escrowBalance || 0);
        totalUserFunds += (w.balance || 0);
      });
    }

    // Taska revenue approximation: sum of all platform fees from Payments
    const { data: payments } = await supabase.from('Payment').select('fee, status').in('status', ['HELD_IN_ESCROW', 'RELEASED']);
    if (payments) {
      payments.forEach((p: any) => {
        totalTaskaRevenue += (p.fee || 0);
      });
    }

    // 2. Stat Grid data
    const { count: totalUsers } = await supabase.from('Profile').select('*', { count: 'exact', head: true });
    
    // Tasks completed today
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const { count: tasksCompletedToday } = await supabase
      .from('Task')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'COMPLETED')
      .gte('completedAt', startOfDay.toISOString());
      
    const { count: activeDisputes } = await supabase
      .from('Task')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'DISPUTED');
      
    // 3. Open Disputes
    const { data: disputesList } = await supabase
      .from('Task')
      .select('id, title, budget, status, poster:posterId(firstName, lastName), createdAt')
      .eq('status', 'DISPUTED')
      .order('createdAt', { ascending: false })
      .limit(5);

    // 4. Recent Transactions
    const { data: recentTransactions } = await supabase
      .from('Payment')
      .select('id, amount, status, taskerId, posterId, createdAt')
      .order('createdAt', { ascending: false })
      .limit(5);

    // 5. Actual Paystack Balance
    const PAYSTACK_SECRET_KEY = Deno.env.get('PAYSTACK_SECRET_KEY');
    let actualPaystackBalance = 0;
    if (PAYSTACK_SECRET_KEY) {
      try {
        const pResponse = await fetch('https://api.paystack.co/balance', {
          headers: {
            'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Cache-Control': 'no-cache',
          }
        });
        if (pResponse.ok) {
          const pData = await pResponse.json();
          if (pData.status && pData.data && pData.data.length > 0) {
            const ngnBalance = pData.data.find((b: any) => b.currency === 'NGN') || pData.data[0];
            if (ngnBalance) {
               // Paystack balance is returned in kobo (smallest currency unit), convert to main unit
               actualPaystackBalance = (ngnBalance.balance || 0) / 100;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching paystack balance:', err);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      balanceHero: {
        totalEscrowHeld,
        totalUserFunds,
        totalTaskaRevenue,
        ledgerPaystackBalance: totalEscrowHeld + totalUserFunds + totalTaskaRevenue,
        actualPaystackBalance
      },
      stats: {
        totalUsers: totalUsers || 0,
        tasksCompletedToday: tasksCompletedToday || 0,
        activeDisputes: activeDisputes || 0
      },
      disputes: disputesList || [],
      recentTransactions: recentTransactions || []
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  } catch (err: any) {
    console.error('Error fetching dashboard data:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});
