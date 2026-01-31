/**
 * Zod validation schemas for appointment-related operations
 * Provides runtime type safety and validation
 */

import { z } from 'zod';

/**
 * Appointment status enum
 */
export const appointmentStatusSchema = z.enum([
  'scheduled',
  'confirmed',
  'cancelled',
  'completed',
  'no_show',
  'rescheduled',
]);

/**
 * Phone number validation (E.164 format)
 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format. Use E.164 format (e.g., +1234567890)');

/**
 * Date validation (YYYY-MM-DD format)
 */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD');

/**
 * Time validation (HH:mm format, 24-hour)
 */
export const timeSchema = z
  .string()
  .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm (24-hour)');

/**
 * Create appointment schema
 */
export const createAppointmentSchema = z.object({
  patientName: z
    .string()
    .min(2, 'Patient name must be at least 2 characters')
    .max(100, 'Patient name must be less than 100 characters')
    .trim(),
  patientPhone: phoneNumberSchema,
  appointmentDate: dateSchema,
  appointmentTime: timeSchema,
  reason: z
    .string()
    .max(500, 'Reason must be less than 500 characters')
    .optional(),
  durationMinutes: z
    .number()
    .int()
    .positive()
    .max(480, 'Duration cannot exceed 8 hours')
    .optional(),
  callSid: z.string().optional(),
  sessionId: z.string().optional(),
});

/**
 * Update appointment schema (all fields optional except ID)
 */
export const updateAppointmentSchema = z.object({
  appointmentId: z.string().uuid('Invalid appointment ID'),
  appointmentDate: dateSchema.optional(),
  appointmentTime: timeSchema.optional(),
  reason: z
    .string()
    .max(500, 'Reason must be less than 500 characters')
    .optional(),
  status: appointmentStatusSchema.optional(),
  notes: z
    .string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional(),
});

/**
 * Cancel appointment schema
 */
export const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid('Invalid appointment ID'),
  reason: z
    .string()
    .max(500, 'Cancellation reason must be less than 500 characters')
    .optional(),
});

/**
 * Get appointment schema
 */
export const getAppointmentSchema = z.object({
  appointmentId: z.string().uuid('Invalid appointment ID'),
});

/**
 * List appointments query schema
 */
export const listAppointmentsSchema = z.object({
  patientPhone: phoneNumberSchema.optional(),
  status: z.union([appointmentStatusSchema, z.array(appointmentStatusSchema)]).optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Appointment conflict check schema
 */
export const checkConflictSchema = z.object({
  appointmentDate: dateSchema,
  appointmentTime: timeSchema,
  durationMinutes: z.number().int().positive().optional(),
  excludeAppointmentId: z.string().uuid().optional(),
});

/**
 * Type exports
 */
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;
export type GetAppointmentInput = z.infer<typeof getAppointmentSchema>;
export type ListAppointmentsInput = z.infer<typeof listAppointmentsSchema>;
export type CheckConflictInput = z.infer<typeof checkConflictSchema>;
