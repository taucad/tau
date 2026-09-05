import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZooSessionMeter } from '#api/kernels/zoo-session-meter.js';
import type { ZooSessionMeterDeps } from '#api/kernels/zoo-session-meter.js';

type Harness = {
  meter: ZooSessionMeter;
  debit: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

const createMeter = (options: { balanceMicro?: bigint; rate?: bigint } = {}): Harness => {
  const debit = vi.fn().mockResolvedValue({ balanceMicro: options.balanceMicro ?? 10_000_000n });
  const close = vi.fn();
  const deps: ZooSessionMeterDeps = {
    creditLedgerService: { debit } as unknown as ZooSessionMeterDeps['creditLedgerService'],
    metricsService: {
      billingCreditCommitted: { add: vi.fn() },
      billingCommitFailures: { add: vi.fn() },
    } as unknown as ZooSessionMeterDeps['metricsService'],
    userId: 'u_zoo',
    ratePerMinuteMicro: options.rate ?? 650_000n,
    close,
  };
  return { meter: new ZooSessionMeter(deps), debit, close };
};

/** Flushes the microtask queue so fire-and-forget debits settle under fake timers. */
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('ZooSessionMeter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should charge each STARTED engine minute from the auth marker (S50)', async () => {
    const { meter, debit } = createMeter();

    meter.onAuthenticated();
    await flush();
    expect(debit).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(debit).toHaveBeenCalledTimes(3);
    expect(debit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u_zoo', amountMicro: 650_000n, category: 'zoo_engine' }),
    );
    const firstInput = debit.mock.calls[0]?.[0] as { note: string };
    expect(firstInput.note).toMatch(/^zoo-session:/);
    meter.stop();
  });

  it('should settle the exhausting minute then closes with the typed insufficient code (S51)', async () => {
    const { meter, debit, close } = createMeter({ balanceMicro: -50_000n });

    meter.onAuthenticated();
    await flush();

    expect(debit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(4402, 'INSUFFICIENT_CREDITS');

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(debit).toHaveBeenCalledTimes(1);
  });

  it('should close after five idle minutes; client activity resets the window (S52)', async () => {
    const { meter, close } = createMeter();
    meter.onAuthenticated();
    await flush();

    // Activity at minute 4 defers the idle close past the naive deadline.
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    meter.onClientActivity();
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000 + 1);
    expect(close).toHaveBeenCalledWith(4408, 'IDLE_TIMEOUT');
  });

  it('should stop charging at teardown with every started minute settled (S53 abrupt drop)', async () => {
    const { meter, debit } = createMeter();
    meter.onAuthenticated();
    await flush();

    // Abrupt drop mid-third-minute: minutes 1..3 started, all charged.
    await vi.advanceTimersByTimeAsync(2 * 60_000 + 30_000);
    meter.stop();

    expect(meter.chargedMinutes).toBe(3);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(debit).toHaveBeenCalledTimes(3);
  });

  it('should never meter when the configured rate is zero (metering disabled)', async () => {
    const { meter, debit, close } = createMeter({ rate: 0n });
    meter.onAuthenticated();
    await flush();

    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(debit).not.toHaveBeenCalled();

    // The idle window still applies — an unmetered session is not a free tunnel.
    await vi.advanceTimersByTimeAsync(2 * 60_000 + 1);
    expect(close).toHaveBeenCalledWith(4408, 'IDLE_TIMEOUT');
  });

  it('should fail open on transient debit errors without killing the session', async () => {
    const { meter, debit, close } = createMeter();
    debit.mockRejectedValueOnce(new Error('redis blip'));

    meter.onAuthenticated();
    await flush();
    expect(close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(debit).toHaveBeenCalledTimes(2);
    meter.stop();
  });
});
