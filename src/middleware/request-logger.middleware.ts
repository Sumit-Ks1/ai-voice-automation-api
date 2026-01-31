/**
 * Request logging middleware
 * Logs incoming requests and outgoing responses
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import logger from '../config/logger';

/**
 * Generate correlation ID for request tracking
 */
export function correlationId(req: Request, res: Response, next: NextFunction): void {
  // Use existing correlation ID from header or generate new one
  req.correlationId =
    req.header('X-Correlation-ID') ||
    req.header('X-Request-ID') ||
    randomUUID();

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', req.correlationId);

  next();
}

/**
 * Log incoming requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Record request start time
  req.startTime = Date.now();

  // Log incoming request
  logger.info(
    {
      correlationId: req.correlationId,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.header('user-agent'),
    },
    `Incoming ${req.method} ${req.url}`
  );

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());

    logger.info(
      {
        correlationId: req.correlationId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
      },
      `Completed ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`
    );
  });

  next();
}

/**
 * Log request body (for debugging)
 * Only in development mode to avoid logging sensitive data
 */
export function logRequestBody(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'development' && req.body) {
    logger.debug(
      {
        correlationId: req.correlationId,
        body: req.body,
      },
      'Request body'
    );
  }

  next();
}
