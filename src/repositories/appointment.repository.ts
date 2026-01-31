/**
 * Appointment repository for database operations
 * Handles all appointment-related database queries with optimized queries
 */

import { SupabaseClient } from '@supabase/supabase-js';
import getDatabase from '../config/database';
import { createChildLogger } from '../config/logger';
import { DatabaseError, NotFoundError } from '../utils/errors';
import { localToUtc, calculateEndTime } from '../utils/date.utils';
import { config } from '../config/env';
import type {
  Appointment,
  AppointmentStatus,
  AppointmentFilters,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from '../types/appointment.types';

class AppointmentRepository {
  private db: SupabaseClient;
  private log = createChildLogger({ repository: 'appointment' });

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create new appointment
   * @param input - Appointment data
   * @param userId - User ID
   */
  async create(input: CreateAppointmentInput, userId: string): Promise<Appointment> {
    try {
      // Convert local time to UTC
      const startTimeUtc = localToUtc(input.appointmentDate, input.appointmentTime);
      const durationMinutes = input.durationMinutes || config.APPOINTMENT_DURATION_MINUTES;
      const endTimeUtc = calculateEndTime(startTimeUtc, durationMinutes);

      const appointmentData = {
        user_id: userId,
        patient_name: input.patientName,
        patient_phone: input.patientPhone,
        appointment_date: input.appointmentDate,
        appointment_time: input.appointmentTime,
        start_time_utc: startTimeUtc.toISOString(),
        end_time_utc: endTimeUtc.toISOString(),
        duration_minutes: durationMinutes,
        reason: input.reason || null,
        status: 'scheduled' as AppointmentStatus,
        call_sid: input.callSid || null,
        session_id: input.sessionId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: 'system',
      };

      const { data, error } = await this.db
        .from('appointments')
        .insert(appointmentData)
        .select()
        .single();

      if (error) {
        this.log.error({ err: error, input }, 'Failed to create appointment');
        throw new DatabaseError('Failed to create appointment');
      }

      this.log.info(
        { appointmentId: data.id, userId, date: input.appointmentDate },
        'Appointment created'
      );

      return data as Appointment;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, input }, 'Error in create');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Find appointment by ID
   * @param appointmentId - Appointment UUID
   */
  async findById(appointmentId: string): Promise<Appointment> {
    try {
      const { data, error } = await this.db
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('Appointment', appointmentId);
        }
        this.log.error({ err: error, appointmentId }, 'Failed to find appointment');
        throw new DatabaseError('Failed to find appointment');
      }

      return data as Appointment;
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof NotFoundError) {
        throw error;
      }
      this.log.error({ err: error, appointmentId }, 'Error in findById');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Update appointment
   * @param appointmentId - Appointment UUID
   * @param updates - Fields to update
   */
  async update(appointmentId: string, updates: UpdateAppointmentInput): Promise<Appointment> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // If date or time changed, recalculate UTC times
      if (updates.appointmentDate || updates.appointmentTime) {
        const existingAppointment = await this.findById(appointmentId);
        const newDate = updates.appointmentDate || existingAppointment.appointment_date;
        const newTime = updates.appointmentTime || existingAppointment.appointment_time;

        const startTimeUtc = localToUtc(newDate, newTime);
        const endTimeUtc = calculateEndTime(
          startTimeUtc,
          existingAppointment.duration_minutes
        );

        updateData.appointment_date = newDate;
        updateData.appointment_time = newTime;
        updateData.start_time_utc = startTimeUtc.toISOString();
        updateData.end_time_utc = endTimeUtc.toISOString();
      }

      if (updates.reason !== undefined) {
        updateData.reason = updates.reason;
      }

      if (updates.status) {
        updateData.status = updates.status;
      }

      if (updates.notes !== undefined) {
        updateData.notes = updates.notes;
      }

      const { data, error } = await this.db
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId)
        .select()
        .single();

      if (error) {
        this.log.error({ err: error, appointmentId, updates }, 'Failed to update appointment');
        throw new DatabaseError('Failed to update appointment');
      }

      this.log.info({ appointmentId, updates }, 'Appointment updated');
      return data as Appointment;
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof NotFoundError) {
        throw error;
      }
      this.log.error({ err: error, appointmentId }, 'Error in update');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Cancel appointment (soft delete - sets status to cancelled)
   * @param appointmentId - Appointment UUID
   */
  async cancel(appointmentId: string, reason?: string): Promise<Appointment> {
    try {
      const updateData: any = {
        status: 'cancelled' as AppointmentStatus,
        updated_at: new Date().toISOString(),
      };

      if (reason) {
        updateData.notes = reason;
      }

      const { data, error } = await this.db
        .from('appointments')
        .update(updateData)
        .eq('id', appointmentId)
        .select()
        .single();

      if (error) {
        this.log.error({ err: error, appointmentId }, 'Failed to cancel appointment');
        throw new DatabaseError('Failed to cancel appointment');
      }

      this.log.info({ appointmentId }, 'Appointment cancelled');
      return data as Appointment;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, appointmentId }, 'Error in cancel');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * List appointments with filters
   * @param filters - Query filters
   */
  async list(filters: AppointmentFilters = {}): Promise<Appointment[]> {
    try {
      let query = this.db.from('appointments').select('*');

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.patientPhone) {
        query = query.eq('patient_phone', filters.patientPhone);
      }

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.dateFrom) {
        query = query.gte('appointment_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('appointment_date', filters.dateTo);
      }

      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query.order('appointment_date', { ascending: true });

      if (error) {
        this.log.error({ err: error, filters }, 'Failed to list appointments');
        throw new DatabaseError('Failed to list appointments');
      }

      return data as Appointment[];
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, filters }, 'Error in list');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Find conflicting appointments for a given time slot
   * Used for conflict detection
   * 
   * @param startTimeUtc - Start time in UTC
   * @param endTimeUtc - End time in UTC
   * @param excludeAppointmentId - Optional appointment ID to exclude (for updates)
   */
  async findConflicts(
    startTimeUtc: Date,
    endTimeUtc: Date,
    excludeAppointmentId?: string
  ): Promise<Appointment[]> {
    try {
      let query = this.db
        .from('appointments')
        .select('*')
        .in('status', ['scheduled', 'confirmed'])
        .or(
          `and(start_time_utc.lte.${endTimeUtc.toISOString()},end_time_utc.gte.${startTimeUtc.toISOString()})`
        );

      if (excludeAppointmentId) {
        query = query.neq('id', excludeAppointmentId);
      }

      const { data, error } = await query;

      if (error) {
        this.log.error({ err: error }, 'Failed to find conflicts');
        throw new DatabaseError('Failed to check appointment conflicts');
      }

      return data as Appointment[];
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error }, 'Error in findConflicts');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Get appointment count for a user
   * @param userId - User UUID
   */
  async getCountByUser(userId: string): Promise<number> {
    try {
      const { count, error } = await this.db
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) {
        this.log.error({ err: error, userId }, 'Failed to get appointment count');
        throw new DatabaseError('Failed to get appointment count');
      }

      return count || 0;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, userId }, 'Error in getCountByUser');
      throw new DatabaseError('Database operation failed');
    }
  }
}

export default new AppointmentRepository();
