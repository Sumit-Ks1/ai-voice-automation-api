/**
 * Extended Express types for request context
 */

import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation ID for request tracking across services
       */
      correlationId?: string;

      /**
       * Validated request body (after schema validation)
       */
      validatedBody?: any;

      /**
       * Authenticated user information
       */
      user?: {
        id: string;
        phone: string;
        name?: string;
      };

      /**
       * Request start time for performance tracking
       */
      startTime?: number;
    }
  }
}

export {};
