/**
 * Zod validation schemas for Ultravox callback webhooks
 * Validates AI agent response data
 */

import { z } from 'zod';
import { phoneNumberSchema, dateSchema, timeSchema } from './appointment.schema';

/**
 * Intent type enum
 */
export const intentTypeSchema = z.enum([
  'create_appointment',
  'edit_appointment',
  'cancel_appointment',
  'check_status',
  'unknown',
]);

/**
 * Extracted data schema for appointments
 */
export const extractedDataSchema = z.object({
  appointmentType: z.enum(['create', 'edit', 'cancel', 'status']).optional(),
  appointmentDate: z.string().optional(),
  appointmentTime: z.string().optional(),
  patientName: z.string().min(2).max(100).optional(),
  patientPhone: z.string().optional(),
  reason: z.string().max(500).optional(),
  existingAppointmentId: z.string().uuid().optional(),
});

/**
 * Intent schema
 */
export const intentSchema = z.object({
  name: z.string(),
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.any()).optional(),
});

/**
 * Error schema
 */
export const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

/**
 * Main Ultravox callback webhook schema
 */
export const ultravoxCallbackSchema = z.object({
  sessionId: z.string().min(10, 'Invalid session ID'),
  callSid: z.string().startsWith('CA', 'Invalid Twilio Call SID'),
  status: z.enum(['completed', 'failed', 'timeout']),
  duration: z.number().int().min(0),
  transcript: z.string().optional(),
  intent: intentSchema.optional(),
  extractedData: extractedDataSchema.optional(),
  error: errorSchema.optional(),
});

/**
 * Normalized intent data for internal processing
 */
export const normalizedIntentSchema = z.object({
  type: intentTypeSchema,
  confidence: z.number().min(0).max(1),
  parameters: z.object({
    date: dateSchema.optional(),
    time: timeSchema.optional(),
    patientName: z.string().min(2).max(100).optional(),
    patientPhone: phoneNumberSchema.optional(),
    reason: z.string().max(500).optional(),
    appointmentId: z.string().uuid().optional(),
  }),
});

/**
 * Type exports
 */
export type UltravoxCallbackInput = z.infer<typeof ultravoxCallbackSchema>;
export type IntentType = z.infer<typeof intentTypeSchema>;
export type NormalizedIntent = z.infer<typeof normalizedIntentSchema>;
export type ExtractedData = z.infer<typeof extractedDataSchema>;
