import { Request, Response } from 'express';
import { supabase } from '../utils/supabase';
import { AppError } from '../utils/errors';

// ─── GET /api/v1/tasks ────────────────────────────────────────────────────────
// Returns paginated open tasks for the Browse Gigs page.
// Public endpoint (no auth required) so anyone can see available tasks.

export async function getTasks(req: Request, res: Response): Promise<void> {
  const { search, category, location, sort = 'newest', page = '1', limit = '20' } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const from = (pageNum - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('Task')
    .select(`
      id, title, description, status, budget, budgetType, category, location, createdAt, updatedAt,
      Profile!posterId(id, firstName, lastName, averageRating, isVerified)
    `, { count: 'exact' })
    .in('status', ['OPEN', 'ASSIGNED'])
    .range(from, to);

  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }
  if (category && category !== 'all') {
    query = query.ilike('category', category);
  }
  if (location && location !== 'all') {
    if (location.toLowerCase() === 'remote') {
      query = query.ilike('location', 'remote');
    } else {
      query = query.ilike('location', `%${location}%`);
    }
  }

  if (sort === 'budget_high') {
    query = query.order('budget', { ascending: false });
  } else if (sort === 'deadline') {
    query = query.order('updatedAt', { ascending: true });
  } else {
    query = query.order('createdAt', { ascending: false });
  }

  const { data: tasks, error, count } = await query;

  if (error) {
    throw new AppError('Failed to fetch tasks', 500);
  }

  // For each task also get application count
  const tasksWithCounts = await Promise.all((tasks || []).map(async (task: any) => {
    const { count: appCount } = await supabase
      .from('Application')
      .select('*', { count: 'exact', head: true })
      .eq('taskId', task.id);

    return {
      ...task,
      poster: task['Profile!posterId'] || task.Profile,
      applicationCount: appCount || 0,
    };
  }));

  res.json({
    success: true,
    data: {
      tasks: tasksWithCounts,
      pagination: {
        total: count || 0,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    },
  });
}

// ─── POST /api/v1/tasks/:id/apply ─────────────────────────────────────────────
// Submit an application to a task. Requires authentication.

export async function applyToTask(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Not authenticated.', 401);

  const { id: taskId } = req.params;
  const { coverNote, proposedAmount } = req.body as { coverNote?: string; proposedAmount?: number };

  // Get the tasker's profile
  const { data: profile } = await supabase
    .from('Profile')
    .select('id, role')
    .eq('userId', userId)
    .single();

  if (!profile) throw new AppError('Profile not found. Please complete registration.', 404);
  if (profile.role !== 'TASKER') throw new AppError('Only Taskers can apply to tasks.', 403);

  // Verify task is still open
  const { data: task } = await supabase
    .from('Task')
    .select('id, status, posterId')
    .eq('id', taskId)
    .single();

  if (!task) throw new AppError('Task not found.', 404);
  if (task.status !== 'OPEN') throw new AppError('This task is no longer accepting applications.', 400);
  if (task.posterId === profile.id) throw new AppError('You cannot apply to your own task.', 400);

  // Check if already applied
  const { data: existingApp } = await supabase
    .from('Application')
    .select('id')
    .eq('taskId', taskId)
    .eq('taskerId', profile.id)
    .maybeSingle();

  if (existingApp) throw new AppError('You have already applied to this task.', 409);

  // Create application
  const { data: application, error } = await supabase
    .from('Application')
    .insert({
      taskId,
      taskerId: profile.id,
      coverNote: coverNote || null,
      proposedAmount: proposedAmount || null,
    })
    .select()
    .single();

  if (error || !application) {
    throw new AppError('Failed to submit application.', 500);
  }

  res.status(201).json({ success: true, application });
}

// ─── POST /api/v1/tasks ────────────────────────────────────────────────────────
// Create a new task (authenticated Task Poster or any logged-in user)

export async function createTask(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) throw new AppError('Not authenticated.', 401);

  const { title, category, description, taskType, location, deadline, preferredTime, budgetType, budget, budgetMin, budgetMax } = req.body;

  if (!title || !category || !description) {
    throw new AppError('Title, category, and description are required.', 400);
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('Profile')
    .select('id, role')
    .eq('userId', userId)
    .single();

  if (!profile) throw new AppError('Profile not found. Please complete registration.', 404);

  const normalizedTaskType = (taskType || 'PHYSICAL').toUpperCase();
  const normalizedBudgetType = (budgetType || 'FIXED').toUpperCase() === 'OPEN' ? 'OPEN_BID' : 'FIXED';

  const { data: task, error } = await supabase
    .from('Task')
    .insert({
      posterId: profile.id,
      title: title.trim(),
      category: category.trim(),
      description: description.trim(),
      taskType: normalizedTaskType === 'REMOTE' ? 'REMOTE' : 'PHYSICAL',
      location: location ? location.trim() : (normalizedTaskType === 'REMOTE' ? 'Remote' : null),
      deadline: deadline ? new Date(deadline).toISOString() : null,
      preferredTime: preferredTime || null,
      budgetType: normalizedBudgetType,
      budget: budget ? parseFloat(budget) : null,
      budgetMin: budgetMin ? parseFloat(budgetMin) : null,
      budgetMax: budgetMax ? parseFloat(budgetMax) : null,
      status: 'OPEN',
    })
    .select()
    .single();

  if (error || !task) {
    console.error('Task creation error:', error);
    throw new AppError('Failed to create task.', 500);
  }

  res.status(201).json({ success: true, task });
}

