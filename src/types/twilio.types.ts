/**
 * TypeScript type definitions for Twilio webhook payloads
 * Based on Twilio Voice API documentation
 */

export interface TwilioInboundCallWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
  ApiVersion: string;
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  ForwardedFrom?: string;
  CallerName?: string;
  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;
  StirVerstat?: string;
}

export interface TwilioCallStatusWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'canceled';
  ApiVersion: string;
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  Timestamp: string;
  CallDuration?: string;
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface TwilioGatherWebhook {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  Digits?: string;
  SpeechResult?: string;
  Confidence?: string;
}

export interface TwilioRecordingWebhook {
  CallSid: string;
  AccountSid: string;
  RecordingSid: string;
  RecordingUrl: string;
  RecordingStatus: 'completed' | 'failed' | 'absent';
  RecordingDuration: string;
  RecordingChannels: string;
  RecordingSource: string;
}

/**
 * Twilio webhook signature validation
 */
export interface TwilioWebhookValidation {
  signature: string;
  url: string;
  params: Record<string, any>;
}
