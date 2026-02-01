/**
 * Appointment service - Business logic layer
 * Handles appointment operations with business rules validation
 */

import appointmentRepository from '../repositories/appointment.repository';
import userRepository from '../repositories/user.repository';
import { createChildLogger } from '../config/logger';
import {
  BusinessRuleError,
  ConflictError,
  ValidationError,
} from '../utils/errors';
import {
  isWithinBusinessHours,
  isPastDateTime,
  hasTimeConflict,
  localToUtc,
  calculateEndTime,
  addMinutes,
} from '../utils/date.utils';
import { normalizePhoneNumber } from '../utils/phone.utils';
import { config } from '../config/env';
import type {
  Appointment,
  CreateAppointmentInput,
  UpdateAppointmentInput,
  AppointmentFilters,
} from '../types/appointment.types';

class AppointmentService {
  private log = createChildLogger({ service: 'appointment' });

  /**
   * Create new appointment with full validation
   * @param input - Appointment data
   * @param phoneNumber - User's phone number for identification
   */
  async createAppointment(
    input: CreateAppointmentInput,
    phoneNumber: string
  ): Promise<Appointment> {
    try {
      this.log.info({ input, phoneNumber }, 'Creating appointment');

      // Normalize phone number
      const normalizedPhone = normalizePhoneNumber(phoneNumber) || phoneNumber;
      const normalizedPatientPhone = normalizePhoneNumber(input.patientPhone);
      if (normalizedPatientPhone) {
        input.patientPhone = normalizedPatientPhone;
      }

      // Find or create user
      const user = await userRepository.findOrCreate(normalizedPhone, input.patientName);

      // Validate business rules
      await this.validateAppointmentTime(input.appointmentDate, input.appointmentTime);
      await this.checkConflicts(input.appointmentDate, input.appointmentTime);

      // Create appointment
      const appointment = await appointmentRepository.create(input, user.id);

      // Update user statistics
      await userRepository.incrementAppointmentCount(user.id);

      this.log.info(
        { appointmentId: appointment.id, userId: user.id },
        'Appointment created successfully'
      );

      return appointment;
    } catch (error) {
      this.log.error({ err: error, input }, 'Failed to create appointment');
      throw error;
    }
  }

  /**
   * Update existing appointment
   * @param appointmentId - Appointment UUID
   * @param updates - Fields to update
   */
  async updateAppointment(
    appointmentId: string,
    updates: UpdateAppointmentInput
  ): Promise<Appointment> {
    try {
      this.log.info({ appointmentId, updates }, 'Updating appointment');

      // Verify appointment exists
      const existingAppointment = await appointmentRepository.findById(appointmentId);

      // Validate status transition
      this.validateStatusTransition(existingAppointment.status, updates.status);

      // If date/time changed, validate new time
      if (updates.appointmentDate || updates.appointmentTime) {
        const newDate = updates.appointmentDate || existingAppointment.appointment_date;
        const newTime = updates.appointmentTime || existingAppointment.appointment_time;

        await this.validateAppointmentTime(newDate, newTime);
        await this.checkConflicts(newDate, newTime, appointmentId);
      }

      // Update appointment
      const updatedAppointment = await appointmentRepository.update(appointmentId, updates);

      this.log.info({ appointmentId }, 'Appointment updated successfully');

      return updatedAppointment;
    } catch (error) {
      this.log.error({ err: error, appointmentId, updates }, 'Failed to update appointment');
      throw error;
    }
  }

  /**
   * Cancel appointment
   * @param appointmentId - Appointment UUID
   * @param reason - Cancellation reason
   */
  async cancelAppointment(appointmentId: string, reason?: string): Promise<Appointment> {
    try {
      this.log.info({ appointmentId, reason }, 'Cancelling appointment');

      // Verify appointment exists and is cancellable
      const existingAppointment = await appointmentRepository.findById(appointmentId);

      if (existingAppointment.status === 'cancelled') {
        throw new BusinessRuleError('Appointment is already cancelled');
      }

      if (existingAppointment.status === 'completed') {
        throw new BusinessRuleError('Cannot cancel completed appointment');
      }

      // Cancel appointment
      const cancelledAppointment = await appointmentRepository.cancel(appointmentId, reason);

      this.log.info({ appointmentId }, 'Appointment cancelled successfully');

      return cancelledAppointment;
    } catch (error) {
      this.log.error({ err: error, appointmentId }, 'Failed to cancel appointment');
      throw error;
    }
  }

  /**
   * Get appointment by ID
   * @param appointmentId - Appointment UUID
   */
  async getAppointment(appointmentId: string): Promise<Appointment> {
    try {
      return await appointmentRepository.findById(appointmentId);
    } catch (error) {
      this.log.error({ err: error, appointmentId }, 'Failed to get appointment');
      throw error;
    }
  }

  /**
   * List appointments with filters
   * @param filters - Query filters
   */
  async listAppointments(filters: AppointmentFilters): Promise<Appointment[]> {
    try {
      if (filters.patientPhone) {
        const normalized = normalizePhoneNumber(filters.patientPhone);
        filters.patientPhone = normalized || undefined;
      }

      return await appointmentRepository.list(filters);
    } catch (error) {
      this.log.error({ err: error, filters }, 'Failed to list appointments');
      throw error;
    }
  }

