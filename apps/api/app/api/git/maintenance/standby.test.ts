import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { holdInStandby } from '#api/git/maintenance/standby.js';

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
        retryDelay: 0,
      }),
    ).rejects.toThrow("Maintenance standby check 'database' failed");

    expect(later).not.toHaveBeenCalled();
    expect(report.mock.calls.map(([line]) => JSON.parse(line) as unknown)).toEqual([
      { event: 'revisions_maintenance.standby_failed', check: 'database', error: 'TypeError' },
    ]);
  });

  it('should retry a check that fails transiently before verifying it', async () => {
    const stop = new AbortController();
    const report = vi.fn<(line: string) => void>();
    const database = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('connection terminated unexpectedly'))
      .mockResolvedValue('ok');

    const held = holdInStandby({ checks: { database }, signal: stop.signal, report, retryDelay: 0 });
    await vi.waitFor(() => {
      expect(report).toHaveBeenCalledTimes(1);
    });

    expect(database).toHaveBeenCalledTimes(2);
    expect(JSON.parse(report.mock.calls[0]?.[0] ?? '{}')).toEqual({
      event: 'revisions_maintenance.standby',
      verified: ['database'],
    });
    stop.abort();
    await held;
  });

  it('should return at once when already stopped', async () => {
    const stop = new AbortController();
    stop.abort();

    await expect(holdInStandby({ checks: {}, signal: stop.signal, report: () => undefined })).resolves.toBeUndefined();
  });
});
