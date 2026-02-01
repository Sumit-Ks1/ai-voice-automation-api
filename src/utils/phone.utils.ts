/**
 * Phone number utility functions
 * Handles formatting, validation, and normalization
 */

/**
 * Check if phone number is anonymous/blocked/restricted
 * @param phone - Phone number string from Twilio
 */
export function isAnonymousCaller(phone: string | undefined | null): boolean {
  if (!phone) return true;
  const lowerPhone = phone.toLowerCase();
  return (
    lowerPhone === 'anonymous' ||
    lowerPhone === 'restricted' ||
    lowerPhone === 'blocked' ||
    lowerPhone === 'unknown' ||
    lowerPhone === '' ||
    lowerPhone === '+'
  );
}

/**
 * Normalize phone number to E.164 format (+1234567890)
 * Returns null for anonymous/blocked numbers
 * @param phone - Phone number in various formats
 * @param defaultCountryCode - Default country code if not provided (default: +1)
 */
export function normalizePhoneNumber(phone: string | undefined | null, defaultCountryCode: string = '+1'): string | null {
  // Handle anonymous/blocked callers
  if (isAnonymousCaller(phone)) {
    return null;
  }

  // Remove all non-digit characters
  let cleaned = phone!.replace(/\D/g, '');

  // If cleaned is empty or too short, return null
  if (cleaned.length < 10) {
    return null;
  }

  // If no country code and starts with 1, keep it
  if (!phone!.startsWith('+') && cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  }

  // If no country code, add default
  if (!phone!.startsWith('+')) {
    // Remove leading 1 if present (US numbers)
    if (cleaned.startsWith('1') && cleaned.length === 11) {
      cleaned = cleaned.substring(1);
    }
    return `${defaultCountryCode}${cleaned}`;
  }

  // Already has + prefix
  return `+${cleaned}`;
}

/**
 * Validate phone number format (basic E.164 validation)
 * @param phone - Phone number to validate
 */
export function isValidPhoneNumber(phone: string): boolean {
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * Format phone number for display (US format: (123) 456-7890)
 * @param phone - Phone number in E.164 format
 */
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  // US/Canada format
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const areaCode = cleaned.substring(1, 4);
    const firstPart = cleaned.substring(4, 7);
    const secondPart = cleaned.substring(7, 11);
    return `(${areaCode}) ${firstPart}-${secondPart}`;
  }

  // 10 digit number (assume US)
  if (cleaned.length === 10) {
    const areaCode = cleaned.substring(0, 3);
    const firstPart = cleaned.substring(3, 6);
    const secondPart = cleaned.substring(6, 10);
    return `(${areaCode}) ${firstPart}-${secondPart}`;
  }

  // Return original if can't format
  return phone;
}

/**
 * Mask phone number for privacy (show last 4 digits)
 * @param phone - Phone number to mask
 */
export function maskPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length >= 4) {
    const lastFour = cleaned.slice(-4);
    return `***-***-${lastFour}`;
  }
  return '***-***-****';
}

/**
 * Compare two phone numbers for equality (ignores formatting)
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 */
export function arePhoneNumbersEqual(phone1: string, phone2: string): boolean {
  const cleaned1 = phone1.replace(/\D/g, '');
  const cleaned2 = phone2.replace(/\D/g, '');

  // Compare last 10 digits (handles country code differences)
  const suffix1 = cleaned1.slice(-10);
  const suffix2 = cleaned2.slice(-10);

  return suffix1 === suffix2;
}

/**
 * Extract country code from phone number
 * @param phone - Phone number in E.164 format
 */
export function extractCountryCode(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  // US/Canada
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return '+1';
  }

  // UK
  if (cleaned.length >= 11 && cleaned.startsWith('44')) {
    return '+44';
  }

  // Default to +1
  return '+1';
}
