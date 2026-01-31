/**
 * Authentication middleware
 * Handles Twilio webhook signature verification and API key auth
 */

import { Request, Response, NextFunction } from 'express';
import { validateTwilioSignature } from '../services/twilio.service';
import { config } from '../config/env';
import { AuthenticationError } from '../utils/errors';
import logger from '../config/logger';

/**
 * Verify Twilio webhook signature
 * Ensures request actually came from Twilio
 */
export function verifyTwilioWebhook(req: Request, _res: Response, next: NextFunction): void {
  try {
    const signature = req.header('X-Twilio-Signature');

    if (!signature) {
      throw new AuthenticationError('Missing Twilio signature header');
    }

    // Construct full URL including protocol and host
    const protocol = req.protocol;
    const host = req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Validate signature
    validateTwilioSignature(signature, url, req.body);

    next();
  } catch (error) {
    logger.error(
      {
        err: error,
        url: req.originalUrl,
        correlationId: req.correlationId,
      },
      'Twilio webhook signature verification failed'
    );
    next(error);
  }
}

/**
 * Verify internal API key
 * Used for non-webhook endpoints that need authentication
 */
export function verifyApiKey(req: Request, _res: Response, next: NextFunction): void {
  try {
    const apiKey = req.header('X-API-Key') || req.query.apiKey;

    if (!apiKey) {
      throw new AuthenticationError('Missing API key');
    }

    if (apiKey !== config.API_KEY) {
      throw new AuthenticationError('Invalid API key');
    }

    next();
  } catch (error) {
    logger.error(
      {
        err: error,
        url: req.originalUrl,
        correlationId: req.correlationId,
      },
      'API key verification failed'
    );
    next(error);
  }
}

/**
 * Optional Ultravox webhook verification
 * Add signature verification if Ultravox supports it
 */
export function verifyUltravoxWebhook(req: Request, _res: Response, next: NextFunction): void {
  // TODO: Implement Ultravox-specific webhook verification if available
  // For now, rely on API key or other security measures

  const ultravoxSignature = req.header('X-Ultravox-Signature');

  if (ultravoxSignature) {
    // Verify signature here if Ultravox provides verification method
    logger.debug('Ultravox signature present but verification not implemented');
  }

  next();
}
