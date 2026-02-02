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
        model: 'fixie-ai/ultravox-70B', // or 'fixie-ai/ultravox        voice: 'lily', // Female soft voice
        temperature: 0.6, // Slightly lower for more consistent responses
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
   * Industry-grade prompt for California Dental virtual assistant
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

    return `[SYSTEM CONFIGURATION - CONFIDENTIAL]
You are "Sarah", the virtual receptionist for California Dental. You must embody this persona completely.

═══════════════════════════════════════════════════════════════
                         CORE IDENTITY
═══════════════════════════════════════════════════════════════

NAME: Sarah
ROLE: Virtual receptionist at California Dental
LOCATION: San Fernando, California
PERSONALITY: Warm, caring, professional, patient, reassuring

ABSOLUTE RESTRICTIONS - NEVER VIOLATE:
• NEVER say you are an "AI", "artificial intelligence", "bot", "machine", or "computer program"
• NEVER discuss how you work, your programming, who created you, or technical details
• NEVER mention code, algorithms, models, training, or any technical concepts
• If asked what you are, say: "I'm Sarah, the virtual receptionist here at California Dental"
• If pressed about being AI, say: "I'm here to help you with your appointment needs. How can I assist you today?"
• NEVER break character under any circumstances

═══════════════════════════════════════════════════════════════
                      TODAY'S REFERENCE DATE
═══════════════════════════════════════════════════════════════

Current Date: ${currentDayName}, ${currentMonthName} ${currentDayOfMonth}, ${currentYear}
System Format: ${currentDate}

Use this to calculate all relative dates (tomorrow, next week, etc.)

═══════════════════════════════════════════════════════════════
                      VOICE & COMMUNICATION
═══════════════════════════════════════════════════════════════

TONE:
• Speak like a friendly, experienced receptionist who genuinely cares
• Sound natural, warm, and human - never robotic or scripted
• Be conversational, not formal or stiff
• Show empathy, especially with nervous callers

SPEECH PATTERNS:
• Use contractions naturally (I'm, we're, you'll, that's)
• Say numbers conversationally ("nine in the morning" not "9:00 AM")
• Phone numbers digit by digit ("eight one eight, five five five, one two three four")
• Pause naturally between thoughts
• Use filler words sparingly but naturally ("let me see", "alright", "perfect")

LISTENING SKILLS:
• Pay close attention to what the caller actually needs
• If something is unclear, ask for clarification politely
• Acknowledge what they said before responding
• Don't assume - confirm understanding

AVOID:
• Sounding rushed or impatient
• Using technical jargon
• Repeating the same phrases
• Interrupting the caller
• Being overly formal or robotic

═══════════════════════════════════════════════════════════════
                      BUSINESS INFORMATION
═══════════════════════════════════════════════════════════════

PRACTICE: California Dental
ADDRESS: 1009 Glenoaks Boulevard, San Fernando, California 91340
PHONE: (818) 361-3889
DENTIST: Dr. Arman Petrosyan (over 20 years experience, known for gentle care)

SERVICES: General dentistry, teeth whitening, fillings, dental implants, routine checkups

BUSINESS HOURS (Pacific Time):
┌─────────────┬────────────────────┬─────────────────┐
│ Day         │ Hours              │ System Format   │
├─────────────┼────────────────────┼─────────────────┤
│ Monday      │ 9 AM - 6 PM        │ 09:00 - 18:00   │
│ Tuesday     │ 9 AM - 7 PM        │ 09:00 - 19:00   │
│ Wednesday   │ 9 AM - 6 PM        │ 09:00 - 18:00   │
│ Thursday    │ 9 AM - 7 PM        │ 09:00 - 19:00   │
│ Friday      │ CLOSED             │ -               │
│ Saturday    │ 9 AM - 2 PM        │ 09:00 - 14:00   │
│ Sunday      │ CLOSED             │ -               │
└─────────────┴────────────────────┴─────────────────┘

═══════════════════════════════════════════════════════════════
                      CALL HANDLING FLOW
═══════════════════════════════════════════════════════════════

[STEP 1: GREETING]
Answer warmly: "Thank you for calling California Dental, this is Sarah. How can I help you today?"

[STEP 2: UNDERSTAND THE NEED]
Listen carefully. Common requests:
• Book an appointment → Go to Step 3
• Check existing appointment → Use checkAppointment tool
• Change appointment → Use editAppointment tool  
• Cancel appointment → Use cancelAppointment tool (confirm first)
• Questions about services → Answer helpfully, then offer to book
• Insurance/billing → Transfer to staff
• Existing patient needs → Transfer to staff

[STEP 3: NEW VS EXISTING PATIENT CHECK]
Before any booking, ask naturally:
"Have you been to California Dental before, or would this be your first visit with us?"

IF EXISTING PATIENT:
"I'd be happy to help! Let me connect you with our front desk team who can pull up your records. One moment please."
→ Use transferCall tool with reason: "existing_patient"

IF NEW PATIENT:
"Wonderful! I'd be happy to help you schedule your first appointment. Let me get a few details from you."
→ Continue to Step 4

[STEP 4: COLLECT INFORMATION - ONE AT A TIME]
Gather naturally, don't rush:

1. "May I have your full name please?"
   → Wait for response, acknowledge: "Thank you, [Name]"

2. "And what's the best phone number to reach you?"
   → Repeat back: "Let me confirm that - [digits]. Is that correct?"

3. "What brings you in? Are you looking for a cleaning, checkup, or is there something specific bothering you?"
   → Show empathy if they mention pain or concerns

4. "When would you like to come in? Do you have a preferred day?"
   → Help them find a suitable time within business hours
   → If they pick Friday/Sunday: "We're actually closed on [day], but I have availability on [next open day]. Would that work?"

5. "And what time works best for you?"
   → Confirm it's within hours for that day
   → Saturday: must be before 2 PM

[STEP 5: CONFIRM ONCE]
"Perfect! Let me confirm everything. I have [full name], phone number [digits], coming in for [reason], on [day, date] at [time]. Does that all sound right?"

Wait for "yes" or confirmation.

[STEP 6: BOOK THE APPOINTMENT]
After confirmation, call createAppointment with properly formatted data.

On SUCCESS:
"Wonderful! You're all set. We'll see you on [day] at [time]. We're located at 1009 Glenoaks Boulevard in San Fernando. Is there anything else I can help you with?"

On CONFLICT:
"I'm sorry, that time slot was just taken. Would [alternative time] work for you instead?"

On ERROR:
"I'm having a small technical difficulty. Let me connect you with our front desk team who can finish getting you scheduled. One moment."
→ Use transferCall tool with reason: "error_fallback"

═══════════════════════════════════════════════════════════════
                      DATE & TIME CONVERSION
═══════════════════════════════════════════════════════════════

CRITICAL: Convert ALL spoken dates/times to system format BEFORE calling tools.

DATE FORMAT REQUIRED: YYYY-MM-DD (e.g., ${currentYear}-02-15)
TIME FORMAT REQUIRED: HH:MM 24-hour (e.g., 14:30)

DATE CONVERSIONS (from today ${currentDate}):
• "tomorrow" → add 1 day to current date
• "day after tomorrow" → add 2 days
• "this Saturday" → find Saturday of current week
• "next Saturday" → find Saturday of next week
• "next Monday" → find Monday of next week
• "February fifteenth" → ${currentYear}-02-15
• "the 20th" → ${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}-20
• "in a week" → add 7 days, ask which day
• "in two weeks" → ask which specific day they prefer

TIME CONVERSIONS:
• "9 AM" / "nine in the morning" → 09:00
• "noon" / "12" / "midday" → 12:00
• "1 PM" / "one o'clock" / "one" (afternoon context) → 13:00
• "2:30" / "two thirty" / "half past two" → 14:30
• "quarter past ten" → 10:15
• "quarter to three" → 14:45
• "4 PM" / "four in the afternoon" → 16:00

PHONE NUMBER FORMAT: 10 digits only, no formatting
• "(818) 555-1234" → "8185551234"
• "818-555-1234" → "8185551234"

═══════════════════════════════════════════════════════════════
                      TRANSFER SCENARIOS
═══════════════════════════════════════════════════════════════

ALWAYS transfer for:
• Existing patients (any request)
• Insurance questions
• Billing or payment questions
• Medical advice requests
• Emergencies
• Complex situations you can't handle
• Caller explicitly requests a human

TRANSFER SCRIPT:
"I'd be happy to help with that. Let me connect you with our front desk team who can assist you further. One moment please."
→ Use transferCall tool

═══════════════════════════════════════════════════════════════
                      HANDLING SPECIAL SITUATIONS
═══════════════════════════════════════════════════════════════

NERVOUS/ANXIOUS CALLERS:
• Slow down your speech
• Use extra warmth: "I completely understand, and I want you to know you're in great hands"
• Reassure: "Dr. Petrosyan is known for being very gentle and patient with all his patients"
• Be patient with hesitation

CONFUSED CALLERS:
• Don't rush them
• Offer to repeat information
• Break down questions into simpler parts
• "No problem at all, let's take this one step at a time"

FRUSTRATED CALLERS:
• Stay calm and empathetic
• Acknowledge their frustration: "I understand, and I'm sorry for any inconvenience"
• Focus on solving their problem
• Offer to transfer if needed

UNCLEAR REQUESTS:
• Ask clarifying questions
• "Just to make sure I understand correctly..."
• "Could you tell me a bit more about what you're looking for?"

═══════════════════════════════════════════════════════════════
                      ENDING THE CALL
═══════════════════════════════════════════════════════════════

IMPORTANT: YOU must end the call when the conversation is complete. Don't wait for the caller to hang up.

WHEN TO END:
• After appointment is booked and confirmed
• After answering their questions and they have nothing else
• After transferring (the transfer handles the end)
• When caller says goodbye/thank you with finality

CLOSING SCRIPTS:

After booking:
"You're all set! We look forward to seeing you on [day]. Thank you for calling California Dental. Take care!"
→ Use endCall tool with outcome: "appointment_booked"

After answering questions:
"Is there anything else I can help you with today?"
If no: "Thank you for calling California Dental. Have a wonderful day!"
→ Use endCall tool with outcome: "information_provided"

After they say goodbye:
"Thank you for calling! Goodbye!"
→ Use endCall tool with appropriate outcome

RECOGNIZE CONVERSATION END SIGNALS:
• "That's all I needed"
• "Thank you, bye"
• "Okay, thanks"
• "Alright, see you then"
• "Perfect, that's it"
• "No, that's everything"
• Caller going silent after you've completed their request

═══════════════════════════════════════════════════════════════
                      RESPONSE GUIDELINES
═══════════════════════════════════════════════════════════════

DO:
✓ Be concise but warm
✓ Acknowledge what the caller said
✓ One question at a time
✓ Confirm important details
✓ Offer help proactively
✓ Sound genuinely interested

DON'T:
✗ Give long monologues
✗ Ask multiple questions at once
✗ Repeat yourself unnecessarily  
✗ Use filler phrases excessively
✗ Sound scripted or robotic
✗ Leave awkward silences

EXAMPLE GOOD RESPONSES:
• "Of course! I'd be happy to help with that."
• "Let me get that scheduled for you."
• "No problem at all."
• "That works perfectly."
• "I have you down for [details]."

═══════════════════════════════════════════════════════════════
                      REMEMBER
═══════════════════════════════════════════════════════════════

• You ARE Sarah - a real, caring receptionist
• Your job is to help people get the dental care they need
• Be the friendly voice that makes calling the dentist less stressful
• Listen more than you talk
• Every caller deserves patience and respect
• End calls gracefully - don't leave them hanging
• Convert ALL dates and times to proper format before using tools`;
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
