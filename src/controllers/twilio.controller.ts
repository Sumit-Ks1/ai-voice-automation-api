/**
 * Twilio controller - Handles Twilio webhook requests
 * Processes inbound calls and call status updates
 */

import { Request, Response } from 'express';
import ultravoxService from '../services/ultravox.service';
import userService from '../services/user.service';
import callLogRepository from '../repositories/call-log.repository';
import { setCache } from '../config/redis';
import { createChildLogger } from '../config/logger';
import { buildStreamResponse, buildErrorResponse } from '../utils/twiml.builder';
import { extractCallerInfo } from '../services/twilio.service';
import type { TwilioInboundCallWebhook } from '../types/twilio.types';

const log = createChildLogger({ controller: 'twilio' });

/**
 * Handle inbound call from Twilio
 * Main entry point for voice calls
 * 
 * Flow:
 * 1. Validate and extract call information
 * 2. Verify/create user
 * 3. Create call log
 * 4. Start Ultravox AI session
 * 5. Return TwiML with WebSocket stream URL
 */
export async function handleInboundCall(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    const callData = req.body as TwilioInboundCallWebhook;
    const callerInfo = extractCallerInfo(callData);

    log.info(
      {
        callSid: callerInfo.callSid,
        from: callerInfo.from,
        correlationId: req.correlationId,
      },
      'Inbound call received'
    );

    // Verify or create user
    const user = await userService.verifyUser(callerInfo.from);

    // Create call log for tracking
    await callLogRepository.create({
      call_sid: callerInfo.callSid,
      user_id: user.id,
      from_number: callerInfo.from,
      to_number: callerInfo.to,
      direction: 'inbound',
      status: 'initiated',
    });

    // Start Ultravox AI session
    const ultravoxSession = await ultravoxService.startSession(
      callerInfo.callSid,
      callerInfo.from,
      {
        userName: user.name,
        callerCity: callerInfo.fromCity,
        callerState: callerInfo.fromState,
      }
    );

    // Cache session data for callback lookup
    await setCache(
      `session:${ultravoxSession.sessionId}`,
      {
        callSid: callerInfo.callSid,
        userId: user.id,
        phoneNumber: callerInfo.from,
      },
      3600 // 1 hour TTL
    );

    // Update call log with session ID
    await callLogRepository.update(callerInfo.callSid, {
      session_id: ultravoxSession.sessionId,
      status: 'connected',
    });

    // Build and return TwiML response with WebSocket stream
    const twiml = buildStreamResponse(ultravoxSession.streamUrl, callerInfo.callSid);

    const duration = Date.now() - startTime;
    log.info(
      {
        callSid: callerInfo.callSid,
        sessionId: ultravoxSession.sessionId,
        duration,
      },
      'Inbound call handled successfully'
    );

    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error(
      {
        err: error,
        callSid: req.body.CallSid,
        duration,
        correlationId: req.correlationId,
      },
      'Failed to handle inbound call'
    );

    // Return error TwiML
    const errorTwiml = buildErrorResponse();
    res.type('text/xml');
    res.send(errorTwiml);

    // Update call log if possible
    if (req.body.CallSid) {
      await callLogRepository.markFailed(
        req.body.CallSid,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

/**
 * Handle call status updates from Twilio
 * Tracks call lifecycle events
 */
export async function handleCallStatus(req: Request, res: Response): Promise<void> {
  try {
    const { CallSid, CallStatus, CallDuration, ErrorCode, ErrorMessage } = req.body;

    log.info(
      {
        callSid: CallSid,
        status: CallStatus,
        correlationId: req.correlationId,
      },
      'Call status update received'
    );

    // Update call log based on status
    if (CallStatus === 'completed') {
      await callLogRepository.markCompleted(CallSid, parseInt(CallDuration, 10));
    } else if (CallStatus === 'failed') {
      await callLogRepository.markFailed(CallSid, ErrorMessage || `Error code: ${ErrorCode}`);
    } else {
      await callLogRepository.update(CallSid, { status: CallStatus });
    }

    res.status(200).send('OK');
  } catch (error) {
    log.error(
      {
        err: error,
        callSid: req.body.CallSid,
        correlationId: req.correlationId,
      },
      'Failed to handle call status'
    );

    // Don't fail the response - Twilio will retry
    res.status(200).send('OK');
  }
}
