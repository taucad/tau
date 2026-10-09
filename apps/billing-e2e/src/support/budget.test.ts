import { describe, expect, it } from 'vitest';
import { paymentsLeft } from '#support/budget.js';

const booked = (row: string) => ({ row, reference: `cs_test_${row}`, at: '2026-10-09T10:00:00.000Z' });

describe('paymentsLeft', () => {
  it('should allow each paying row one payment and TU-04 one per leg', () => {
    expect(paymentsLeft([], 'TU-01')).toBe(1);
    expect(paymentsLeft([], 'TU-04')).toBe(2);
    expect(paymentsLeft([booked('TU-04')], 'TU-04')).toBe(1);
  });

  it('should leave nothing to a row that has paid or never pays', () => {
    expect(paymentsLeft([booked('TU-01')], 'TU-01')).toBe(0);
    expect(paymentsLeft([booked('TU-01'), booked('TU-01')], 'TU-01')).toBe(0);
    expect(paymentsLeft([], 'TU-05')).toBe(0);
  });

  it('should count only the payments of the row asked about', () => {
    expect(paymentsLeft([booked('TU-01'), booked('TU-03')], 'TU-06')).toBe(1);
  });
});
