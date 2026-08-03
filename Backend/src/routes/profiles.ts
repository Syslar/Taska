import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import * as profileController from '../controllers/profiles';

const router = Router();

// GET /profiles/me — own profile (protected)
router.get('/me', authenticate, asyncHandler(profileController.getMe));

// PUT /profiles/me — update own profile (protected)
router.put('/me', authenticate, asyncHandler(profileController.updateMe));

// GET /profiles/:id — any public profile (public)
router.get('/:id', asyncHandler(profileController.getProfile));

export default router;
