/**
 * User service - Business logic layer
 * Handles user operations and verification
 */

import userRepository from '../repositories/user.repository';
import { createChildLogger } from '../config/logger';
import { normalizePhoneNumber, arePhoneNumbersEqual } from '../utils/phone.utils';
// Error types available if needed
// import { ValidationError, NotFoundError } from '../utils/errors';
import type { User } from '../types/appointment.types';

class UserService {
  private log = createChildLogger({ service: 'user' });

  /**
   * Verify user by phone number and optional name
   * Used during call authentication
   * 
   * @param phoneNumber - User's phone number
   * @param name - Optional user name for additional verification
   */
  async verifyUser(phoneNumber: string, name?: string): Promise<User> {
    try {
      this.log.info({ phoneNumber, name }, 'Verifying user');

      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      let user = await userRepository.findByPhone(normalizedPhone);

      if (!user) {
        // Create new user if doesn't exist
        this.log.info({ phoneNumber }, 'New user detected, creating account');
        user = await userRepository.findOrCreate(normalizedPhone, name);
      } else if (name && !user.name) {
        // Update user with name if provided
        this.log.info({ userId: user.id, name }, 'Updating user name');
        user = await userRepository.update(user.id, { name });
      }

      this.log.info({ userId: user.id, phoneNumber }, 'User verified successfully');

      return user;
    } catch (error) {
      this.log.error({ err: error, phoneNumber }, 'Failed to verify user');
      throw error;
    }
  }

  /**
   * Get user by phone number
   * @param phoneNumber - User's phone number
   */
  async getUserByPhone(phoneNumber: string): Promise<User | null> {
    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      return await userRepository.findByPhone(normalizedPhone);
    } catch (error) {
      this.log.error({ err: error, phoneNumber }, 'Failed to get user by phone');
      throw error;
    }
  }

  /**
   * Get user by ID
   * @param userId - User UUID
   */
  async getUserById(userId: string): Promise<User> {
    try {
      return await userRepository.findById(userId);
    } catch (error) {
      this.log.error({ err: error, userId }, 'Failed to get user by ID');
      throw error;
    }
  }

  /**
   * Update user information
   * @param userId - User UUID
   * @param updates - Fields to update
   */
  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    try {
      this.log.info({ userId, updates }, 'Updating user');

      // Verify user exists
      await userRepository.findById(userId);

      // Normalize phone if provided
      if (updates.phone_number) {
        updates.phone_number = normalizePhoneNumber(updates.phone_number);
      }

      const updatedUser = await userRepository.update(userId, updates);

      this.log.info({ userId }, 'User updated successfully');

      return updatedUser;
    } catch (error) {
      this.log.error({ err: error, userId }, 'Failed to update user');
      throw error;
    }
  }

  /**
   * Match phone numbers (handles formatting differences)
   * @param phone1 - First phone number
   * @param phone2 - Second phone number
   */
  matchPhoneNumbers(phone1: string, phone2: string): boolean {
    try {
      return arePhoneNumbersEqual(phone1, phone2);
    } catch (error) {
      this.log.warn({ phone1, phone2 }, 'Failed to match phone numbers');
      return false;
    }
  }
}

export default new UserService();
