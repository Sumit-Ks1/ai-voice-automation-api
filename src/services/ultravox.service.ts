/**
 * Ultravox.ai service for AI voice agent integration
 * Handles session creation and management with Ultravox API
 * 
 * Ultravox API Documentation: https://docs.ultravox.ai
 * Correct endpoint: POST /api/calls
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/env';
import { createChildLogger } from '../config/logger';
import { ExternalServiceError } from '../utils/errors';

// Ultravox API types based on actual API
interface UltravoxCreateCallRequest {
  systemPrompt?: string;
  model?: string;
  voice?: string;
  temperature?: number;
  firstSpeaker?: 'FIRST_SPEAKER_USER' | 'FIRST_SPEAKER_AGENT';
  medium?: {
    twilio?: Record<string, unknown>;
    webRtc?: Record<string, unknown>;
  };
  initiator?: 'INITIATOR_USER' | 'INITIATOR_AGENT';
  recordingEnabled?: boolean;
  timeExceededMessage?: string;
  maxDuration?: string;
  inactivityMessages?: Array<{
    duration: string;
    message: string;
  }>;
  selectedTools?: Array<{
    toolName: string;
    temporaryTool?: {
      modelToolName: string;
      definition: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
      };
      http?: {
        baseUrlPattern: string;
        httpMethod: string;
      };
    };
  }>;
}

interface UltravoxCreateCallResponse {
  callId: string;
  created: string;
  ended?: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  voice: string;
  languageHint?: string;
  joinUrl: string; // This is the WebSocket URL for Twilio <Stream>
  transcript?: string;
  recordingEnabled: boolean;
  maxDuration: string;
}

// Keep the old types for backward compatibility
import type {
  UltravoxStartSessionResponse,
  UltravoxSession,
} from '../types/ultravox.types';

/**
 * Ultravox API client singleton
 */
class UltravoxService {
  private client: AxiosInstance;
  private log = createChildLogger({ service: 'ultravox' });

