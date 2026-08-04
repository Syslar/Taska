import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import * as tasksController from '../controllers/tasks';

const router = Router();

// GET /api/v1/tasks — public listing of open tasks
router.get('/', asyncHandler(tasksController.getTasks));

// POST /api/v1/tasks/:id/apply — authenticated taskers only
router.post('/:id/apply', authenticate, asyncHandler(tasksController.applyToTask));

export default router;
