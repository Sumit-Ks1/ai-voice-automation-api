/**
 * Error handling middleware
 * Centralized error processing and response formatting
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger, { logError } from '../config/logger';
import { AppError } from '../utils/errors';
import { isDevelopment } from '../config/env';

/**
 * Error response interface
 */
interface ErrorResponse {
  status: 'error';
  message: string;
  code?: string;
  errors?: any[];
  stack?: string;
  correlationId?: string;
}

/**
 * Main error handling middleware
 * Catches all errors and formats appropriate responses
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error with context
  logError(error, {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const errorResponse: ErrorResponse = {
      status: 'error',
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      })),
      correlationId: req.correlationId,
    };

    res.status(400).json(errorResponse);
    return;
  }

  // Handle custom application errors
  if (error instanceof AppError) {
    const errorResponse: ErrorResponse = {
      status: 'error',
      message: error.message,
      code: error.name,
      correlationId: req.correlationId,
    };

    // Include stack trace in development
    if (isDevelopment && error.stack) {
      errorResponse.stack = error.stack;
    }

    // Include additional context if available
    if (error.context) {
      errorResponse.errors = [error.context];
    }

    res.status(error.statusCode).json(errorResponse);
    return;
  }

  // Handle unknown errors
  const errorResponse: ErrorResponse = {
    status: 'error',
    message: isDevelopment ? error.message : 'Internal server error',
    code: 'INTERNAL_ERROR',
    correlationId: req.correlationId,
  };

  // Include stack trace in development
  if (isDevelopment && error.stack) {
    errorResponse.stack = error.stack;
  }

  res.status(500).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse: ErrorResponse = {
    status: 'error',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
    correlationId: req.correlationId,
  };

  res.status(404).json(errorResponse);
}

/**
 * Async handler wrapper
 * Catches async errors and passes them to error middleware
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Unhandled rejection handler (process level)
 */
export function handleUnhandledRejection(): void {
  process.on('unhandledRejection', (reason: Error | any, promise: Promise<any>) => {
    logger.error(
      {
        err: reason,
        promise,
      },
      'Unhandled Promise Rejection'
    );

    // In production, might want to exit process
    if (!isDevelopment) {
      logger.fatal('Unhandled rejection in production, shutting down');
      process.exit(1);
    }
  });
}

/**
 * Uncaught exception handler (process level)
 */
export function handleUncaughtException(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.fatal(
      {
        err: error,
      },
      'Uncaught Exception'
    );

    // Always exit on uncaught exceptions
    process.exit(1);
  });
}
