import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';

// ─── GET /api/v1/dashboard ────────────────────────────────────────────────────

/**
 * Returns all data needed to render the dashboard in one request:
 *  - Profile (name, role, avatar, rating)
 *  - Wallet (balance, escrow balance)
 *  - Active tasks (tasks that belong to the user, not yet completed/cancelled)
 *  - Recent wallet transactions (last 5)
 */
export async function getDashboard(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Not authenticated.', 401);

  // Find the profile linked to this Clerk user
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: {
      wallet: {
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
      tasksPosted: {
        where: {
          status: {
            in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PROOF_SUBMITTED'],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          budget: true,
          budgetType: true,
          assignedTo: true,
          applications: {
            where: { isSelected: true },
            select: {
              tasker: {
                select: { firstName: true, lastName: true },
              },
            },
            take: 1,
          },
          _count: { select: { applications: true } },
        },
      },
    },
  });

  if (!profile) {
    throw new AppError('Profile not found. Please complete registration.', 404);
  }

  // Completed task count
  const completedCount = await prisma.task.count({
    where: {
      posterId: profile.id,
      status: { in: ['COMPLETED', 'CLOSED'] },
    },
  });

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
      wallet: profile.wallet
        ? {
            balance: profile.wallet.balance,
            escrowBalance: profile.wallet.escrowBalance,
            lifetimeEarned: profile.wallet.lifetimeEarned,
            recentTransactions: profile.wallet.transactions,
          }
        : null,
      stats: {
        activeTasks: profile.tasksPosted.length,
        completedTasks: completedCount,
      },
      activeTasks: profile.tasksPosted,
    },
  });
}