  /**
   * Find appointments for a user by phone number
   * @param phoneNumber - User's phone number
   * @param statusFilter - Optional status filter
   */
  async findUserAppointments(
    phoneNumber: string,
    statusFilter?: string[]
  ): Promise<Appointment[]> {
    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        return [];
      }
      const user = await userRepository.findByPhone(normalizedPhone);

      if (!user) {
        return [];
      }

      const filters: AppointmentFilters = {
        userId: user.id,
      };

      if (statusFilter && statusFilter.length > 0) {
        filters.status = statusFilter as any;
      }

      return await appointmentRepository.list(filters);
    } catch (error) {
      this.log.error({ err: error, phoneNumber }, 'Failed to find user appointments');
      throw error;
    }
  }

  /**
   * Validate appointment date and time
   * @param date - Appointment date (YYYY-MM-DD)
   * @param time - Appointment time (HH:mm)
   */
  private async validateAppointmentTime(date: string, time: string): Promise<void> {
    // Check if date/time is in the past
    if (isPastDateTime(date, time)) {
      throw new BusinessRuleError('Cannot schedule appointment in the past');
    }

    // Check if within business hours
    if (!isWithinBusinessHours(date, time)) {
      throw new BusinessRuleError(
        `Appointments must be scheduled during business hours: ${config.BUSINESS_HOURS_START} - ${config.BUSINESS_HOURS_END} ${config.BUSINESS_TIMEZONE}`
      );
    }
  }

  /**
   * Check for appointment conflicts
   * @param date - Appointment date (YYYY-MM-DD)
   * @param time - Appointment time (HH:mm)
   * @param excludeAppointmentId - Optional appointment ID to exclude (for updates)
   */
  private async checkConflicts(
    date: string,
    time: string,
    excludeAppointmentId?: string
  ): Promise<void> {
    const startTimeUtc = localToUtc(date, time);
    const endTimeUtc = calculateEndTime(startTimeUtc);

    // Add buffer time
    const bufferedStart = addMinutes(startTimeUtc, -config.APPOINTMENT_BUFFER_MINUTES);
    const bufferedEnd = addMinutes(endTimeUtc, config.APPOINTMENT_BUFFER_MINUTES);

    const conflicts = await appointmentRepository.findConflicts(
      bufferedStart,
      bufferedEnd,
      excludeAppointmentId
    );

    if (conflicts.length > 0) {
      const conflictTimes = conflicts
        .map((a) => `${a.appointment_date} at ${a.appointment_time}`)
        .join(', ');

      throw new ConflictError(
        `Time slot conflicts with existing appointment(s): ${conflictTimes}`,
        { conflicts: conflicts.map((a) => a.id) }
      );
    }
  }

  /**
   * Validate appointment status transitions
   * @param currentStatus - Current appointment status
   * @param newStatus - New appointment status
   */
  private validateStatusTransition(currentStatus: string, newStatus?: string): void {
    if (!newStatus) {
      return;
    }

    const validTransitions: Record<string, string[]> = {
      scheduled: ['confirmed', 'cancelled', 'rescheduled'],
      confirmed: ['completed', 'cancelled', 'no_show', 'rescheduled'],
      cancelled: [], // Cannot transition from cancelled
      completed: [], // Cannot transition from completed
      no_show: ['rescheduled'], // Can reschedule no-shows
      rescheduled: ['scheduled'], // Rescheduled becomes scheduled again
    };

    const allowedTransitions = validTransitions[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new BusinessRuleError(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'`
      );
    }
  }

  /**
   * Get available time slots for a given date
   * @param date - Date to check (YYYY-MM-DD)
   * @param durationMinutes - Appointment duration
   */
  async getAvailableSlots(
    date: string,
    durationMinutes: number = config.APPOINTMENT_DURATION_MINUTES
  ): Promise<string[]> {
    try {
      // Validate date is not in the past
      if (isPastDateTime(date, '00:00')) {
        throw new ValidationError('Cannot get slots for past dates');
      }

      // Get all appointments for the date
      const appointments = await appointmentRepository.list({
        dateFrom: date,
        dateTo: date,
        status: ['scheduled', 'confirmed'],
      });

      // Generate all possible time slots
      const slots: string[] = [];
      const [startHour, startMin] = config.BUSINESS_HOURS_START.split(':').map(Number);
      const [endHour, endMin] = config.BUSINESS_HOURS_END.split(':').map(Number);

      let currentMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      while (currentMinutes + durationMinutes <= endMinutes) {
        const hour = Math.floor(currentMinutes / 60);
        const min = currentMinutes % 60;
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

        // Check if slot is available (no conflicts)
        const slotStart = localToUtc(date, timeStr);
        const slotEnd = calculateEndTime(slotStart, durationMinutes);

        const hasConflict = appointments.some((apt) => {
          const aptStart = new Date(apt.start_time_utc);
          const aptEnd = new Date(apt.end_time_utc);
          return hasTimeConflict(slotStart, slotEnd, aptStart, aptEnd);
        });

        if (!hasConflict && !isPastDateTime(date, timeStr)) {
          slots.push(timeStr);
        }

        // Move to next slot (15 minute intervals)
        currentMinutes += 15;
      }

      return slots;
    } catch (error) {
      this.log.error({ err: error, date }, 'Failed to get available slots');
      throw error;
    }
  }
}

export default new AppointmentService();
