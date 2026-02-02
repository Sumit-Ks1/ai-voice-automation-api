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
  recordingEnabled?: boolean;
  timeExceededMessage?: string;
  maxDuration?: string;
  inactivityMessages?: Array<{
    duration: string;
    message: string;
  }>;
  // selectedTools - use EITHER toolName OR temporaryTool, not both
  selectedTools?: Array<{
    toolName?: string; // For pre-registered tools
    temporaryTool?: {  // For inline tool definitions - FLAT structure, no "definition" wrapper
      modelToolName: string;
      description: string;
      dynamicParameters?: Array<{
        name: string;
        location: 'PARAMETER_LOCATION_BODY' | 'PARAMETER_LOCATION_QUERY' | 'PARAMETER_LOCATION_PATH';
        schema: Record<string, unknown>;
        required: boolean;
      }>;
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
        // Note: 'initiator' field is NOT valid per Ultravox API - removed
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
   * 
   * Ultravox temporaryTool structure (FLAT - no "definition" wrapper):
   * - modelToolName: string
   * - description: string  
   * - dynamicParameters: array of parameters
   * - http: { baseUrlPattern, httpMethod }
   */
  private buildToolsConfig(): UltravoxCreateCallRequest['selectedTools'] {
    const baseUrl = config.ULTRAVOX_WEBHOOK_URL;
    
    return [
      {
        temporaryTool: {
          modelToolName: 'createAppointment',
          description: 'Book a new appointment for a patient. Call this when a new patient wants to schedule an appointment.',
          dynamicParameters: [
            {
              name: 'full_name',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Patient full name (first and last)' },
              required: true,
            },
            {
              name: 'phone_number',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: '10-digit phone number' },
              required: true,
            },
            {
              name: 'preferred_date',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Preferred date in YYYY-MM-DD format' },
              required: true,
            },
            {
              name: 'preferred_time',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Preferred time in HH:MM 24-hour format' },
              required: true,
            },
            {
              name: 'reason_for_visit',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Reason for the appointment (e.g., cleaning, checkup, tooth pain)' },
              required: false,
            },
          ],
          http: {
            baseUrlPattern: `${baseUrl}/api/v1/webhooks/ultravox/appointment/create`,
            httpMethod: 'POST',
          },
        },
      },
      {
        temporaryTool: {
          modelToolName: 'checkAppointment',
          description: 'Look up existing appointments for a patient by phone number and name.',
          dynamicParameters: [
            {
              name: 'phone_number',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Phone number used for booking' },
              required: true,
            },
            {
              name: 'full_name',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Name for verification' },
              required: true,
            },
          ],
          http: {
            baseUrlPattern: `${baseUrl}/api/v1/webhooks/ultravox/appointment/check`,
            httpMethod: 'POST',
          },
        },
      },
      {
        temporaryTool: {
          modelToolName: 'editAppointment',
          description: 'Modify an existing appointment to change the date or time.',
          dynamicParameters: [
            {
              name: 'phone_number',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Phone number used for booking' },
              required: true,
            },
            {
              name: 'full_name',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Name for verification' },
              required: true,
            },
            {
              name: 'original_date',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Original appointment date in YYYY-MM-DD format' },
              required: true,
            },
            {
              name: 'new_date',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'New date in YYYY-MM-DD format' },
              required: false,
            },
            {
              name: 'new_time',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'New time in HH:MM 24-hour format' },
              required: false,
            },
          ],
          http: {
            baseUrlPattern: `${baseUrl}/api/v1/webhooks/ultravox/appointment/edit`,
            httpMethod: 'POST',
          },
        },
      },
      {
        temporaryTool: {
          modelToolName: 'cancelAppointment',
          description: 'Cancel an existing appointment.',
          dynamicParameters: [
            {
              name: 'phone_number',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Phone number used for booking' },
              required: true,
            },
            {
              name: 'full_name',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Name for verification' },
              required: true,
            },
            {
              name: 'appointment_date',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Date of appointment to cancel in YYYY-MM-DD format' },
              required: true,
            },
            {
              name: 'cancellation_reason',
              location: 'PARAMETER_LOCATION_BODY',
              schema: { type: 'string', description: 'Reason for cancellation' },
              required: false,
            },
          ],
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
   * Includes current date for relative date calculations
   */
  private buildSystemPrompt(): string {
    // Get current date info for the AI to calculate relative dates
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const currentDayName = dayNames[now.getDay()];
    const currentMonthName = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const currentDayOfMonth = now.getDate();

    return `You are Sarah, a friendly and professional AI receptionist for California Dental in San Fernando, California.

=== TODAY'S DATE ===
Today is ${currentDayName}, ${currentMonthName} ${currentDayOfMonth}, ${currentYear}.
Current date in system format: ${currentDate}

=== DATE/TIME CONVERSION - CRITICAL ===
You MUST convert all spoken dates and times to these exact formats before calling any tool:
- Dates: YYYY-MM-DD (e.g., 2026-02-07)
- Times: HH:MM in 24-hour format (e.g., 13:00 for 1 PM)

DATE CONVERSION EXAMPLES (assuming today is ${currentDate}):
- "tomorrow" → calculate tomorrow's date
- "next Saturday" → find the next Saturday from today
- "this Saturday" → the Saturday of this current week
- "next Monday" → the Monday of next week
- "in two weeks" → ask which specific day, then calculate
- "February fifteenth" → ${currentYear}-02-15
- "the twentieth" → ${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-20 (current month)
- "March third" → ${currentYear}-03-03

TIME CONVERSION EXAMPLES:
- "1 PM" or "one o'clock" → 13:00
- "9 AM" or "nine in the morning" → 09:00
- "2:30 PM" or "two thirty" → 14:30
- "noon" → 12:00
- "10 AM" → 10:00
- "4 PM" or "four in the afternoon" → 16:00
- "half past three" → 15:30
- "quarter to two" → 13:45

CALCULATION STEPS:
1. When user says a relative date (next Saturday, tomorrow, etc.), calculate the actual date
2. Convert to YYYY-MM-DD format
3. Convert any spoken time to HH:MM 24-hour format
4. Verify the date falls on a business day (Mon-Thu, Sat)
5. Verify the time is within business hours for that day

=== IDENTITY ===
You are Sarah, a friendly AI receptionist for California Dental.

=== BUSINESS HOURS (Pacific Time) ===
- Monday: 9 AM - 6 PM (09:00 - 18:00)
- Tuesday: 9 AM - 7 PM (09:00 - 19:00)
- Wednesday: 9 AM - 6 PM (09:00 - 18:00)
- Thursday: 9 AM - 7 PM (09:00 - 19:00)
- Friday: CLOSED
- Saturday: 9 AM - 2 PM (09:00 - 14:00)
- Sunday: CLOSED

=== CRITICAL RULES ===
1. You ONLY help NEW patients book appointments
2. EXISTING patients must be transferred immediately (use transferCall)
3. Before booking, always ask: "Have you visited California Dental before?"

=== CALL FLOW ===

GREETING:
"Thank you for calling California Dental, this is Sarah. How may I help you today?"

IF NEW PATIENT - Collect one at a time:
1. Full name (first and last)
2. Phone number (10 digits, read it back to confirm)
3. Reason for visit
4. Preferred date → CONVERT to YYYY-MM-DD
5. Preferred time → CONVERT to HH:MM 24-hour

CONFIRMATION (do this ONCE before calling createAppointment):
"Let me confirm: [Name], phone [digits], for [reason], on [spoken date] at [spoken time]. Is that correct?"

After caller confirms "yes", call createAppointment with CONVERTED formats:
- preferred_date: "YYYY-MM-DD" (e.g., "2026-02-07")
- preferred_time: "HH:MM" (e.g., "13:00")

=== STYLE ===
- Warm, conversational, professional
- Speak naturally ("nine AM" not "09:00")
- One question at a time
- Be patient with nervous callers

=== WHEN TO TRANSFER ===
Use transferCall tool for:
- Existing patients (reason: "existing_patient")
- Insurance questions (reason: "insurance_question")
- Billing questions (reason: "billing_question")
- Emergencies or complex requests (reason: "complex_request")
- Caller requests human (reason: "caller_request")

=== IMPORTANT REMINDERS ===
- If a date falls on Friday or Sunday, suggest the next available day
- Saturday appointments must be before 2 PM (14:00)
- Always convert natural language to proper format BEFORE calling tools
- Phone numbers: 10 digits only, no dashes or spaces (e.g., "8185551234")`;
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
