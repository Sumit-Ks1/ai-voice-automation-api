/**
 * Webhook routes - Ultravox AI callback endpoints
 * Each tool has its own dedicated endpoint for cleaner routing
 */

import { Router } from 'express';
import {
  createAppointment,
  checkAppointment,
  editAppointment,
  cancelAppointment,
  transferCall,
  endCall,
  handleUltravoxCallback,
  healthCheck,
} from '../controllers/webhook.controller';
import { verifyUltravoxWebhook } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validation.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { z } from 'zod';

const router = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createAppointmentSchema = z.object({
  full_name: z.string().min(1, 'Full name is required'),
  phone_number: z.string().min(10, 'Phone number is required'),
  preferred_date: z.string().min(1, 'Preferred date is required'),
  preferred_time: z.string().min(1, 'Preferred time is required'),
  reason_for_visit: z.string().optional(),
});

const checkAppointmentSchema = z.object({
  phone_number: z.string().min(10, 'Phone number is required'),
  full_name: z.string().optional(),
});

const editAppointmentSchema = z.object({
  phone_number: z.string().min(10, 'Phone number is required'),
  full_name: z.string().optional(),
  original_date: z.string().min(1, 'Original date is required'),
  new_date: z.string().optional(),
  new_time: z.string().optional(),
});

const cancelAppointmentSchema = z.object({
  phone_number: z.string().min(10, 'Phone number is required'),
  full_name: z.string().optional(),
  appointment_date: z.string().min(1, 'Appointment date is required'),
  cancellation_reason: z.string().optional(),
});

const transferCallSchema = z.object({
  reason: z.string().min(1, 'Transfer reason is required'),
  notes: z.string().optional(),
  call_sid: z.string().optional(),
});

const endCallSchema = z.object({
  outcome: z.string().min(1, 'Outcome is required'),
  summary: z.string().optional(),
  call_sid: z.string().optional(),
});

// ============================================
// APPOINTMENT ROUTES
// ============================================

/**
 * POST /api/v1/webhooks/ultravox/appointment/create
 * Create a new appointment for a patient
 */
router.post(
  '/ultravox/appointment/create',
  verifyUltravoxWebhook,
  validateBody(createAppointmentSchema),
  asyncHandler(createAppointment)
);

/**
 * POST /api/v1/webhooks/ultravox/appointment/check
 * Look up existing appointments
 */
router.post(
  '/ultravox/appointment/check',
  verifyUltravoxWebhook,
  validateBody(checkAppointmentSchema),
  asyncHandler(checkAppointment)
);

/**
 * POST /api/v1/webhooks/ultravox/appointment/edit
 * Modify an existing appointment
 */
router.post(
  '/ultravox/appointment/edit',
  verifyUltravoxWebhook,
  validateBody(editAppointmentSchema),
  asyncHandler(editAppointment)
);

/**
 * POST /api/v1/webhooks/ultravox/appointment/cancel
 * Cancel an existing appointment
 */
router.post(
  '/ultravox/appointment/cancel',
  verifyUltravoxWebhook,
  validateBody(cancelAppointmentSchema),
  asyncHandler(cancelAppointment)
);

// ============================================
// CALL CONTROL ROUTES
// ============================================

/**
 * POST /api/v1/webhooks/ultravox/call/transfer
 * Transfer call to human staff
 */
router.post(
  '/ultravox/call/transfer',
  verifyUltravoxWebhook,
  validateBody(transferCallSchema),
  asyncHandler(transferCall)
);

/**
 * POST /api/v1/webhooks/ultravox/call/end
 * End the call
 */
router.post(
  '/ultravox/call/end',
  verifyUltravoxWebhook,
  validateBody(endCallSchema),
  asyncHandler(endCall)
);

// ============================================
// LEGACY & HEALTH ROUTES
// ============================================

/**
 * POST /api/v1/webhooks/ultravox
 * Legacy unified endpoint (backward compatibility)
 */
router.post(
  '/ultravox',
  verifyUltravoxWebhook,
  asyncHandler(handleUltravoxCallback)
);

/**
 * GET /api/v1/webhooks/health
 * Health check endpoint for webhook service
 */
router.get('/health', asyncHandler(healthCheck));

export default router;
