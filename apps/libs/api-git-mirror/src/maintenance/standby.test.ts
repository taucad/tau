import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { holdInStandby, retryingCheck } from '#maintenance/standby.js';

describe('holdInStandby (DC4)', () => {
  it('should verify every check, report once and then wait until stopped', async () => {
    const stop = new AbortController();
    const report = vi.fn<(line: string) => void>();
    const database = vi.fn(async () => 'ok');
    const storage = vi.fn(async () => 'ok');

    const held = holdInStandby({ checks: { database, storage }, signal: stop.signal, report });
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });
    const pending = Symbol('pending');

    await expect(Promise.race([held, Promise.resolve(pending)])).resolves.toBe(pending);
    expect(JSON.parse(report.mock.calls[0]?.[0] ?? '{}')).toEqual({
      event: 'revisions_maintenance.standby',
      verified: ['database', 'storage'],
    });

    stop.abort();
    await expect(held).resolves.toBeUndefined();
    expect(database).toHaveBeenCalledTimes(1);
    expect(storage).toHaveBeenCalledTimes(1);
  });

  it('should keep the process alive while it holds', async () => {
    /* A pending promise alone does not keep Node running: the worker then exits
       with code 13 ("unsettled top-level await") and Fly restarts it in a loop. */
    const timers = (): number => process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
    const before = timers();
    const stop = new AbortController();
    const report = vi.fn<(line: string) => void>();

    const held = holdInStandby({ checks: {}, signal: stop.signal, report });
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });
    expect(timers()).toBeGreaterThan(before);

    stop.abort();
    await held;
    expect(timers()).toBe(before);
  });

  it('should fail on the first broken credential, naming the check and not the error text', async () => {
    const report = vi.fn<(line: string) => void>();
    const later = vi.fn(async () => 'ok');

    await expect(
      holdInStandby({
        checks: {
          database: async () => {
            throw new TypeError('password authentication failed for user tau_maintenance: s3cr3t');
          },
          storage: later,
        },
        signal: new AbortController().signal,
        report,
      }),
    ).rejects.toThrow("Maintenance standby check 'database' failed");

    expect(later).not.toHaveBeenCalled();
    expect(report.mock.calls.map(([line]) => JSON.parse(line) as unknown)).toEqual([
      { event: 'revisions_maintenance.standby_failed', check: 'database', error: 'TypeError' },
    ]);
  });

  it('should log the error code (SQLSTATE) and name but never the message', async () => {
    const report = vi.fn<(line: string) => void>();
    const failure = Object.assign(new Error('connect postgres://tau:s3cr3t@db.internal/tau refused'), {
      name: 'PostgresError',
      code: '57P03',
    });

    await expect(
      holdInStandby({
        checks: {
          database: async () => {
            throw failure;
          },
        },
        signal: new AbortController().signal,
        report,
      }),
    ).rejects.toThrow("Maintenance standby check 'database' failed");

    expect(report.mock.calls.map(([line]) => JSON.parse(line) as unknown)).toEqual([
      { event: 'revisions_maintenance.standby_failed', check: 'database', error: 'PostgresError', code: '57P03' },
    ]);
    expect(report.mock.calls[0]?.[0]).not.toContain('s3cr3t');
  });

  it('should not log a code that is not a bare identifier', async () => {
    const report = vi.fn<(line: string) => void>();

    await expect(
      holdInStandby({
        checks: {
          database: async () => {
            throw Object.assign(new Error('refused'), { code: 'user=tau password=s3cr3t' });
          },
        },
        signal: new AbortController().signal,
        report,
      }),
    ).rejects.toThrow();

    expect(report.mock.calls.map(([line]) => JSON.parse(line) as unknown)).toEqual([
      { event: 'revisions_maintenance.standby_failed', check: 'database', error: 'Error' },
    ]);
  });

  it('should return at once when already stopped', async () => {
    const stop = new AbortController();
    stop.abort();

    await expect(holdInStandby({ checks: {}, signal: stop.signal, report: () => undefined })).resolves.toBeUndefined();
  });
});

describe('retryingCheck', () => {
  it('should pass when a transient failure is followed by success', async () => {
    const stop = new AbortController();
    const report = vi.fn<(line: string) => void>();
    const database = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce('ok');

    const held = holdInStandby({
      checks: { database: retryingCheck(database, { attempts: 3, retryDelay: 1 }) },
      signal: stop.signal,
      report,
    });
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });

    expect(JSON.parse(report.mock.calls[0]?.[0] ?? '{}')).toEqual({
      event: 'revisions_maintenance.standby',
      verified: ['database'],
    });
    expect(database).toHaveBeenCalledTimes(2);
    stop.abort();
    await held;
  });

  it('should still fail after the bounded attempts, reporting the last error code', async () => {
    const report = vi.fn<(line: string) => void>();
    const database = vi.fn(async () => {
      throw Object.assign(new Error('the database system is starting up'), { name: 'PostgresError', code: '57P03' });
    });

    await expect(
      holdInStandby({
        checks: { database: retryingCheck(database, { attempts: 3, retryDelay: 1 }) },
        signal: new AbortController().signal,
        report,
      }),
    ).rejects.toThrow("Maintenance standby check 'database' failed");

    expect(database).toHaveBeenCalledTimes(3);
    expect(report.mock.calls.map(([line]) => JSON.parse(line) as unknown)).toEqual([
      { event: 'revisions_maintenance.standby_failed', check: 'database', error: 'PostgresError', code: '57P03' },
    ]);
  });

  it('should wait the retryDelay between attempts', async () => {
    vi.useFakeTimers();
    try {
      const check = vi.fn<() => Promise<unknown>>().mockRejectedValueOnce(new Error('refused')).mockResolvedValue('ok');
      const result = retryingCheck(check, { attempts: 3, retryDelay: 2000 })();

      await vi.advanceTimersByTimeAsync(1999);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe('ok');
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
