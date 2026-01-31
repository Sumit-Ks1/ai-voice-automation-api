/**
 * Intent service - AI callback processing and intent routing
 * Handles Ultravox callback webhooks and routes to appropriate handlers
 */

import appointmentService from './appointment.service';
import { createChildLogger } from '../config/logger';
import { ValidationError } from '../utils/errors';
import { normalizeDateString } from '../utils/date.utils';
import { normalizePhoneNumber } from '../utils/phone.utils';
import type { UltravoxCallbackWebhook, ParsedIntent } from '../types/ultravox.types';

/**
 * Result of intent processing
 */
export interface IntentResult {
  success: boolean;
  intent: string;
  message: string;
  data?: any;
  error?: string;
}

class IntentService {
  private log = createChildLogger({ service: 'intent' });

  /**
   * Process Ultravox callback and route to appropriate handler
   * @param callback - Ultravox callback webhook data
   */
  async processCallback(callback: UltravoxCallbackWebhook): Promise<IntentResult> {
    try {
      this.log.info(
        { sessionId: callback.sessionId, callSid: callback.callSid },
        'Processing Ultravox callback'
      );

      // Handle error status
      if (callback.status === 'failed' || callback.status === 'timeout') {
        return this.handleFailedCallback(callback);
      }

      // Extract and normalize intent
      const intent = this.parseIntent(callback);

      this.log.info(
        { intent: intent.type, confidence: intent.confidence },
        'Intent parsed'
      );

      // Route to appropriate handler based on intent type
      switch (intent.type) {
        case 'create_appointment':
          return await this.handleCreateAppointment(intent, callback);

        case 'edit_appointment':
          return await this.handleEditAppointment(intent, callback);

        case 'cancel_appointment':
          return await this.handleCancelAppointment(intent, callback);

        case 'check_status':
          return await this.handleCheckStatus(intent, callback);

        default:
          return this.handleUnknownIntent(callback);
      }
    } catch (error) {
      this.log.error({ err: error, callback }, 'Failed to process callback');

      return {
        success: false,
        intent: 'error',
        message: 'Failed to process request',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse and normalize intent from callback data
   * @param callback - Ultravox callback data
   */
  private parseIntent(callback: UltravoxCallbackWebhook): ParsedIntent {
    const extracted = callback.extractedData || {};
    const intentData = callback.intent || {};

    // Determine intent type
    let intentType: ParsedIntent['type'] = 'unknown';
    const appointmentType = extracted.appointmentType;

    if (appointmentType === 'create') {
      intentType = 'create_appointment';
    } else if (appointmentType === 'edit') {
      intentType = 'edit_appointment';
    } else if (appointmentType === 'cancel') {
      intentType = 'cancel_appointment';
    } else if (appointmentType === 'status') {
      intentType = 'check_status';
    } else if ('name' in intentData && intentData.name) {
      // Fallback to intent name mapping
      intentType = this.mapIntentName(intentData.name as string);
    }

    // Normalize parameters
    const parameters: ParsedIntent['parameters'] = {};

    if (extracted.appointmentDate) {
      try {
        parameters.date = normalizeDateString(extracted.appointmentDate);
      } catch (error) {
        this.log.warn({ date: extracted.appointmentDate }, 'Failed to normalize date');
      }
    }

    if (extracted.appointmentTime) {
      parameters.time = this.normalizeTime(extracted.appointmentTime);
    }

    if (extracted.patientName) {
      parameters.patientName = extracted.patientName.trim();
    }

    if (extracted.patientPhone) {
      try {
        parameters.patientPhone = normalizePhoneNumber(extracted.patientPhone);
      } catch (error) {
        this.log.warn({ phone: extracted.patientPhone }, 'Failed to normalize phone');
      }
    }

    if (extracted.reason) {
      parameters.reason = extracted.reason;
    }

    if (extracted.existingAppointmentId) {
      parameters.appointmentId = extracted.existingAppointmentId;
    }

    return {
      type: intentType,
      confidence: ('confidence' in intentData ? intentData.confidence : 0.8) as number,
      parameters,
    };
  }

  /**
   * Handle create appointment intent
   */
  private async handleCreateAppointment(
    intent: ParsedIntent,
    callback: UltravoxCallbackWebhook
  ): Promise<IntentResult> {
    try {
      // Validate required parameters
      if (!intent.parameters.date || !intent.parameters.time) {
        throw new ValidationError('Missing required appointment date or time');
      }

      if (!intent.parameters.patientName) {
        throw new ValidationError('Missing required patient name');
      }

      // Use caller's phone number if patient phone not provided
      const patientPhone = intent.parameters.patientPhone || this.extractCallerPhone(callback);

      if (!patientPhone) {
        throw new ValidationError('Unable to determine patient phone number');
      }

      // Create appointment
      const appointment = await appointmentService.createAppointment(
        {
          patientName: intent.parameters.patientName,
          patientPhone,
          appointmentDate: intent.parameters.date,
          appointmentTime: intent.parameters.time,
          reason: intent.parameters.reason,
          callSid: callback.callSid,
          sessionId: callback.sessionId,
        },
        patientPhone
      );

      this.log.info({ appointmentId: appointment.id }, 'Appointment created via AI');

      return {
        success: true,
        intent: 'create_appointment',
        message: `Appointment successfully scheduled for ${appointment.appointment_date} at ${appointment.appointment_time}`,
        data: { appointmentId: appointment.id, appointment },
      };
    } catch (error) {
      this.log.error({ err: error, intent }, 'Failed to create appointment');

      return {
        success: false,
        intent: 'create_appointment',
        message: error instanceof Error ? error.message : 'Failed to create appointment',
        error: error instanceof Error ? error.message : undefined,
      };
    }
  }

  /**
   * Handle edit appointment intent
   */
  private async handleEditAppointment(
    intent: ParsedIntent,
    _callback: UltravoxCallbackWebhook
  ): Promise<IntentResult> {
    try {
      if (!intent.parameters.appointmentId) {
        throw new ValidationError('Missing appointment ID for edit operation');
      }

      // Build update object
      const updates: any = {
        appointmentId: intent.parameters.appointmentId,
      };

      if (intent.parameters.date) {
        updates.appointmentDate = intent.parameters.date;
      }

      if (intent.parameters.time) {
        updates.appointmentTime = intent.parameters.time;
      }

      if (intent.parameters.reason) {
        updates.reason = intent.parameters.reason;
      }

      // Update appointment
      const appointment = await appointmentService.updateAppointment(
        intent.parameters.appointmentId,
        updates
      );

      this.log.info({ appointmentId: appointment.id }, 'Appointment updated via AI');

      return {
        success: true,
        intent: 'edit_appointment',
        message: `Appointment successfully updated to ${appointment.appointment_date} at ${appointment.appointment_time}`,
        data: { appointmentId: appointment.id, appointment },
      };
    } catch (error) {
      this.log.error({ err: error, intent }, 'Failed to edit appointment');

      return {
        success: false,
        intent: 'edit_appointment',
        message: error instanceof Error ? error.message : 'Failed to update appointment',
        error: error instanceof Error ? error.message : undefined,
      };
    }
  }

  /**
   * Handle cancel appointment intent
   */
  private async handleCancelAppointment(
    intent: ParsedIntent,
    _callback: UltravoxCallbackWebhook
  ): Promise<IntentResult> {
    try {
      if (!intent.parameters.appointmentId) {
        throw new ValidationError('Missing appointment ID for cancellation');
      }

      // Cancel appointment
      const appointment = await appointmentService.cancelAppointment(
        intent.parameters.appointmentId,
        intent.parameters.reason
      );

      this.log.info({ appointmentId: appointment.id }, 'Appointment cancelled via AI');

      return {
        success: true,
        intent: 'cancel_appointment',
        message: 'Appointment successfully cancelled',
        data: { appointmentId: appointment.id, appointment },
      };
    } catch (error) {
      this.log.error({ err: error, intent }, 'Failed to cancel appointment');

      return {
        success: false,
        intent: 'cancel_appointment',
        message: error instanceof Error ? error.message : 'Failed to cancel appointment',
        error: error instanceof Error ? error.message : undefined,
      };
    }
  }

  /**
   * Handle check status intent
   */
  private async handleCheckStatus(
    intent: ParsedIntent,
    callback: UltravoxCallbackWebhook
  ): Promise<IntentResult> {
    try {
      const callerPhone = this.extractCallerPhone(callback);

      if (!callerPhone) {
        throw new ValidationError('Unable to determine caller phone number');
      }

      // Get user appointments
      const appointments = await appointmentService.findUserAppointments(
        callerPhone,
        ['scheduled', 'confirmed']
      );

      if (appointments.length === 0) {
        return {
          success: true,
          intent: 'check_status',
          message: 'No upcoming appointments found',
          data: { appointments: [] },
        };
      }

      const appointmentList = appointments
        .map((apt) => `${apt.appointment_date} at ${apt.appointment_time}`)
        .join(', ');

      return {
        success: true,
        intent: 'check_status',
        message: `You have ${appointments.length} upcoming appointment(s): ${appointmentList}`,
        data: { appointments },
      };
    } catch (error) {
      this.log.error({ err: error, intent }, 'Failed to check status');

      return {
        success: false,
        intent: 'check_status',
        message: error instanceof Error ? error.message : 'Failed to retrieve appointments',
        error: error instanceof Error ? error.message : undefined,
      };
    }
  }

  /**
   * Handle unknown or low-confidence intents
   */
  private handleUnknownIntent(callback: UltravoxCallbackWebhook): IntentResult {
    this.log.warn({ callback }, 'Unknown or unclear intent');

    return {
      success: false,
      intent: 'unknown',
      message: 'Unable to understand your request. Please try again or speak with a representative.',
    };
  }

  /**
   * Handle failed callbacks
   */
  private handleFailedCallback(callback: UltravoxCallbackWebhook): IntentResult {
    const errorMsg = callback.error?.message || 'AI session failed or timed out';

    this.log.error({ callback }, 'Callback failed');

    return {
      success: false,
      intent: 'error',
      message: errorMsg,
      error: errorMsg,
    };
  }

  /**
   * Map intent names to internal types
   */
  private mapIntentName(name: string): ParsedIntent['type'] {
    const lowerName = name.toLowerCase();

    if (lowerName.includes('book') || lowerName.includes('create') || lowerName.includes('schedule')) {
      return 'create_appointment';
    }

    if (lowerName.includes('edit') || lowerName.includes('change') || lowerName.includes('reschedule')) {
      return 'edit_appointment';
    }

    if (lowerName.includes('cancel') || lowerName.includes('delete')) {
      return 'cancel_appointment';
    }

    if (lowerName.includes('check') || lowerName.includes('status') || lowerName.includes('list')) {
      return 'check_status';
    }

    return 'unknown';
  }

  /**
   * Normalize time string to HH:mm format
   */
  private normalizeTime(timeStr: string): string {
    // Handle various time formats
    const cleaned = timeStr.replace(/[^\d:apm]/gi, '').toLowerCase();

    // Try to parse common formats
    const patterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
      /(\d{1,2})\s*(am|pm)/i,
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        const period = match[3] || match[2];

        // Convert to 24-hour format
        if (period && period.toLowerCase() === 'pm' && hours < 12) {
          hours += 12;
        } else if (period && period.toLowerCase() === 'am' && hours === 12) {
          hours = 0;
        }

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }

    return timeStr; // Return original if can't parse
  }

  /**
   * Extract caller phone number from callback metadata
   */
  private extractCallerPhone(callback: UltravoxCallbackWebhook): string | null {
    // Try to extract from metadata or extractedData
    const phone =
      callback.extractedData?.patientPhone ||
      (callback as any).metadata?.phoneNumber ||
      (callback as any).metadata?.from;

    return phone || null;
  }
}

export default new IntentService();
