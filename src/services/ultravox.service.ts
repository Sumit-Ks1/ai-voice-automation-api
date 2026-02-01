/**
 * Ultravox.ai service for AI voice agent integration
 * Handles session creation and management with Ultravox API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/env';
import { createChildLogger } from '../config/logger';
import { ExternalServiceError } from '../utils/errors';
import type {
  UltravoxStartSessionRequest,
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
    this.client = axios.create({
      baseURL: config.ULTRAVOX_API_URL,
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.ULTRAVOX_API_KEY}`,
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
   * Start new AI voice agent session
   * Creates a WebSocket stream URL for Twilio to connect to
   * Handles anonymous callers (null phone number)
   * 
   * @param callSid - Twilio Call SID
   * @param phoneNumber - Caller's phone number (null for anonymous)
   * @param metadata - Additional metadata
   */
  async startSession(
    callSid: string,
    phoneNumber: string | null,
    metadata?: Record<string, any>
  ): Promise<UltravoxStartSessionResponse> {
    const startTime = Date.now();

    try {
      const payload: UltravoxStartSessionRequest = {
        agentId: config.ULTRAVOX_AGENT_ID,
        metadata: {
          callSid,
          phoneNumber: phoneNumber || 'anonymous',
          direction: 'inbound',
          timestamp: new Date().toISOString(),
          isAnonymous: !phoneNumber,
          ...metadata,
        },
        // Optional: customize AI behavior per call
        systemPrompt: this.buildSystemPrompt(),
        temperature: 0.7,
        maxTokens: 500,
      };

      this.log.info({ callSid, phoneNumber: phoneNumber || 'anonymous' }, 'Starting Ultravox session');

      const response = await this.client.post<UltravoxStartSessionResponse>(
        '/sessions/start',
        payload
      );

      const duration = Date.now() - startTime;
      this.log.info(
        {
          sessionId: response.data.sessionId,
          callSid,
          duration,
        },
        'Ultravox session started successfully'
      );

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log.error(
        { err: error, callSid, duration },
        'Failed to start Ultravox session'
      );

      throw new ExternalServiceError(
        'Ultravox',
        'Failed to start AI voice session',
        { callSid }
      );
    }
  }

  /**
   * Get session details
   * @param sessionId - Ultravox session ID
   */
  async getSession(sessionId: string): Promise<UltravoxSession> {
    try {
      this.log.debug({ sessionId }, 'Fetching Ultravox session');

      const response = await this.client.get<UltravoxSession>(
        `/sessions/${sessionId}`
      );

      return response.data;
    } catch (error) {
      this.log.error({ err: error, sessionId }, 'Failed to fetch Ultravox session');

      throw new ExternalServiceError(
        'Ultravox',
        'Failed to fetch session details',
        { sessionId }
      );
    }
  }

  /**
   * End active session
   * @param sessionId - Ultravox session ID
   */
  async endSession(sessionId: string): Promise<void> {
    try {
      this.log.info({ sessionId }, 'Ending Ultravox session');

      await this.client.post(`/sessions/${sessionId}/end`);

      this.log.info({ sessionId }, 'Ultravox session ended');
    } catch (error) {
      this.log.error({ err: error, sessionId }, 'Failed to end Ultravox session');
      // Don't throw - session ending is best effort
    }
  }

  /**
   * Build system prompt for AI agent
   * Customize based on business requirements
   */
  private buildSystemPrompt(): string {
    return `You are a friendly and professional medical appointment assistant.

Your responsibilities:
1. Greet the caller warmly
2. Identify their intent (book, modify, cancel, or check appointment)
3. Collect required information:
   - Patient full name
   - Phone number (verify if it matches caller ID)
   - Preferred date and time
   - Reason for visit (if booking)
   - Existing appointment ID (if modifying/canceling)

Guidelines:
- Be conversational and empathetic
- Confirm details before finalizing
- Handle business hours (${config.BUSINESS_HOURS_START} - ${config.BUSINESS_HOURS_END} ${config.BUSINESS_TIMEZONE})
- Clarify ambiguous requests
- Keep responses concise
- If you cannot help, offer to transfer to a human

Output format: Provide structured JSON with intent and extracted parameters.`;
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
