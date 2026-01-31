import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Environment configuration schema with strict validation
 * Ensures all required variables are present and properly formatted
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC'),
  TWILIO_AUTH_TOKEN: z.string().min(32),
  TWILIO_PHONE_NUMBER: z.string().regex(/^\+\d{10,15}$/),
  TWILIO_WEBHOOK_SIGNATURE_VALIDATION: z.string().transform(val => val === 'true' || val === '1').default('true'),

  // Ultravox
  ULTRAVOX_API_KEY: z.string().min(20),
  ULTRAVOX_API_URL: z.string().url(),
  ULTRAVOX_AGENT_ID: z.string().min(10),
  ULTRAVOX_WEBHOOK_URL: z.string().url(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_ENABLED: z.string().transform(val => val === 'true' || val === '1').default('true'),

  // Business Configuration
  BUSINESS_TIMEZONE: z.string().default('America/New_York'),
  BUSINESS_HOURS_START: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  BUSINESS_HOURS_END: z.string().regex(/^\d{2}:\d{2}$/).default('17:00'),
  BUSINESS_DAYS: z.string().regex(/^[0-6](,[0-6])*$/).default('1,2,3,4,5'),
  APPOINTMENT_DURATION_MINUTES: z.coerce.number().int().positive().default(30),
  APPOINTMENT_BUFFER_MINUTES: z.coerce.number().int().min(0).default(15),

  // Security
  API_KEY: z.string().min(32),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: z.string().transform(val => val === 'true' || val === '1').default('false'),
});

/**
 * Parse and validate environment variables
 * @throws {Error} If validation fails with detailed error messages
 */
function validateEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      throw new Error(
        `Environment validation failed:\n${missingVars.join('\n')}\n\nPlease check your .env file.`
      );
    }
    throw error;
  }
}

/**
 * Validated and typed environment configuration
 */
export const config = validateEnv();

/**
 * Derived configuration values
 */
export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

/**
 * Parse business days into array of numbers (0=Sunday, 6=Saturday)
 */
export const businessDays = config.BUSINESS_DAYS.split(',').map((d) => parseInt(d, 10));

/**
 * Parse business hours into minutes since midnight for easy comparison
 */
export const businessHoursStart = (() => {
  const [hours, minutes] = config.BUSINESS_HOURS_START.split(':').map(Number);
  return hours * 60 + minutes;
})();

export const businessHoursEnd = (() => {
  const [hours, minutes] = config.BUSINESS_HOURS_END.split(':').map(Number);
  return hours * 60 + minutes;
})();

/**
 * Export type for use in other modules
 */
export type Config = z.infer<typeof envSchema>;
