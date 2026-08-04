import { Request, Response } from 'express';
import { supabase } from '../utils/supabase';
import { AppError } from '../utils/errors';

// ─── GET /api/v1/dashboard ────────────────────────────────────────────────────

export async function getDashboard(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Not authenticated.', 401);

  // 1. Find profile & wallet
  const { data: profile, error: profileErr } = await supabase
    .from('Profile')
    .select('*, Wallet(*)')
    .eq('userId', userId)
    .single();

  if (profileErr || !profile) {
    throw new AppError('Profile not found. Please complete registration.', 404);
  }

  const wallet = profile.Wallet?.[0] || null;

  // 2. Find recent wallet transactions
  let recentTransactions = [];
  if (wallet) {
    const { data: txs } = await supabase
      .from('WalletTransaction')
      .select('*')
      .eq('walletId', wallet.id)
      .order('createdAt', { ascending: false })
      .limit(5);
    recentTransactions = txs || [];
  }

  // 3. Find active tasks
  const { data: activeTasks } = await supabase
    .from('Task')
    .select('id, title, status, budget, budgetType, assignedTo')
    .eq('posterId', profile.id)
    .in('status', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PROOF_SUBMITTED'])
    .order('updatedAt', { ascending: false })
    .limit(5);

  // Manually fetch application counts & selected taskers for these tasks
  const tasksWithDetails = [];
  if (activeTasks && activeTasks.length > 0) {
    for (const task of activeTasks) {
      // Get count of applications
      const { count } = await supabase
        .from('Application')
        .select('*', { count: 'exact', head: true })
        .eq('taskId', task.id);
      
      // Get selected application
      const { data: selectedApps } = await supabase
        .from('Application')
        .select('*, Profile!taskerId(firstName, lastName)')
        .eq('taskId', task.id)
        .eq('isSelected', true)
        .limit(1);

      const applications = selectedApps?.map((app: any) => ({
        tasker: app.Profile
      })) || [];

      tasksWithDetails.push({
        ...task,
        applications,
        _count: { applications: count || 0 }
      });
    }
  }

  // 4. Find completed tasks count
  const { count: completedCount } = await supabase
    .from('Task')
    .select('*', { count: 'exact', head: true })
    .eq('posterId', profile.id)
    .in('status', ['COMPLETED', 'CLOSED']);

  res.json({
    success: true,
    data: {
      profile: {
        id: profile.id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        role: profile.role,
        avatarUrl: profile.avatarUrl,
        averageRating: profile.averageRating,
        totalReviews: profile.totalReviews,
        kycStatus: profile.kycStatus,
        isVerified: profile.isVerified,
      },
      wallet: wallet
        ? {
            balance: wallet.balance,
            escrowBalance: wallet.escrowBalance,
            lifetimeEarned: wallet.lifetimeEarned,
            recentTransactions,
          }
        : null,
      stats: {
        activeTasks: activeTasks?.length || 0,
        completedTasks: completedCount || 0,
      },
      activeTasks: tasksWithDetails,
    },
  });
}
