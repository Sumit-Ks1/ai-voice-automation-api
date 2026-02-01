/**
 * Webhook controller - Handles Ultravox AI callback webhooks
 * Separate endpoints for each tool action
 */

import { Request, Response } from 'express';
import appointmentService from '../services/appointment.service';
import callLogRepository from '../repositories/call-log.repository';
import { createChildLogger } from '../config/logger';

const log = createChildLogger({ controller: 'webhook' });

// ============================================
// APPOINTMENT ENDPOINTS
// ============================================

/**
 * POST /api/v1/webhooks/ultravox/appointment/create
 * Create a new appointment for a new patient
 */
export async function createAppointment(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const { full_name, phone_number, preferred_date, preferred_time, reason_for_visit } = req.body;
    
    log.info({ full_name, phone_number, preferred_date, preferred_time }, 'Create appointment request');

    // Create appointment using the service (handles user creation internally)
    const appointment = await appointmentService.createAppointment(
      {
        patientName: full_name,
        patientPhone: phone_number,
        appointmentDate: preferred_date,
        appointmentTime: preferred_time,
        reason: reason_for_visit || 'General checkup',
      },
      phone_number
    );

    const duration = Date.now() - startTime;
    log.info({ appointmentId: appointment.id, duration }, 'Appointment created successfully');

    res.status(200).json({
      success: true,
      message: `Appointment confirmed for ${preferred_date} at ${preferred_time}`,
      data: {
        appointment_id: appointment.id,
        date: preferred_date,
        time: preferred_time,
        patient_name: full_name,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to create appointment');
    
    res.status(200).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to create appointment. Please try a different time.',
      error: 'booking_failed',
    });
  }
}

/**
 * POST /api/v1/webhooks/ultravox/appointment/check
 * Look up existing appointments
 */
