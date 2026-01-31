import pino from 'pino';
import { config, isDevelopment } from './env';

/**
 * Production-grade logger configuration using Pino
 * Pino is chosen over Winston for its superior performance (5x-10x faster)
 * and built-in support for structured logging
 */
const logger = pino({
  level: config.LOG_LEVEL,
  
  // Pretty print in development, JSON in production
  transport: config.LOG_PRETTY && isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,

  // Base configuration for structured logging
  base: {
    pid: process.pid,
    env: config.NODE_ENV,
  },

  // Format timestamp
  timestamp: () => `,"time":"${new Date().toISOString()}"`,

  // Serializers for common objects
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
      },
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders?.(),
    }),
    err: pino.stdSerializers.err,
  },

  // Redact sensitive information from logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'password',
      'token',
      'apiKey',
      'auth_token',
      'access_token',
      '*.password',
      '*.token',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with additional context
 * @param context - Object with additional fields to include in all logs
 * @example
 * const log = createChildLogger({ service: 'twilio', correlationId: 'abc123' });
 * log.info('Processing webhook');
 */
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log error with full context
 * @param error - Error object or message
 * @param context - Additional context
 */
export function logError(error: Error | string, context?: Record<string, any>) {
  if (error instanceof Error) {
    logger.error({ err: error, ...context }, error.message);
  } else {
    logger.error({ ...context }, error);
  }
}

/**
 * Log performance metrics
 * @param operation - Operation name
 * @param duration - Duration in milliseconds
 * @param context - Additional context
 */
export function logPerformance(
  operation: string,
  duration: number,
  context?: Record<string, any>
) {
  logger.info(
    {
      type: 'performance',
      operation,
      duration_ms: duration,
      ...context,
    },
    `${operation} completed in ${duration}ms`
  );
}

export default logger;
