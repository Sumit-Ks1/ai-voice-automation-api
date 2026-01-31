/**
 * Twilio service for webhook validation and API interactions
 * Handles webhook signature verification for security
 */

import { validateRequest } from 'twilio';
import { config } from '../config/env';
import logger from '../config/logger';
import { AuthenticationError } from '../utils/errors';

/**
 * Validate Twilio webhook signature
 * Prevents unauthorized webhook calls by verifying Twilio's signature
 * 
 * @param signature - X-Twilio-Signature header value
 * @param url - Full webhook URL (including protocol and query params)
 * @param params - POST body parameters
 * @throws {AuthenticationError} If signature is invalid
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, any>
): void {
  if (!config.TWILIO_WEBHOOK_SIGNATURE_VALIDATION) {
    logger.warn('Twilio webhook signature validation is disabled');
    return;
  }

  if (!signature) {
    throw new AuthenticationError('Missing Twilio signature header');
  }

  const isValid = validateRequest(
    config.TWILIO_AUTH_TOKEN,
    signature,
    url,
    params
  );

  if (!isValid) {
    logger.error({ url, params }, 'Invalid Twilio webhook signature');
    throw new AuthenticationError('Invalid Twilio webhook signature');
  }

  logger.debug('Twilio webhook signature validated successfully');
}

/**
 * Extract caller information from Twilio webhook
 * @param params - Twilio webhook parameters
 */
export function extractCallerInfo(params: Record<string, any>) {
  return {
    callSid: params.CallSid,
    from: params.From,
    to: params.To,
    callStatus: params.CallStatus,
    direction: params.Direction,
    callerName: params.CallerName,
    fromCity: params.FromCity,
    fromState: params.FromState,
    fromCountry: params.FromCountry,
  };
}

/**
 * Check if call is from a verified number (optional additional security)
 * @param phoneNumber - Phone number to check
 */
export function isVerifiedCaller(_phoneNumber: string): boolean {
  // Implement whitelist/blacklist logic if needed
  // For now, accept all callers
  return true;
}

/**
 * Format Twilio error for logging
 * @param error - Twilio API error
 */
export function formatTwilioError(error: any): string {
  if (error.status) {
    return `Twilio API Error ${error.status}: ${error.message}`;
  }
  return error.message || 'Unknown Twilio error';
}
