import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  slowFileSystemBridgeCallThreshold,
  slowFileSystemBridgeCalls,
  timeFileSystemBridgeCall,
} from '#filesystem-bridge-slow-calls.js';

const resolveAfter = async <T>(settleDelay: number, value: T): Promise<T> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve(value);
    }, settleDelay);
  });

const rejectAfter = async (settleDelay: number, error: Error): Promise<never> =>
  new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(error);
    }, settleDelay);
  });

const newEntriesSince = (before: number): ReturnType<typeof slowFileSystemBridgeCalls> =>
  slowFileSystemBridgeCalls().filter((entry) => entry.callId >= before);

const nextCallId = (): number => (slowFileSystemBridgeCalls().at(-1)?.callId ?? -1) + 1;

describe('timeFileSystemBridgeCall', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should record a slow rejection with its code and rethrow it unchanged', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date', 'performance'] });
    const before = nextCallId();
    const failure = Object.assign(new Error('secret /private/path'), { code: 'CHANNEL_CLOSED' });
    const startedAt = Date.now();
    const pending = timeFileSystemBridgeCall(7, 'writeFileChecked', async () =>
      rejectAfter(slowFileSystemBridgeCallThreshold, failure),
    );
    const rejection = expect(pending).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(slowFileSystemBridgeCallThreshold);
    await rejection;

    expect(newEntriesSince(before)).toEqual([
      {
        callId: before,
        connectionId: 7,
        method: 'writeFileChecked',
        startedAt,
        duration: slowFileSystemBridgeCallThreshold,
        outcome: 'rejected',
        errorCode: 'CHANNEL_CLOSED',
      },
    ]);
  });

  it('should omit the code of a slow rejection that carries none', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date', 'performance'] });
    const before = nextCallId();
    const pending = timeFileSystemBridgeCall(7, 'readFile', async () =>
      rejectAfter(slowFileSystemBridgeCallThreshold, new Error('no code')),
    );
    const rejection = expect(pending).rejects.toThrow('no code');
    await vi.advanceTimersByTimeAsync(slowFileSystemBridgeCallThreshold);
    await rejection;

    const [entry] = newEntriesSince(before);
    expect(entry).toMatchObject({ method: 'readFile', outcome: 'rejected' });
    expect(entry !== undefined && 'errorCode' in entry).toBe(false);
  });

  it('should retain only the most recent 50 slow calls', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date', 'performance'] });
    const calls = Array.from({ length: 51 }, async (_, index) =>
      timeFileSystemBridgeCall(index, 'exists', async () => resolveAfter(slowFileSystemBridgeCallThreshold, true)),
    );
    await vi.advanceTimersByTimeAsync(slowFileSystemBridgeCallThreshold);
    await expect(Promise.all(calls)).resolves.toHaveLength(51);

    const retained = slowFileSystemBridgeCalls();
    expect(retained).toHaveLength(50);
    expect(retained.map((entry) => entry.connectionId)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });
});
