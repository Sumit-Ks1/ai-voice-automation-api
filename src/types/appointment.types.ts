/**
 * TypeScript type definitions for appointment and user entities
 */

export interface Appointment {
  id: string;
  user_id: string;
  patient_name: string;
  patient_phone: string;
  appointment_date: string; // YYYY-MM-DD
  appointment_time: string; // HH:mm
  start_time_utc: string; // ISO 8601 UTC timestamp
  end_time_utc: string; // ISO 8601 UTC timestamp
  duration_minutes: number;
  reason?: string;
  status: AppointmentStatus;
  call_sid?: string;
  session_id?: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  notes?: string;
}

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'rescheduled';

export interface CreateAppointmentInput {
  patientName: string;
  patientPhone: string;
  appointmentDate: string;
  appointmentTime: string;
  reason?: string;
  callSid?: string;
  sessionId?: string;
  durationMinutes?: number;
}

export interface UpdateAppointmentInput {
  appointmentId: string;
  appointmentDate?: string;
  appointmentTime?: string;
  reason?: string;
  status?: AppointmentStatus;
  notes?: string;
}

export interface User {
  id: string;
  phone_number: string;
  name?: string;
  email?: string;
  created_at: string;
  updated_at: string;
  last_call_at?: string;
  total_appointments: number;
  metadata?: Record<string, any>;
}

export interface CallLog {
  id: string;
  call_sid: string;
  session_id?: string;
  user_id?: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  duration?: number;
  recording_url?: string;
  intent_type?: string;
  intent_data?: Record<string, any>;
  error_message?: string;
  created_at: string;
  ended_at?: string;
}

/**
 * Database query filters
 */
export interface AppointmentFilters {
  userId?: string;
  patientPhone?: string;
  status?: AppointmentStatus | AppointmentStatus[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface UserFilters {
  phoneNumber?: string;
  email?: string;
  limit?: number;
  offset?: number;
}
