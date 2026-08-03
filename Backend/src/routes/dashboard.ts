import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import * as dashboardController from '../controllers/dashboard';

const router = Router();

// GET /api/v1/dashboard — full dashboard payload (protected)
router.get('/', authenticate, asyncHandler(dashboardController.getDashboard));

export default router;
