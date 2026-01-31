/**
 * Utility functions for date and time operations
 * Handles timezone conversions and business hours validation
 */

import { format, parse, isWithinInterval, addMinutes, isBefore, isAfter } from 'date-fns';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

// Re-export addMinutes for use in other modules
export { addMinutes };
import { config, businessDays, businessHoursStart, businessHoursEnd } from '../config/env';

/**
 * Convert local time string to UTC Date object
 * @param dateStr - Date string in YYYY-MM-DD format
 * @param timeStr - Time string in HH:mm format
 * @param timezone - Timezone identifier (defaults to business timezone)
 */
export function localToUtc(
  dateStr: string,
  timeStr: string,
  timezone: string = config.BUSINESS_TIMEZONE
): Date {
  const localDateTimeStr = `${dateStr} ${timeStr}`;
  const localDate = parse(localDateTimeStr, 'yyyy-MM-dd HH:mm', new Date());
  return fromZonedTime(localDate, timezone);
}

/**
 * Convert UTC Date to local time string
 * @param utcDate - UTC Date object
 * @param timezone - Timezone identifier (defaults to business timezone)
 */
export function utcToLocal(
  utcDate: Date,
  timezone: string = config.BUSINESS_TIMEZONE
): { date: string; time: string } {
  const localDate = toZonedTime(utcDate, timezone);
  return {
    date: format(localDate, 'yyyy-MM-dd'),
    time: format(localDate, 'HH:mm'),
  };
}

/**
 * Format date in business timezone
 * @param date - Date to format
 * @param formatStr - Format string (date-fns format)
 */
export function formatInBusinessTimezone(date: Date, formatStr: string = 'PPpp'): string {
  return formatInTimeZone(date, config.BUSINESS_TIMEZONE, formatStr);
}

/**
 * Check if date/time falls within business hours
 * @param date - Date string (YYYY-MM-DD)
 * @param time - Time string (HH:mm)
 */
export function isWithinBusinessHours(date: string, time: string): boolean {
  const localDate = parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
  const dayOfWeek = localDate.getDay();

  // Check if day is a business day
  if (!businessDays.includes(dayOfWeek)) {
    return false;
  }

  // Convert time to minutes since midnight
  const [hours, minutes] = time.split(':').map(Number);
  const timeInMinutes = hours * 60 + minutes;

  // Check if time is within business hours
  return timeInMinutes >= businessHoursStart && timeInMinutes <= businessHoursEnd;
}

/**
 * Check if appointment time conflicts with existing appointment
 * Includes buffer time before and after
 * @param newStart - New appointment start time (UTC)
 * @param newEnd - New appointment end time (UTC)
 * @param existingStart - Existing appointment start time (UTC)
 * @param existingEnd - Existing appointment end time (UTC)
 * @param bufferMinutes - Buffer time in minutes (defaults to config)
 */
export function hasTimeConflict(
  newStart: Date,
  newEnd: Date,
  existingStart: Date,
  existingEnd: Date,
  bufferMinutes: number = config.APPOINTMENT_BUFFER_MINUTES
): boolean {
  // Add buffer to existing appointment times
  const bufferedExistingStart = addMinutes(existingStart, -bufferMinutes);
  const bufferedExistingEnd = addMinutes(existingEnd, bufferMinutes);

  // Check if new appointment overlaps with buffered existing appointment
  const newStartsWithinExisting = isWithinInterval(newStart, {
    start: bufferedExistingStart,
    end: bufferedExistingEnd,
  });

  const newEndsWithinExisting = isWithinInterval(newEnd, {
    start: bufferedExistingStart,
    end: bufferedExistingEnd,
  });

  const newWrapsExisting =
    isBefore(newStart, bufferedExistingStart) && isAfter(newEnd, bufferedExistingEnd);

  return newStartsWithinExisting || newEndsWithinExisting || newWrapsExisting;
}

/**
 * Calculate appointment end time based on start time and duration
 * @param startTime - Start time (UTC)
 * @param durationMinutes - Duration in minutes (defaults to config)
 */
export function calculateEndTime(
  startTime: Date,
  durationMinutes: number = config.APPOINTMENT_DURATION_MINUTES
): Date {
  return addMinutes(startTime, durationMinutes);
}

/**
 * Check if date is in the past
 * @param date - Date string (YYYY-MM-DD)
 * @param time - Time string (HH:mm)
 */
export function isPastDateTime(date: string, time: string): boolean {
  const targetDate = parse(`${date} ${time}`, 'yyyy-MM-dd HH:mm', new Date());
  const targetUtc = fromZonedTime(targetDate, config.BUSINESS_TIMEZONE);
  return isBefore(targetUtc, new Date());
}

/**
 * Parse various date formats to YYYY-MM-DD
 * @param dateStr - Date string in various formats
 */
export function normalizeDateString(dateStr: string): string {
  try {
    // Try common formats
    const formats = [
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'dd/MM/yyyy',
      'MM-dd-yyyy',
      'yyyy/MM/dd',
    ];

    for (const fmt of formats) {
      try {
        const parsed = parse(dateStr, fmt, new Date());
        if (!isNaN(parsed.getTime())) {
          return format(parsed, 'yyyy-MM-dd');
        }
      } catch {
        continue;
      }
    }

    throw new Error('Invalid date format');
  } catch (error) {
    throw new Error(`Unable to parse date: ${dateStr}`);
  }
}

/**
 * Get start of business day in UTC
 * @param date - Date string (YYYY-MM-DD)
 */
export function getBusinessDayStart(date: string): Date {
  return localToUtc(date, format(new Date(businessHoursStart * 60 * 1000), 'HH:mm'));
}

/**
 * Get end of business day in UTC
 * @param date - Date string (YYYY-MM-DD)
 */
export function getBusinessDayEnd(date: string): Date {
  return localToUtc(date, format(new Date(businessHoursEnd * 60 * 1000), 'HH:mm'));
}
