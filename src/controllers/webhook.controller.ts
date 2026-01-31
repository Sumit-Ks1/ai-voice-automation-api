/**
 * Webhook controller - Handles Ultravox AI callback webhooks
 * Processes AI agent responses and executes business logic
 */

import { Request, Response } from 'express';
import intentService from '../services/intent.service';
import callLogRepository from '../repositories/call-log.repository';
import { getCache, deleteCache } from '../config/redis';
import { createChildLogger } from '../config/logger';
import type { UltravoxCallbackWebhook } from '../types/ultravox.types';

const log = createChildLogger({ controller: 'webhook' });

/**
 * Handle Ultravox AI callback
 * Processes AI agent results and executes appointment operations
 * 
 * Flow:
 * 1. Validate callback data
 * 2. Process intent and execute business logic
 * 3. Update call log with results
 * 4. Return response to Ultravox
 */
export async function handleUltravoxCallback(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const callback = req.validatedBody as UltravoxCallbackWebhook;

    log.info(
      {
        sessionId: callback.sessionId,
        callSid: callback.callSid,
        status: callback.status,
        correlationId: req.correlationId,
      },
      'Ultravox callback received'
    );

    // Retrieve session data from cache
    const sessionData = await getCache<any>(`session:${callback.sessionId}`);

    if (sessionData) {
      log.debug({ sessionData }, 'Session data retrieved from cache');
    }

    // Process callback and execute intent
    const result = await intentService.processCallback(callback);

    log.info(
      {
        sessionId: callback.sessionId,
        intent: result.intent,
        success: result.success,
      },
      'Intent processed'
    );

    // Update call log with intent results
    await callLogRepository.updateIntent(
      callback.callSid,
      result.intent,
      {
        success: result.success,
        message: result.message,
        data: result.data,
        error: result.error,
      }
    );

    // Mark call as completed
    await callLogRepository.markCompleted(callback.callSid, callback.duration);

    // Clean up session cache
    await deleteCache(`session:${callback.sessionId}`);

    const duration = Date.now() - startTime;
    log.info(
      {
        sessionId: callback.sessionId,
        callSid: callback.callSid,
        duration,
      },
      'Callback handled successfully'
    );

    // Return success response with result
    res.status(200).json({
      status: 'success',
      result: {
        intent: result.intent,
        success: result.success,
        message: result.message,
      },
      processingTime: duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(
      {
        err: error,
        sessionId: req.body.sessionId,
        callSid: req.body.callSid,
        duration,
        correlationId: req.correlationId,
      },
      'Failed to handle Ultravox callback'
    );

    // Return error response but don't fail (5xx would cause retries)
    res.status(200).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      processingTime: duration,
    });
  }
}

/**
 * Health check endpoint
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
}
