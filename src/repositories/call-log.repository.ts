/**
 * Call log repository for tracking and analytics
 * Stores all inbound call information for auditing and analysis
 */

import { SupabaseClient } from '@supabase/supabase-js';
import getDatabase from '../config/database';
import { createChildLogger } from '../config/logger';
import { DatabaseError } from '../utils/errors';
import type { CallLog } from '../types/appointment.types';

class CallLogRepository {
  private db: SupabaseClient;
  private log = createChildLogger({ repository: 'call-log' });

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create new call log entry
   * @param data - Call log data
   */
  async create(data: Partial<CallLog>): Promise<CallLog> {
    try {
      const callLogData = {
        call_sid: data.call_sid!,
        session_id: data.session_id || null,
        user_id: data.user_id || null,
        from_number: data.from_number || null,
        to_number: data.to_number!,
        direction: data.direction || 'inbound',
        status: data.status || 'initiated',
        created_at: new Date().toISOString(),
      };

      const { data: result, error } = await this.db
        .from('call_logs')
        .insert(callLogData)
        .select()
        .single();

      if (error) {
        this.log.error({ err: error, data }, 'Failed to create call log');
        throw new DatabaseError('Failed to create call log');
      }

      this.log.debug({ callSid: result.call_sid }, 'Call log created');
      return result as CallLog;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, data }, 'Error in create');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Update call log
   * @param callSid - Twilio Call SID
   * @param updates - Fields to update
   */
  async update(callSid: string, updates: Partial<CallLog>): Promise<void> {
    try {
      const { error } = await this.db
        .from('call_logs')
        .update(updates)
        .eq('call_sid', callSid);

      if (error) {
        this.log.error({ err: error, callSid, updates }, 'Failed to update call log');
        // Don't throw - call log updates are non-critical
      }

      this.log.debug({ callSid, updates }, 'Call log updated');
    } catch (error) {
      this.log.error({ err: error, callSid }, 'Error in update');
      // Don't throw - call log updates are non-critical
    }
  }

  /**
   * Mark call as completed
   * @param callSid - Twilio Call SID
   * @param duration - Call duration in seconds
   */
  async markCompleted(callSid: string, duration?: number): Promise<void> {
    try {
      const updates: any = {
        status: 'completed',
        ended_at: new Date().toISOString(),
      };

      if (duration !== undefined) {
        updates.duration = duration;
      }

      await this.update(callSid, updates);
    } catch (error) {
      this.log.error({ err: error, callSid }, 'Error in markCompleted');
    }
  }

  /**
   * Mark call as failed
   * @param callSid - Twilio Call SID
   * @param errorMessage - Error message
   */
  async markFailed(callSid: string, errorMessage: string): Promise<void> {
    try {
      await this.update(callSid, {
        status: 'failed',
        error_message: errorMessage,
        ended_at: new Date().toISOString(),
      });
    } catch (error) {
      this.log.error({ err: error, callSid }, 'Error in markFailed');
    }
  }

  /**
   * Update intent information
   * @param callSid - Twilio Call SID
   * @param intentType - Detected intent type
   * @param intentData - Intent parameters
   */
  async updateIntent(
    callSid: string,
    intentType: string,
    intentData: Record<string, any>
  ): Promise<void> {
    try {
      await this.update(callSid, {
        intent_type: intentType,
        intent_data: intentData,
      });
    } catch (error) {
      this.log.error({ err: error, callSid }, 'Error in updateIntent');
    }
  }

  /**
   * Find call log by Call SID
   * @param callSid - Twilio Call SID
   */
  async findByCallSid(callSid: string): Promise<CallLog | null> {
    try {
      const { data, error } = await this.db
        .from('call_logs')
        .select('*')
        .eq('call_sid', callSid)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        this.log.error({ err: error, callSid }, 'Failed to find call log');
        return null;
      }

      return data as CallLog;
    } catch (error) {
      this.log.error({ err: error, callSid }, 'Error in findByCallSid');
      return null;
    }
  }

  /**
   * Get recent call logs for a user
   * @param userId - User UUID
   * @param limit - Maximum number of records
   */
  async getRecentByUser(userId: string, limit: number = 10): Promise<CallLog[]> {
    try {
      const { data, error } = await this.db
        .from('call_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        this.log.error({ err: error, userId }, 'Failed to get recent call logs');
        return [];
      }

      return data as CallLog[];
    } catch (error) {
      this.log.error({ err: error, userId }, 'Error in getRecentByUser');
      return [];
    }
  }
}

export default new CallLogRepository();
