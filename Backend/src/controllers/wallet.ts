import { Request, Response } from 'express';
import { supabase } from '../utils/supabase';
import { AppError } from '../utils/errors';

// ─── GET /api/v1/wallet/me ────────────────────────────────────────────────────
// Returns the authenticated user's wallet balance, stats, and full transaction history.

export async function getMyWallet(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Not authenticated.', 401);

  // Get profile
  const { data: profile } = await supabase
    .from('Profile')
    .select('id, firstName, lastName, role')
    .eq('userId', userId)
    .single();

  if (!profile) throw new AppError('Profile not found. Please complete registration.', 404);

  // Get wallet
  const { data: wallet } = await supabase
    .from('Wallet')
    .select('*')
    .eq('profileId', profile.id)
    .single();

  if (!wallet) {
    // Wallet doesn't exist yet — return zero state
    res.json({
      success: true,
      data: {
        balance: 0,
        escrowBalance: 0,
        lifetimeEarned: 0,
        transactions: [],
        stats: { totalEarned: 0, totalWithdrawn: 0, inEscrow: 0, thisMonth: 0 },
      },
    });
    return;
  }

  // Get all transactions
  const { data: transactions } = await supabase
    .from('WalletTransaction')
    .select('*')
    .eq('walletId', wallet.id)
    .order('createdAt', { ascending: false })
    .limit(100);

  const txs = transactions || [];

  // Calculate stats from real data
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalEarned = txs
    .filter((t: any) => ['task_payout', 'escrow_release', 'top_up'].includes(t.type))
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  const totalWithdrawn = txs
    .filter((t: any) => t.type === 'withdrawal')
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  const thisMonth = txs
    .filter((t: any) => new Date(t.createdAt) >= startOfMonth && ['task_payout', 'escrow_release'].includes(t.type))
    .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

  res.json({
    success: true,
    data: {
      balance: wallet.balance,
      escrowBalance: wallet.escrowBalance,
      lifetimeEarned: wallet.lifetimeEarned,
      transactions: txs,
      stats: {
        totalEarned,
        totalWithdrawn,
        inEscrow: wallet.escrowBalance,
        thisMonth,
      },
    },
  });
}
