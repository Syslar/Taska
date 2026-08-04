import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { authenticate } from '../middleware/authenticate';
import * as walletController from '../controllers/wallet';

const router = Router();

// GET /api/v1/wallet/me — returns current user's wallet and transactions
router.get('/me', authenticate, asyncHandler(walletController.getMyWallet));

export default router;
