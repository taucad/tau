import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paymentsLeft, recordPayment } from '#support/budget.js';
import { runDirectory } from '#support/results.js';

const fs = vi.hoisted(() => ({
  mkdir: vi.fn<() => Promise<undefined>>(async () => undefined),
  readFile: vi.fn<() => Promise<string>>(),
  writeFile: vi.fn<() => Promise<void>>(async () => undefined),
  rename: vi.fn<() => Promise<void>>(async () => undefined),
}));
vi.mock('node:fs/promises', () => fs);

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

describe('recordPayment', () => {
  const ledgerPath = join(runDirectory, 'payments.json');

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should write the ledger beside the old one and rename it into place, so no reader meets a torn file', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify([booked('TU-01')]));

    await recordPayment('TU-04', 'cs_test_leg1');

    expect(fs.writeFile).toHaveBeenCalledOnce();
    const [replacement, content] = fs.writeFile.mock.calls[0] as unknown as [string, string];
    expect(replacement).not.toBe(ledgerPath);
    expect(dirname(replacement)).toBe(runDirectory);
    expect(JSON.parse(content)).toStrictEqual([
      booked('TU-01'),
      { row: 'TU-04', reference: 'cs_test_leg1', at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/u) as string },
    ]);
    expect(fs.rename).toHaveBeenCalledExactlyOnceWith(replacement, ledgerPath);
    expect(fs.rename.mock.invocationCallOrder[0]).toBeGreaterThan(fs.writeFile.mock.invocationCallOrder[0] ?? 0);
  });

  it('should start a ledger from the first payment when none exists yet', async () => {
    fs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await recordPayment('TU-01', 'cs_test_first');

    expect(fs.mkdir).toHaveBeenCalledExactlyOnceWith(runDirectory, { recursive: true });
    const [, content] = fs.writeFile.mock.calls[0] as unknown as [string, string];
    expect(JSON.parse(content)).toMatchObject([{ row: 'TU-01', reference: 'cs_test_first' }]);
    expect(fs.rename).toHaveBeenCalledOnce();
  });
});
