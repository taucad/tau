import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('timeFileSystemBridgeCall', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should record a slow rejection with its code and rethrow it unchanged', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
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

it('should expose the same slow operation while pending and after settlement', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  const gate = Promise.withResolvers<string>();
  const call = timeFileSystemBridgeCall(991, 'writeFileChecked', async () => gate.promise);
  try {
    await vi.advanceTimersByTimeAsync(slowFileSystemBridgeCallThreshold);
    const pending = slowFileSystemBridgeCalls().find((entry) => entry.connectionId === 991);
    expect(pending).toMatchObject({ method: 'writeFileChecked', outcome: 'pending', duration: 2000 });
    await vi.advanceTimersByTimeAsync(3000);
    expect(slowFileSystemBridgeCalls().find((entry) => entry.connectionId === 991)).toMatchObject({
      callId: pending!.callId,
      duration: 5000,
    });
    gate.resolve('saved');
    await expect(call).resolves.toBe('saved');
    expect(slowFileSystemBridgeCalls().filter((entry) => entry.connectionId === 991)).toEqual([
      expect.objectContaining({ callId: pending!.callId, outcome: 'resolved', duration: 5000 }),
    ]);
  } finally {
    gate.resolve('saved');
    await call;
    vi.useRealTimers();
  }
});

it('should bound pending retention and isolate a failed sink without leaking arguments or raw errors', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  const gates = Array.from({ length: 55 }, () => Promise.withResolvers<void>());
  const calls = gates.map(async (gate, index) =>
    timeFileSystemBridgeCall(2000 + index, 'exists', async () => gate.promise),
  );
  try {
    await vi.advanceTimersByTimeAsync(2000);
    expect(slowFileSystemBridgeCalls()).toHaveLength(50);
    expect(slowFileSystemBridgeCalls().every((entry) => entry.outcome === 'pending')).toBe(true);
    const sink = vi.mocked(console.warn);
    expect(sink.mock.calls).toHaveLength(55);
    const diagnostic: unknown = JSON.parse(String(sink.mock.calls[0]?.[0]).replace('[filesystem-bridge] ', ''));
    expect(diagnostic).toEqual({
      callId: expect.any(Number) as unknown,
      connectionId: 2000,
      duration: 2000,
      method: 'exists',
      outcome: 'pending',
      phase: 'round-trip',
      startedAt: expect.any(Number) as unknown,
    });
    sink.mockImplementation(() => {
      throw new Error('sink offline /secret');
    });
    for (const gate of gates) {
      gate.resolve();
    }
    await expect(Promise.all(calls)).resolves.toHaveLength(55);
    expect(slowFileSystemBridgeCalls().every((entry) => entry.outcome === 'resolved')).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.stringify(slowFileSystemBridgeCalls())).not.toContain('secret');
  } finally {
    for (const gate of gates) {
      gate.resolve();
    }
    await Promise.all(calls);
    vi.useRealTimers();
  }
});

it('should report the machine code to the existing console sink without the error message', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] });
  const gate = Promise.withResolvers<void>();
  const call = timeFileSystemBridgeCall(3000, 'writeFileChecked', async () => gate.promise);
  const failure = Object.assign(new Error('private file contents'), { code: 'CHANNEL_CLOSED' });
  const outcome = expect(call).rejects.toBe(failure);
  try {
    await vi.advanceTimersByTimeAsync(2000);
    gate.reject(failure);
    await outcome;
    const diagnostic = String(vi.mocked(console.warn).mock.calls.at(-1)?.[0]);
    expect(diagnostic).toContain('CHANNEL_CLOSED');
    expect(diagnostic).not.toContain('private file contents');
    expect(diagnostic).toContain('"outcome":"rejected"');
  } finally {
    gate.resolve();
    vi.useRealTimers();
  }
});
