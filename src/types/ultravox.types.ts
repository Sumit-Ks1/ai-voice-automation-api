/**
 * TypeScript type definitions for Ultravox.ai API
 * Customize based on actual Ultravox API documentation
 */

export interface UltravoxStartSessionRequest {
  agentId: string;
  metadata?: {
    callSid?: string;
    phoneNumber?: string;
    direction?: string;
    [key: string]: any;
  };
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface UltravoxStartSessionResponse {
  sessionId: string;
  streamUrl: string;
  status: 'created' | 'active' | 'failed';
  expiresAt: string;
  metadata?: Record<string, any>;
}

export interface UltravoxCallbackWebhook {
  sessionId: string;
  callSid: string;
  status: 'completed' | 'failed' | 'timeout';
  duration: number;
  transcript?: string;
  intent?: {
    name: string;
    confidence: number;
    parameters?: Record<string, any>;
  };
  extractedData?: {
    appointmentType?: 'create' | 'edit' | 'cancel' | 'status';
    appointmentDate?: string;
    appointmentTime?: string;
    patientName?: string;
    patientPhone?: string;
    reason?: string;
    existingAppointmentId?: string;
    [key: string]: any;
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface UltravoxSession {
  sessionId: string;
  agentId: string;
  status: 'active' | 'completed' | 'failed';
  createdAt: string;
  endedAt?: string;
  metadata?: Record<string, any>;
}

/**
 * Structured intent types that AI can recognize
 */
export type IntentType = 'create_appointment' | 'edit_appointment' | 'cancel_appointment' | 'check_status' | 'unknown';

export interface ParsedIntent {
  type: IntentType;
  confidence: number;
  parameters: {
    date?: string;
    time?: string;
    patientName?: string;
    patientPhone?: string;
    reason?: string;
    appointmentId?: string;
    [key: string]: any;
  };
}
