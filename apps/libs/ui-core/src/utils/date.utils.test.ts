import process from 'node:process';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatExportDate, formatRelativeTime } from '#utils/date.utils.js';

describe('formatExportDate', () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland';
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-08T10:29:19Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats date in human-readable export format', () => {
    expect(formatExportDate(new Date())).toBe('2/8/2026 at 23:29:19 GMT+13');
  });
});

describe('formatRelativeTime', () => {
  beforeEach(() => {
    // Mock Date to a fixed point in time: January 15, 2025, 12:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('long format (default)', () => {
    it('should return "just now" for less than 5 seconds ago', () => {
      const date = new Date('2025-01-15T11:59:57Z'); // 3 seconds ago
      expect(formatRelativeTime(date)).toBe('just now');
    });

    it('should return seconds ago for 5-59 seconds', () => {
      const date = new Date('2025-01-15T11:59:33Z'); // 27 seconds ago
      expect(formatRelativeTime(date)).toBe('27 seconds ago');
    });

    it('should return "a minute ago" for exactly 1 minute', () => {
      const date = new Date('2025-01-15T11:59:00Z'); // 1 minute ago
      expect(formatRelativeTime(date)).toBe('a minute ago');
    });

    it('should return minutes ago for 2-59 minutes', () => {
      const date = new Date('2025-01-15T11:58:00Z'); // 2 minutes ago
      expect(formatRelativeTime(date)).toBe('2 minutes ago');
    });

    it('should return "an hour ago" for exactly 1 hour', () => {
      const date = new Date('2025-01-15T11:00:00Z'); // 1 hour ago
      expect(formatRelativeTime(date)).toBe('an hour ago');
    });

    it('should return hours ago for 2-23 hours', () => {
      const date = new Date('2025-01-15T07:00:00Z'); // 5 hours ago
      expect(formatRelativeTime(date)).toBe('5 hours ago');
    });

    it('should return "yesterday" for exactly 1 day ago', () => {
      const date = new Date('2025-01-14T12:00:00Z'); // 1 day ago
      expect(formatRelativeTime(date)).toBe('yesterday');
    });

    it('should return days ago for 2-6 days', () => {
      const date = new Date('2025-01-12T12:00:00Z'); // 3 days ago
      expect(formatRelativeTime(date)).toBe('3 days ago');
    });

    it('should return formatted date for more than a week ago', () => {
      const date = new Date('2025-01-01T12:00:00Z'); // 14 days ago
      // Date formatting depends on local timezone, so we match the pattern
      expect(formatRelativeTime(date)).toMatch(/^January \d{1,2}, 2025$/);
    });

    it('should accept a timestamp number', () => {
      const timestamp = new Date('2025-01-15T11:58:00Z').getTime(); // 2 minutes ago
      expect(formatRelativeTime(timestamp)).toBe('2 minutes ago');
    });
  });

  describe('short format', () => {
    it('should return "Now" for less than 5 seconds ago', () => {
      const date = new Date('2025-01-15T11:59:57Z'); // 3 seconds ago
      expect(formatRelativeTime(date, { short: true })).toBe('Now');
    });

    it('should return seconds with "s" suffix for 5-59 seconds', () => {
      const date = new Date('2025-01-15T11:59:33Z'); // 27 seconds ago
      expect(formatRelativeTime(date, { short: true })).toBe('27s');
    });

    it('should return "1m" for exactly 1 minute', () => {
      const date = new Date('2025-01-15T11:59:00Z'); // 1 minute ago
      expect(formatRelativeTime(date, { short: true })).toBe('1m');
    });

    it('should return minutes with "m" suffix for 2-59 minutes', () => {
      const date = new Date('2025-01-15T11:58:00Z'); // 2 minutes ago
      expect(formatRelativeTime(date, { short: true })).toBe('2m');
    });

    it('should return "1h" for exactly 1 hour', () => {
      const date = new Date('2025-01-15T11:00:00Z'); // 1 hour ago
      expect(formatRelativeTime(date, { short: true })).toBe('1h');
    });

    it('should return hours with "h" suffix for 2-23 hours', () => {
      const date = new Date('2025-01-15T07:00:00Z'); // 5 hours ago
      expect(formatRelativeTime(date, { short: true })).toBe('5h');
    });

    it('should return "1d" for exactly 1 day ago', () => {
      const date = new Date('2025-01-14T12:00:00Z'); // 1 day ago
      expect(formatRelativeTime(date, { short: true })).toBe('1d');
    });

    it('should return days with "d" suffix for 2-6 days', () => {
      const date = new Date('2025-01-12T12:00:00Z'); // 3 days ago
      expect(formatRelativeTime(date, { short: true })).toBe('3d');
    });

    it('should return short formatted date for more than a week ago', () => {
      const date = new Date('2025-01-01T12:00:00Z'); // 14 days ago
      // Date formatting depends on local timezone, so we match the pattern
      expect(formatRelativeTime(date, { short: true })).toMatch(/^Jan \d{1,2}$/);
    });

    it('should accept a timestamp number', () => {
      const timestamp = new Date('2025-01-15T11:58:00Z').getTime(); // 2 minutes ago
      expect(formatRelativeTime(timestamp, { short: true })).toBe('2m');
    });
  });
});
