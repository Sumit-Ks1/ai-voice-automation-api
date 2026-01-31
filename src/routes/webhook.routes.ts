/**
 * Webhook routes
 * Defines routes for external webhook callbacks
 */

import { Router } from 'express';
import { handleUltravoxCallback, healthCheck } from '../controllers/webhook.controller';
import { verifyUltravoxWebhook } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { ultravoxCallbackSchema } from '../schemas/callback.schema';

const router = Router();

/**
 * POST /api/v1/webhooks/ultravox
 * Handle callback webhook from Ultravox AI agent
 * Security: Optional Ultravox signature verification
 */
router.post(
  '/ultravox',
  verifyUltravoxWebhook,
  validateBody(ultravoxCallbackSchema),
  asyncHandler(handleUltravoxCallback)
);

/**
 * GET /api/v1/webhooks/health
 * Health check endpoint
 * No authentication required
 */
router.get('/health', asyncHandler(healthCheck));

export default router;
