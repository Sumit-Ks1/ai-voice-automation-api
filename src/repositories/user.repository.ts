/**
 * User repository for database operations
 * Handles all user-related database queries
 */

import { SupabaseClient } from '@supabase/supabase-js';
import getDatabase from '../config/database';
import { createChildLogger } from '../config/logger';
import { DatabaseError, NotFoundError } from '../utils/errors';
import { normalizePhoneNumber } from '../utils/phone.utils';
import type { User, UserFilters } from '../types/appointment.types';

class UserRepository {
  private db: SupabaseClient;
  private log = createChildLogger({ repository: 'user' });

  constructor() {
    this.db = getDatabase();
  }

  /**
   * Create an anonymous user for callers with blocked/restricted numbers
   * Used when caller ID is not available
   */
  async createAnonymousUser(): Promise<User> {
    try {
      const anonymousId = `anon_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const { data, error } = await this.db
        .from('users')
        .insert({
          phone_number: null,
          name: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          total_appointments: 0,
          metadata: { anonymous: true, session_id: anonymousId },
        })
        .select()
        .single();

      if (error) {
        this.log.error({ err: error }, 'Failed to create anonymous user');
        throw new DatabaseError('Failed to create anonymous user');
      }

      this.log.info({ userId: data.id }, 'Anonymous user created');
      return data as User;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error }, 'Error creating anonymous user');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Find or create user by phone number
   * Used for authentication and user identification
   * 
   * @param phoneNumber - User's phone number (will be normalized)
   * @param name - Optional user name
   */
  async findOrCreate(phoneNumber: string, name?: string): Promise<User> {
    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      
      // If phone number is null/invalid, create anonymous user
      if (!normalizedPhone) {
        return await this.createAnonymousUser();
      }

      // Try to find existing user
      const existingUser = await this.findByPhone(normalizedPhone);
      if (existingUser) {
        // Update last call timestamp
        await this.updateLastCall(existingUser.id);
        return existingUser;
      }

      // Create new user
      const { data, error } = await this.db
        .from('users')
        .insert({
          phone_number: normalizedPhone,
          name: name || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          total_appointments: 0,
        })
        .select()
        .single();

      if (error) {
        this.log.error({ err: error, phoneNumber }, 'Failed to create user');
        throw new DatabaseError('Failed to create user');
      }

      this.log.info({ userId: data.id, phoneNumber }, 'New user created');
      return data as User;
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof NotFoundError) {
        throw error;
      }
      this.log.error({ err: error, phoneNumber }, 'Error in findOrCreate');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Find user by phone number
   * @param phoneNumber - Phone number (E.164 format)
   */
  async findByPhone(phoneNumber: string): Promise<User | null> {
    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);

      const { data, error } = await this.db
        .from('users')
        .select('*')
        .eq('phone_number', normalizedPhone)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        this.log.error({ err: error, phoneNumber }, 'Failed to find user by phone');
        throw new DatabaseError('Failed to find user');
      }

      return data as User;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, phoneNumber }, 'Error in findByPhone');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Find user by ID
   * @param userId - User UUID
   */
  async findById(userId: string): Promise<User> {
    try {
      const { data, error } = await this.db
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundError('User', userId);
        }
        this.log.error({ err: error, userId }, 'Failed to find user by ID');
        throw new DatabaseError('Failed to find user');
      }

      return data as User;
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof NotFoundError) {
        throw error;
      }
      this.log.error({ err: error, userId }, 'Error in findById');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Update user information
   * @param userId - User UUID
   * @param updates - Fields to update
   */
  async update(userId: string, updates: Partial<User>): Promise<User> {
    try {
      const { data, error } = await this.db
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        this.log.error({ err: error, userId }, 'Failed to update user');
        throw new DatabaseError('Failed to update user');
      }

      this.log.info({ userId }, 'User updated');
      return data as User;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, userId }, 'Error in update');
      throw new DatabaseError('Database operation failed');
    }
  }

  /**
   * Update last call timestamp
   * @param userId - User UUID
   */
  async updateLastCall(userId: string): Promise<void> {
    try {
      const { error } = await this.db
        .from('users')
        .update({
          last_call_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        this.log.error({ err: error, userId }, 'Failed to update last call');
        // Don't throw - this is a non-critical update
      }
    } catch (error) {
      this.log.error({ err: error, userId }, 'Error in updateLastCall');
      // Don't throw - this is a non-critical update
    }
  }

  /**
   * Increment appointment count
   * @param userId - User UUID
   */
  async incrementAppointmentCount(userId: string): Promise<void> {
    try {
      const { error } = await this.db.rpc('increment_appointment_count', {
        user_id: userId,
      });

      if (error) {
        this.log.error({ err: error, userId }, 'Failed to increment appointment count');
        // Don't throw - this is a non-critical update
      }
    } catch (error) {
      this.log.error({ err: error, userId }, 'Error in incrementAppointmentCount');
      // Don't throw - this is a non-critical update
    }
  }

  /**
   * List users with filters
   * @param filters - Query filters
   */
  async list(filters: UserFilters = {}): Promise<User[]> {
    try {
      let query = this.db.from('users').select('*');

      if (filters.phoneNumber) {
        query = query.eq('phone_number', normalizePhoneNumber(filters.phoneNumber));
      }

      if (filters.email) {
        query = query.eq('email', filters.email);
      }

      const limit = filters.limit || 20;
      const offset = filters.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        this.log.error({ err: error, filters }, 'Failed to list users');
        throw new DatabaseError('Failed to list users');
      }

      return data as User[];
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      this.log.error({ err: error, filters }, 'Error in list');
      throw new DatabaseError('Database operation failed');
    }
  }
}

export default new UserRepository();
