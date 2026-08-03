import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import { registerValidation } from '../validators/auth';
import * as authController from '../controllers/auth';

const router = Router();

// POST /auth/register — create Profile + Wallet 
// This endpoint is called from the frontend after a successful Clerk signup.
// It requires a valid Clerk JWT passed in the Authorization header.
router.post('/register', authenticate, registerValidation, asyncHandler(authController.register));

export default router;