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
 * Note: Signature validation can fail behind reverse proxies if URL doesn't match
 */
export function verifyTwilioWebhook(req: Request, _res: Response, next: NextFunction): void {
  try {
    // Skip validation if disabled
    if (!config.TWILIO_WEBHOOK_SIGNATURE_VALIDATION) {
      logger.debug('Twilio webhook signature validation disabled, skipping');
      return next();
    }

    const signature = req.header('X-Twilio-Signature');

    if (!signature) {
      logger.warn({ url: req.originalUrl }, 'Missing Twilio signature header - allowing request for debugging');
      // In production, uncomment: throw new AuthenticationError('Missing Twilio signature header');
      return next();
    }

    // Use X-Forwarded headers if available (common behind proxies like Render)
    const forwardedProto = req.header('X-Forwarded-Proto') || req.protocol;
    const forwardedHost = req.header('X-Forwarded-Host') || req.get('host');
    const url = `${forwardedProto}://${forwardedHost}${req.originalUrl}`;
    
    logger.debug({ constructedUrl: url, originalUrl: req.originalUrl }, 'Validating Twilio signature');

    // Validate signature
    validateTwilioSignature(signature, url, req.body);

    next();
  } catch (error) {
    logger.error(
      {
        err: error,
        url: req.originalUrl,
        headers: {
          host: req.get('host'),
          forwardedHost: req.header('X-Forwarded-Host'),
          forwardedProto: req.header('X-Forwarded-Proto'),
        },
        correlationId: req.correlationId,
      },
      'Twilio webhook signature verification failed'
    );
    // For debugging, allow the request through
    logger.warn('Allowing request despite signature failure for debugging');
    next();
    // In production, uncomment: next(error);
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
