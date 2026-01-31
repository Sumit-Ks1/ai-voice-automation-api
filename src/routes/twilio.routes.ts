/**
 * Twilio routes
 * Defines routes for Twilio webhook endpoints
 */

import { Router } from 'express';
import { handleInboundCall, handleCallStatus } from '../controllers/twilio.controller';
import { verifyTwilioWebhook } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * POST /api/v1/twilio/inbound
 * Handle inbound call webhook from Twilio
 * Security: Twilio signature verification
 */
router.post(
  '/inbound',
  verifyTwilioWebhook,
  asyncHandler(handleInboundCall)
);

/**
 * POST /api/v1/twilio/status
 * Handle call status callback from Twilio
 * Security: Twilio signature verification
 */
router.post(
  '/status',
  verifyTwilioWebhook,
  asyncHandler(handleCallStatus)
);

export default router;
