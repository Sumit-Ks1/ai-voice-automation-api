/**
 * Zod validation schemas for user operations
 */

import { z } from 'zod';
import { phoneNumberSchema } from './appointment.schema';

/**
 * Create user schema
 */
export const createUserSchema = z.object({
  phoneNumber: phoneNumberSchema,
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional(),
  email: z.string().email('Invalid email address').optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Update user schema
 */
export const updateUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .trim()
    .optional(),
  email: z.string().email('Invalid email address').optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Get user schema
 */
export const getUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID').optional(),
  phoneNumber: phoneNumberSchema.optional(),
}).refine((data) => data.userId || data.phoneNumber, {
  message: 'Either userId or phoneNumber must be provided',
});

/**
 * User verification schema (for call authentication)
 */
export const verifyUserSchema = z.object({
  phoneNumber: phoneNumberSchema,
  name: z.string().min(2).max(100).trim().optional(),
});

/**
 * Type exports
 */
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type GetUserInput = z.infer<typeof getUserSchema>;
export type VerifyUserInput = z.infer<typeof verifyUserSchema>;
