import { format } from 'date-fns';

/**
 * Format a date in the Cursor-style export format: `M/d/yyyy at HH:mm:ss GMT+N`
 *
 * @example formatExportDate(new Date('2026-02-08T10:29:19Z'))
 * // In NZ (UTC+13): '2/8/2026 at 23:29:19 GMT+13'
 *
 * @param date The date to format
 * @returns Formatted date string with timezone offset
 */
export const formatExportDate = (date: Date): string => {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  const timezone = minutes > 0 ? `GMT${sign}${hours}:${String(minutes).padStart(2, '0')}` : `GMT${sign}${hours}`;
  return `${format(date, 'M/d/yyyy')} at ${format(date, 'HH:mm:ss')} ${timezone}`;
};

/**
 * The exact moment behind a relative label, e.g. `Sep 22, 2026, 4:41 PM`.
 * @param date The date to format
 * @returns Locale-medium date with a short time
 */
export const formatAbsoluteTime = (date: Date | number): string =>
  new Date(date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

type FormatRelativeTimeOptions = {
  /**
   * If true, returns a shortened format (e.g., "2m" instead of "2 minutes ago")
   */
  readonly short?: boolean;
};

// Time constants in milliseconds
const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;
const week = 7 * day;

type TimeUnit = {
  readonly threshold: number;
  readonly divisor: number;
  readonly long: string | ((value: number) => string);
  readonly short: string | ((value: number) => string);
};

// Ordered from smallest to largest threshold
const timeUnits: readonly TimeUnit[] = [
  { threshold: 5 * second, divisor: 1, long: 'just now', short: 'Now' },
  { threshold: minute, divisor: second, long: (v) => `${v} seconds ago`, short: (v) => `${v}s` },
  { threshold: 2 * minute, divisor: 1, long: 'a minute ago', short: '1m' },
  { threshold: hour, divisor: minute, long: (v) => `${v} minutes ago`, short: (v) => `${v}m` },
  { threshold: 2 * hour, divisor: 1, long: 'an hour ago', short: '1h' },
  { threshold: day, divisor: hour, long: (v) => `${v} hours ago`, short: (v) => `${v}h` },
  { threshold: 2 * day, divisor: 1, long: 'yesterday', short: '1d' },
  { threshold: week, divisor: day, long: (v) => `${v} days ago`, short: (v) => `${v}d` },
];

/**
 * Formats a date relatively (e.g., "just now", "2 minutes ago", "3 years ago")
 * @param date Date to format
 * @param options Formatting options
 * @returns Formatted relative time string
 */
export const formatRelativeTime = (date: Date | number, options?: FormatRelativeTimeOptions): string => {
  const targetDate = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diff = now.getTime() - targetDate.getTime();
  const short = options?.short ?? false;

  for (const unit of timeUnits) {
    if (diff < unit.threshold) {
      const value = Math.floor(diff / unit.divisor);
      const format = short ? unit.short : unit.long;
      return typeof format === 'function' ? format(value) : format;
    }
  }

  // For dates older than a week, return formatted date
  if (short) {
    return targetDate.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
    });
  }

  return targetDate.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};
