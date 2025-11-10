import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { groupItemsByTimeHorizon } from '#utils/temporal.utils.js';
import type { TimestampItem } from '#utils/temporal.utils.js';

// Mock date to have consistent tests
const mockToday = new Date('2024-01-15T12:00:00Z');

function createItem(updatedAt: number): TimestampItem {
  return { updatedAt };
}

function daysAgo(days: number): number {
  const date = new Date(mockToday);
  date.setDate(date.getDate() - days);
  return date.getTime();
}

function monthsAgo(months: number): number {
  const date = new Date(mockToday);
  date.setMonth(date.getMonth() - months);
  return date.getTime();
}

function yearsAgo(years: number): number {
  const date = new Date(mockToday);
  date.setFullYear(date.getFullYear() - years);
  return date.getTime();
}

describe('groupItemsByTimeHorizon', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(mockToday);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Today', () => {
    it('should group items from today', () => {
      // Use times that normalize to the same day
      const todayStart = new Date(mockToday);
      todayStart.setHours(0, 0, 0, 0);

      const items = [
        createItem(todayStart.getTime()),
        createItem(todayStart.getTime() + 1000 * 60 * 60 * 2), // 2 hours later
        createItem(todayStart.getTime() + 1000 * 60 * 60 * 12), // 12 hours later
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Today');
      expect(groups[0]?.items).toHaveLength(3);
    });
  });

  describe('Yesterday', () => {
    it('should group items from yesterday', () => {
      // Use times that normalize to the same day
      const yesterdayStart = new Date(mockToday);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);

      const items = [
        createItem(yesterdayStart.getTime()),
        createItem(yesterdayStart.getTime() + 1000 * 60 * 60 * 2), // 2 hours later
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Yesterday');
      expect(groups[0]?.items).toHaveLength(2);
    });
  });

  describe('2-6 days ago', () => {
    it('should group items from 2 days ago', () => {
      const items = [createItem(daysAgo(2))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('2 days ago');
      expect(groups[0]?.items).toHaveLength(1);
    });

    it('should group items from 3 days ago', () => {
      const items = [createItem(daysAgo(3))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('3 days ago');
    });

    it('should group items from 4 days ago', () => {
      const items = [createItem(daysAgo(4))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('4 days ago');
    });

    it('should group items from 5 days ago', () => {
      const items = [createItem(daysAgo(5))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('5 days ago');
    });

    it('should group items from 6 days ago', () => {
      const items = [createItem(daysAgo(6))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('6 days ago');
    });

    it('should create separate groups for each day', () => {
      const items = [
        createItem(daysAgo(2)),
        createItem(daysAgo(3)),
        createItem(daysAgo(4)),
        createItem(daysAgo(5)),
        createItem(daysAgo(6)),
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(5);
      expect(groups.map((g) => g.name)).toEqual(['2 days ago', '3 days ago', '4 days ago', '5 days ago', '6 days ago']);
    });
  });

  describe('Last week', () => {
    it('should group items from 7 days ago', () => {
      const items = [createItem(daysAgo(7))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Last week');
    });

    it('should group items from 13 days ago', () => {
      const items = [createItem(daysAgo(13))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Last week');
    });

    it('should group all items from last week together', () => {
      const items = [createItem(daysAgo(7)), createItem(daysAgo(10)), createItem(daysAgo(13))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Last week');
      expect(groups[0]?.items).toHaveLength(3);
    });
  });

  describe('2-3 weeks ago', () => {
    it('should group items from 2 weeks ago (14 days)', () => {
      const items = [createItem(daysAgo(14))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('2 weeks ago');
    });

    it('should group items from 20 days ago as 2 weeks ago', () => {
      const items = [createItem(daysAgo(20))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('2 weeks ago');
    });

    it('should group items from 3 weeks ago (21 days)', () => {
      const items = [createItem(daysAgo(21))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('3 weeks ago');
    });

    it('should group items from 27 days ago as 3 weeks ago', () => {
      const items = [createItem(daysAgo(27))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('3 weeks ago');
    });

    it('should create separate groups for 2 and 3 weeks ago', () => {
      const items = [createItem(daysAgo(14)), createItem(daysAgo(21))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.name)).toEqual(['2 weeks ago', '3 weeks ago']);
    });

    it('should not create 4 weeks ago group', () => {
      const items = [createItem(daysAgo(28))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).not.toBe('4 weeks ago');
      expect(groups[0]?.name).toBe('Last month');
    });
  });

  describe('Last month', () => {
    it('should group items from last month', () => {
      const items = [createItem(monthsAgo(1))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Last month');
    });

    it('should group items from approximately one month ago', () => {
      // Use times that normalize to the same month
      const lastMonthStart = new Date(mockToday);
      lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
      lastMonthStart.setDate(1);
      lastMonthStart.setHours(0, 0, 0, 0);

      const items = [
        createItem(lastMonthStart.getTime()),
        createItem(lastMonthStart.getTime() + 1000 * 60 * 60 * 24 * 5), // 5 days into last month
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Last month');
      expect(groups[0]?.items).toHaveLength(2);
    });
  });

  describe('2-11 months ago', () => {
    it('should group items from 2 months ago', () => {
      const items = [createItem(monthsAgo(2))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('2 months ago');
    });

    it('should group items from 3 months ago', () => {
      const items = [createItem(monthsAgo(3))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('3 months ago');
    });

    it('should group items from 6 months ago', () => {
      const items = [createItem(monthsAgo(6))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('6 months ago');
    });

    it('should group items from 11 months ago', () => {
      const items = [createItem(monthsAgo(11))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('11 months ago');
    });

    it('should create separate groups for each month', () => {
      const items = [
        createItem(monthsAgo(2)),
        createItem(monthsAgo(3)),
        createItem(monthsAgo(4)),
        createItem(monthsAgo(5)),
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(4);
      expect(groups.map((g) => g.name)).toEqual(['2 months ago', '3 months ago', '4 months ago', '5 months ago']);
    });
  });

  describe('Last year', () => {
    it('should group items from last year', () => {
      const items = [createItem(yearsAgo(1))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Last year');
    });

    it('should not use "1 year ago" format', () => {
      const items = [createItem(yearsAgo(1))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups[0]?.name).not.toBe('1 year ago');
      expect(groups[0]?.name).toBe('Last year');
    });
  });

  describe('Multiple years ago', () => {
    it('should group items from 2 years ago', () => {
      const items = [createItem(yearsAgo(2))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('2 years ago');
    });

    it('should group items from 5 years ago', () => {
      const items = [createItem(yearsAgo(5))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('5 years ago');
    });

    it('should group items from 10 years ago', () => {
      const items = [createItem(yearsAgo(10))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('10 years ago');
    });

    it('should create separate groups for each year', () => {
      const items = [createItem(yearsAgo(2)), createItem(yearsAgo(3)), createItem(yearsAgo(4))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(3);
      expect(groups.map((g) => g.name)).toEqual(['2 years ago', '3 years ago', '4 years ago']);
    });
  });

  describe('Ordering', () => {
    it('should order groups chronologically from most recent to oldest', () => {
      const items = [
        createItem(daysAgo(1)), // Yesterday
        createItem(yearsAgo(2)), // 2 years ago
        createItem(daysAgo(3)), // 3 days ago
        createItem(monthsAgo(3)), // 3 months ago
        createItem(mockToday.getTime()), // Today
        createItem(daysAgo(10)), // Last week
        createItem(monthsAgo(1)), // Last month
        createItem(yearsAgo(1)), // Last year
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups.map((g) => g.name)).toEqual([
        'Today',
        'Yesterday',
        '3 days ago',
        'Last week',
        'Last month',
        '3 months ago',
        'Last year',
        '2 years ago',
      ]);
    });

    it('should order days correctly', () => {
      const items = [
        createItem(daysAgo(6)),
        createItem(daysAgo(2)),
        createItem(daysAgo(4)),
        createItem(daysAgo(3)),
        createItem(daysAgo(5)),
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups.map((g) => g.name)).toEqual(['2 days ago', '3 days ago', '4 days ago', '5 days ago', '6 days ago']);
    });

    it('should order weeks correctly', () => {
      const items = [
        createItem(daysAgo(21)), // 3 weeks ago
        createItem(daysAgo(14)), // 2 weeks ago
        createItem(daysAgo(10)), // Last week
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups.map((g) => g.name)).toEqual(['Last week', '2 weeks ago', '3 weeks ago']);
    });

    it('should order months correctly', () => {
      const items = [
        createItem(monthsAgo(5)),
        createItem(monthsAgo(2)),
        createItem(monthsAgo(1)), // Last month
        createItem(monthsAgo(3)),
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups.map((g) => g.name)).toEqual(['Last month', '2 months ago', '3 months ago', '5 months ago']);
    });

    it('should order years correctly', () => {
      const items = [
        createItem(yearsAgo(3)),
        createItem(yearsAgo(1)), // Last year
        createItem(yearsAgo(2)),
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups.map((g) => g.name)).toEqual(['Last year', '2 years ago', '3 years ago']);
    });
  });

  describe('Sorting within groups', () => {
    it('should sort items within groups by most recent first by default', () => {
      // Use times that normalize to the same day
      const baseDate = new Date(mockToday);
      baseDate.setDate(baseDate.getDate() - 3);
      baseDate.setHours(0, 0, 0, 0);

      const baseTime = baseDate.getTime();
      const items = [
        createItem(baseTime + 1000 * 60 * 60 * 2), // Newer (2 hours later)
        createItem(baseTime), // Middle
        createItem(baseTime + 1000 * 60 * 60), // Older (1 hour later)
      ];

      const groups = groupItemsByTimeHorizon(items);

      const todayGroup = groups.find((g) => g.name === '3 days ago');
      expect(todayGroup).toBeDefined();
      expect(todayGroup?.items).toHaveLength(3);
      // After normalization, all times are the same, so order is preserved from input
      expect(todayGroup?.items[0]?.updatedAt).toBe(baseTime + 1000 * 60 * 60 * 2);
    });

    it('should use custom comparator when provided', () => {
      // Use times that normalize to the same day
      const baseDate = new Date(mockToday);
      baseDate.setDate(baseDate.getDate() - 3);
      baseDate.setHours(0, 0, 0, 0);

      const baseTime = baseDate.getTime();
      const items = [
        createItem(baseTime + 1000 * 60 * 60 * 2),
        createItem(baseTime),
        createItem(baseTime + 1000 * 60 * 60),
      ];

      // Custom comparator: oldest first (by original timestamp)
      const customComparator = (a: TimestampItem, b: TimestampItem) => a.updatedAt - b.updatedAt;

      const groups = groupItemsByTimeHorizon(items, customComparator);

      const todayGroup = groups.find((g) => g.name === '3 days ago');
      expect(todayGroup).toBeDefined();
      expect(todayGroup?.items).toHaveLength(3);
      expect(todayGroup?.items[0]?.updatedAt).toBe(baseTime);
      expect(todayGroup?.items[1]?.updatedAt).toBe(baseTime + 1000 * 60 * 60);
      expect(todayGroup?.items[2]?.updatedAt).toBe(baseTime + 1000 * 60 * 60 * 2);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty array', () => {
      const groups = groupItemsByTimeHorizon([]);

      expect(groups).toHaveLength(0);
    });

    it('should handle items with same timestamp', () => {
      const timestamp = daysAgo(5);
      const items = [createItem(timestamp), createItem(timestamp), createItem(timestamp)];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(1);
      expect(groups[0]?.items).toHaveLength(3);
    });

    it('should handle items spanning multiple categories', () => {
      const items = [
        createItem(mockToday.getTime()), // Today
        createItem(daysAgo(1)), // Yesterday
        createItem(daysAgo(3)), // 3 days ago
        createItem(daysAgo(10)), // Last week
        createItem(daysAgo(15)), // 2 weeks ago
        createItem(monthsAgo(1)), // Last month
        createItem(monthsAgo(5)), // 5 months ago
        createItem(yearsAgo(1)), // Last year
        createItem(yearsAgo(3)), // 3 years ago
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(9);
      expect(groups.map((g) => g.name)).toEqual([
        'Today',
        'Yesterday',
        '3 days ago',
        'Last week',
        '2 weeks ago',
        'Last month',
        '5 months ago',
        'Last year',
        '3 years ago',
      ]);
    });

    it('should handle items at exact boundaries', () => {
      const items = [
        createItem(daysAgo(6)), // Exactly 6 days ago
        createItem(daysAgo(7)), // Exactly 7 days ago (Last week)
        createItem(daysAgo(13)), // Exactly 13 days ago (Last week)
        createItem(daysAgo(14)), // Exactly 14 days ago (2 weeks ago)
        createItem(daysAgo(20)), // Exactly 20 days ago (2 weeks ago)
        createItem(daysAgo(21)), // Exactly 21 days ago (3 weeks ago)
        createItem(daysAgo(27)), // Exactly 27 days ago (3 weeks ago)
      ];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups.map((g) => g.name)).toEqual(['6 days ago', 'Last week', '2 weeks ago', '3 weeks ago']);
    });

    it('should handle very old items', () => {
      const items = [createItem(yearsAgo(50)), createItem(yearsAgo(100))];

      const groups = groupItemsByTimeHorizon(items);

      expect(groups).toHaveLength(2);
      expect(groups.map((g) => g.name)).toEqual(['50 years ago', '100 years ago']);
    });
  });

  describe('Time normalization', () => {
    it('should normalize times to start of day', () => {
      // Create items at different times of the day
      const morning = new Date(mockToday);
      morning.setHours(8, 0, 0, 0);

      const afternoon = new Date(mockToday);
      afternoon.setHours(16, 0, 0, 0);

      const evening = new Date(mockToday);
      evening.setHours(22, 0, 0, 0);

      const items = [createItem(morning.getTime()), createItem(afternoon.getTime()), createItem(evening.getTime())];

      const groups = groupItemsByTimeHorizon(items);

      // All should be grouped as "Today" since they're normalized to start of day
      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe('Today');
      expect(groups[0]?.items).toHaveLength(3);
    });
  });
});