  constructor() {
    // Ensure base URL doesn't include agent ID - it should just be https://api.ultravox.ai
    let baseUrl = config.ULTRAVOX_API_URL;
    
    // Fix common misconfiguration: remove agent ID from URL if present
    if (baseUrl.includes(config.ULTRAVOX_AGENT_ID)) {
      baseUrl = baseUrl.replace(`/${config.ULTRAVOX_AGENT_ID}`, '');
      this.log.warn({ originalUrl: config.ULTRAVOX_API_URL, fixedUrl: baseUrl }, 
        'Fixed ULTRAVOX_API_URL - removed agent ID from base URL');
    }
    
    // Ensure no trailing slash
    baseUrl = baseUrl.replace(/\/$/, '');
    
    this.log.info({ baseUrl, agentId: config.ULTRAVOX_AGENT_ID }, 'Initializing Ultravox client');

    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 15000, // 15 second timeout
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.ULTRAVOX_API_KEY, // Ultravox uses X-API-Key header
        'User-Agent': 'ai-voice-automation/1.0.0',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        this.log.debug({ method: config.method, url: config.url }, 'Ultravox API request');
        return config;
      },
      (error) => {
        this.log.error({ err: error }, 'Ultravox API request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        this.log.debug(
          { status: response.status, url: response.config.url },
          'Ultravox API response'
        );
        return response;
      },
      (error: AxiosError) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Start new AI voice agent session (creates a call)
   * Creates a WebSocket stream URL for Twilio to connect to
   * 
   * Ultravox API: POST /api/calls
   * 
   * @param callSid - Twilio Call SID
   * @param phoneNumber - Caller's phone number (null for anonymous)
   * @param metadata - Additional metadata
   */
  async startSession(
    callSid: string,
    phoneNumber: string | null,
    _metadata?: Record<string, any>
  ): Promise<UltravoxStartSessionResponse> {
    const startTime = Date.now();

    try {
      // Build request payload for Ultravox /api/calls endpoint
      const payload: UltravoxCreateCallRequest = {
        systemPrompt: this.buildSystemPrompt(),
        model: 'fixie-ai/ultravox-70B', // or 'fixie-ai/ultravox'
        voice: 'terrence', // Default voice, can be configured
        temperature: 0.7,
        firstSpeaker: 'FIRST_SPEAKER_AGENT',
        initiator: 'INITIATOR_USER', // Inbound call
        recordingEnabled: false,
        maxDuration: '600s', // 10 minutes max
        // Twilio medium configuration
        medium: {
          twilio: {}
        },
        // Configure tools for appointment management
        selectedTools: this.buildToolsConfig(),
      };

      this.log.info({ 
        callSid, 
        phoneNumber: phoneNumber || 'anonymous',
        apiUrl: `${this.client.defaults.baseURL}/api/calls`
      }, 'Starting Ultravox call');

      const response = await this.client.post<UltravoxCreateCallResponse>(
        '/api/calls',
        payload
      );

      const duration = Date.now() - startTime;
      this.log.info(
        {
          callId: response.data.callId,
          joinUrl: response.data.joinUrl,
          callSid,
          duration,
        },
        'Ultravox call created successfully'
      );

      // Map to our response format
      return {
        sessionId: response.data.callId,
        streamUrl: response.data.joinUrl, // This is the WebSocket URL for Twilio
        status: 'created',
        expiresAt: response.data.ended || new Date(Date.now() + 600000).toISOString(),
        metadata: {
          callSid,
          phoneNumber,
          model: response.data.model,
          voice: response.data.voice,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error(
        { err: error, callSid, duration },
        'Failed to start Ultravox call'
      );

      throw new ExternalServiceError(
        'Ultravox',
        'Failed to start AI voice session',
        { callSid }
      );
    }
  }

  /**
   * Build tools configuration for Ultravox
   * These tools call back to our webhook endpoints
   */
  private buildToolsConfig(): UltravoxCreateCallRequest['selectedTools'] {
    const baseUrl = config.ULTRAVOX_WEBHOOK_URL;
    
    return [
      {
        toolName: 'createAppointment',
        temporaryTool: {
          modelToolName: 'createAppointment',
          definition: {
            name: 'createAppointment',
            description: 'Book a new appointment for a patient',
            parameters: {
              type: 'object',
              properties: {
                full_name: { type: 'string', description: 'Patient full name' },
                phone_number: { type: 'string', description: '10-digit phone number' },
                preferred_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                preferred_time: { type: 'string', description: 'Time in HH:MM 24-hour format' },
                reason_for_visit: { type: 'string', description: 'Reason for appointment' },
              },
              required: ['full_name', 'phone_number', 'preferred_date', 'preferred_time'],
            },
          },
          http: {
            baseUrlPattern: `${baseUrl}/api/v1/webhooks/ultravox/appointment/create`,
            httpMethod: 'POST',
          },
        },
      },
      {
        toolName: 'checkAppointment',
        temporaryTool: {
          modelToolName: 'checkAppointment',
          definition: {
            name: 'checkAppointment',
            description: 'Look up existing appointments',
            parameters: {
              type: 'object',
              properties: {
                phone_number: { type: 'string', description: 'Phone number used for booking' },
                full_name: { type: 'string', description: 'Name for verification' },
              },
              required: ['phone_number', 'full_name'],
            },
          },
          http: {
            baseUrlPattern: `${baseUrl}/api/v1/webhooks/ultravox/appointment/check`,
            httpMethod: 'POST',
          },
        },
      },
      {
        toolName: 'editAppointment',
        temporaryTool: {
          modelToolName: 'editAppointment',
          definition: {
            name: 'editAppointment',
            description: 'Modify an existing appointment date or time',
            parameters: {
              type: 'object',
              properties: {
                phone_number: { type: 'string', description: 'Phone number used for booking' },
                full_name: { type: 'string', description: 'Name for verification' },
                original_date: { type: 'string', description: 'Original appointment date' },
                new_date: { type: 'string', description: 'New date (optional)' },
                new_time: { type: 'string', description: 'New time (optional)' },
              },
              required: ['phone_number', 'full_name', 'original_date'],
            },
          },
          http: {
            baseUrlPattern: `${baseUrl}/api/v1/webhooks/ultravox/appointment/edit`,
            httpMethod: 'POST',
          },
        },
      },
      {
        toolName: 'cancelAppointment',
        temporaryTool: {
          modelToolName: 'cancelAppointment',
          definition: {
            name: 'cancelAppointment',
            description: 'Cancel an existing appointment',
            parameters: {
              type: 'object',
              properties: {
                phone_number: { type: 'string', description: 'Phone number used for booking' },
                full_name: { type: 'string', description: 'Name for verification' },
                appointment_date: { type: 'string', description: 'Date of appointment to cancel' },
                cancellation_reason: { type: 'string', description: 'Reason for cancellation' },
              },
              required: ['phone_number', 'full_name', 'appointment_date'],
            },
          },
          http: {
            baseUrlPattern: `${baseUrl}/api/v1/webhooks/ultravox/appointment/cancel`,
            httpMethod: 'POST',
          },
        },
      },
    ];
  }

  /**
   * Get session/call details
   * @param sessionId - Ultravox call ID
   */
  async getSession(sessionId: string): Promise<UltravoxSession> {
    try {
      this.log.debug({ sessionId }, 'Fetching Ultravox call');

      const response = await this.client.get<UltravoxCreateCallResponse>(
        `/api/calls/${sessionId}`
      );

      return {
        sessionId: response.data.callId,
        agentId: config.ULTRAVOX_AGENT_ID,
        status: response.data.ended ? 'completed' : 'active',
        createdAt: response.data.created,
        endedAt: response.data.ended,
        metadata: {
          model: response.data.model,
          voice: response.data.voice,
        },
      };
    } catch (error) {
      this.log.error({ err: error, sessionId }, 'Failed to fetch Ultravox call');

      throw new ExternalServiceError(
        'Ultravox',
        'Failed to fetch session details',
        { sessionId }
      );
    }
  }

  /**
   * End active session/call
   * @param sessionId - Ultravox call ID
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      this.log.info({ sessionId }, 'Ending Ultravox call');

      await this.client.delete(`/api/calls/${sessionId}`);

      this.log.info({ sessionId }, 'Ultravox call ended');
    } catch (error) {
      this.log.error({ err: error, sessionId }, 'Failed to end Ultravox call');
      // Don't throw - session ending is best effort
    }
  }

  /**
   * Build system prompt for AI agent
   * Customize based on California Dental business requirements
   */
  private buildSystemPrompt(): string {
    return `You are Sarah, a friendly and professional AI receptionist for California Dental.

CRITICAL RULES:
- You ONLY help NEW patients book appointments
- EXISTING patients must be transferred to staff (use transfer reason: "existing_patient")
- When caller says they're an existing patient or have been here before, IMMEDIATELY transfer

GREETING:
"Thank you for calling California Dental, this is Sarah. Are you a new patient looking to schedule an appointment, or an existing patient?"

IF NEW PATIENT - Collect in order:
1. Full name (first and last)
2. Phone number (10 digits, read back to confirm)
3. Reason for visit (cleaning, checkup, tooth pain, etc.)
4. Preferred date and time

BUSINESS HOURS (Pacific Time):
- Monday: 9 AM - 6 PM
- Tuesday: 9 AM - 7 PM  
- Wednesday: 9 AM - 6 PM
- Thursday: 9 AM - 7 PM
- Friday: CLOSED
- Saturday: 9 AM - 2 PM
- Sunday: CLOSED

STYLE:
- Warm, conversational, professional
- Confirm details before booking
- Keep responses brief
- One question at a time

WHEN TO TRANSFER:
- Existing patients
- Insurance questions
- Billing questions
- Emergencies
- Complex requests
- Caller requests human`;
  }

  /**
   * Handle Ultravox API errors
   */
  private handleApiError(error: AxiosError): void {
    if (error.response) {
      // Server responded with error status
      this.log.error(
        {
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url,
        },
        'Ultravox API error response'
      );
    } else if (error.request) {
      // No response received
      this.log.error(
        { url: error.config?.url },
        'Ultravox API no response (timeout or network error)'
      );
    } else {
      // Request setup error
      this.log.error({ err: error }, 'Ultravox API request setup error');
    }
  }
}

// Export singleton instance
export default new UltravoxService();