export async function checkAppointment(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const { phone_number } = req.body;
    
    log.info({ phone_number }, 'Check appointment request');

    // Find user appointments using the service
    const appointments = await appointmentService.findUserAppointments(
      phone_number,
      ['scheduled', 'confirmed']
    );

    const duration = Date.now() - startTime;
    log.info({ count: appointments.length, duration }, 'Appointments retrieved');

    if (appointments.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No upcoming appointments found.',
        data: { appointments: [] },
      });
      return;
    }

    const appointmentList = appointments.map((apt) => ({
      id: apt.id,
      date: apt.appointment_date,
      time: apt.appointment_time,
      reason: apt.reason,
      status: apt.status,
    }));

    res.status(200).json({
      success: true,
      message: `Found ${appointments.length} upcoming appointment(s).`,
      data: {
        appointments: appointmentList,
        next_appointment: appointmentList[0],
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to check appointments');
    
    res.status(200).json({
      success: false,
      message: 'Unable to look up appointments at this time.',
      error: 'lookup_failed',
    });
  }
}

/**
 * POST /api/v1/webhooks/ultravox/appointment/edit
 * Modify an existing appointment
 */
export async function editAppointment(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const { phone_number, original_date, new_date, new_time } = req.body;
    
    log.info({ phone_number, original_date, new_date, new_time }, 'Edit appointment request');

    // Find user appointments
    const appointments = await appointmentService.findUserAppointments(
      phone_number,
      ['scheduled', 'confirmed']
    );

    // Find the appointment on the original date
    const appointment = appointments.find(
      (apt) => apt.appointment_date === original_date
    );

    if (!appointment) {
      res.status(200).json({
        success: false,
        message: `No appointment found on ${original_date}.`,
        error: 'appointment_not_found',
      });
      return;
    }

    // Update appointment
    const updated = await appointmentService.updateAppointment(appointment.id, {
      appointmentId: appointment.id,
      appointmentDate: new_date || original_date,
      appointmentTime: new_time || appointment.appointment_time,
    });

    const duration = Date.now() - startTime;
    log.info({ appointmentId: appointment.id, duration }, 'Appointment updated');

    res.status(200).json({
      success: true,
      message: `Appointment updated to ${new_date || original_date} at ${new_time || appointment.appointment_time}.`,
      data: {
        appointment_id: updated.id,
        new_date: new_date || original_date,
        new_time: new_time || appointment.appointment_time,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to edit appointment');
    
    res.status(200).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to update appointment.',
      error: 'update_failed',
    });
  }
}

/**
 * POST /api/v1/webhooks/ultravox/appointment/cancel
 * Cancel an existing appointment
 */
export async function cancelAppointment(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();
  
  try {
    const { phone_number, appointment_date, cancellation_reason } = req.body;
    
    log.info({ phone_number, appointment_date, cancellation_reason }, 'Cancel appointment request');

    // Find user appointments
    const appointments = await appointmentService.findUserAppointments(
      phone_number,
      ['scheduled', 'confirmed']
    );

    // Find the appointment on the given date
    const appointment = appointments.find(
      (apt) => apt.appointment_date === appointment_date
    );

    if (!appointment) {
      res.status(200).json({
        success: false,
        message: `No appointment found on ${appointment_date}.`,
        error: 'appointment_not_found',
      });
      return;
    }

    // Cancel appointment
    await appointmentService.cancelAppointment(appointment.id, cancellation_reason);

    const duration = Date.now() - startTime;
    log.info({ appointmentId: appointment.id, duration }, 'Appointment cancelled');

    res.status(200).json({
      success: true,
      message: `Your appointment on ${appointment_date} has been cancelled.`,
      data: {
        cancelled_date: appointment_date,
        reason: cancellation_reason || 'Not specified',
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to cancel appointment');
    
    res.status(200).json({
      success: false,
      message: 'Failed to cancel appointment.',
      error: 'cancel_failed',
    });
  }
}

// ============================================
// CALL CONTROL ENDPOINTS
// ============================================

/**
 * POST /api/v1/webhooks/ultravox/call/transfer
 * Handle call transfer request
 */
export async function transferCall(req: Request, res: Response): Promise<void> {
  try {
    const { reason, notes, call_sid } = req.body;
    
    log.info({ reason, notes, call_sid }, 'Transfer call request');

    // Log the transfer request
    if (call_sid) {
      await callLogRepository.updateIntent(call_sid, 'transfer', {
        reason,
        notes,
        timestamp: new Date().toISOString(),
      });
    }

    // Return transfer instructions
    // In production, this would trigger Twilio to transfer the call
    res.status(200).json({
      success: true,
      message: 'Transferring call to front desk staff.',
      action: 'transfer',
      data: {
        transfer_to: '+18183613889', // Front desk number
        reason,
        notes,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to process transfer');
    
    res.status(200).json({
      success: false,
      message: 'Unable to transfer at this time. Please call back.',
      error: 'transfer_failed',
    });
  }
}

/**
 * POST /api/v1/webhooks/ultravox/call/end
 * Handle call end request
 */
export async function endCall(req: Request, res: Response): Promise<void> {
  try {
    const { outcome, summary, call_sid } = req.body;
    
    log.info({ outcome, summary, call_sid }, 'End call request');

    // Log the call outcome
    if (call_sid) {
      await callLogRepository.updateIntent(call_sid, 'call_ended', {
        outcome,
        summary,
        timestamp: new Date().toISOString(),
      });
      await callLogRepository.markCompleted(call_sid, 0);
    }

    res.status(200).json({
      success: true,
      message: 'Call ended successfully.',
      action: 'hangup',
      data: {
        outcome,
        summary,
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to process call end');
    
    res.status(200).json({
      success: true,
      message: 'Call ended.',
      action: 'hangup',
    });
  }
}

// ============================================
// LEGACY & HEALTH ENDPOINTS
// ============================================

/**
 * POST /api/v1/webhooks/ultravox (legacy unified endpoint)
 * Kept for backward compatibility
 */
export async function handleUltravoxCallback(req: Request, res: Response): Promise<void> {
  const { intent, data } = req.body;
  
  log.info({ intent }, 'Legacy webhook callback - routing to specific handler');

  // Route to appropriate handler based on intent
  switch (intent) {
    case 'create_appointment':
      req.body = data;
      return createAppointment(req, res);
    case 'check_appointment':
      req.body = data;
      return checkAppointment(req, res);
    case 'edit_appointment':
      req.body = data;
      return editAppointment(req, res);
    case 'cancel_appointment':
      req.body = data;
      return cancelAppointment(req, res);
    default:
      res.status(200).json({
        success: false,
        message: 'Unknown intent',
        error: 'unknown_intent',
      });
  }
}

/**
 * GET /api/v1/webhooks/health
 * Health check endpoint
 */
export async function healthCheck(_req: Request, res: Response): Promise<void> {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      create: '/api/v1/webhooks/ultravox/appointment/create',
      check: '/api/v1/webhooks/ultravox/appointment/check',
      edit: '/api/v1/webhooks/ultravox/appointment/edit',
      cancel: '/api/v1/webhooks/ultravox/appointment/cancel',
      transfer: '/api/v1/webhooks/ultravox/call/transfer',
      end: '/api/v1/webhooks/ultravox/call/end',
    },
  });
}
