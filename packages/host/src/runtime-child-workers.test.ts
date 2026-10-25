import { describe, expect, it, vi } from 'vitest';

import { createRuntimeChildRuntimeVerifier, createRuntimeChildWorkerLauncher } from '#runtime-child-workers.js';
import type { RuntimeChildChannel } from '#runtime-child-workers.js';

/** A child's IPC channel whose parent is this test: every frame sent is recorded and answered by hand. */
const fakeChannel = (): RuntimeChildChannel & {
  readonly sent: Array<Readonly<Record<string, unknown>>>;
  answer(frame: Readonly<Record<string, unknown>>): void;
  disconnect(): void;
} => {
  const messageListeners: Array<(message: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  const sent: Array<Readonly<Record<string, unknown>>> = [];
  const channel = {
    connected: true,
    sent,
    send: (frame: Readonly<Record<string, unknown>>) => {
      sent.push(frame);
      return true;
    },
    on: (_event: 'message', listener: (message: unknown) => void) => messageListeners.push(listener),
    once: (_event: 'disconnect', listener: () => void) => disconnectListeners.push(listener),
    answer: (frame: Readonly<Record<string, unknown>>) => {
      for (const listener of messageListeners) {
        listener(frame);
      }
    },
    disconnect: () => {
      channel.connected = false;
      for (const listener of disconnectListeners.splice(0)) {
        listener();
      }
    },
  };
  return channel;
};

describe('createRuntimeChildRuntimeVerifier', () => {
  it('asks the daemon and answers with the damage it names, ignoring frames that are not its own', async () => {
    const channel = fakeChannel();
    const verify = createRuntimeChildRuntimeVerifier(channel);

    const answered = verify('/store/closures/sha256/a', new AbortController().signal);
    expect(channel.sent).toEqual([
      { type: 'native-worker:verify', id: 'verify-1', runtimePath: '/store/closures/sha256/a' },
    ]);
    channel.answer({ type: 'native-worker:exit', id: 'verify-1' });
    channel.answer({ type: 'native-worker:verified', id: 'verify-9', files: ['x'], remedy: 'y' });
    channel.answer({ type: 'native-worker:verified', id: 'verify-1', files: ['bin/python3'], remedy: 'Repair it.' });

    await expect(answered).resolves.toEqual({ files: ['bin/python3'], remedy: 'Repair it.' });
  });

  it('answers nothing for an intact closure, a refusal or a malformed answer', async () => {
    const channel = fakeChannel();
    const verify = createRuntimeChildRuntimeVerifier(channel);
    const { signal } = new AbortController();

    const intact = verify('/a', signal);
    const refused = verify('/b', signal);
    const malformed = verify('/c', signal);
    channel.answer({ type: 'native-worker:verified', id: 'verify-1' });
    channel.answer({ type: 'native-worker:verified', id: 'verify-2', message: 'not inside the payload store' });
    channel.answer({ type: 'native-worker:verified', id: 'verify-3', files: [1], remedy: 'x' });

    await expect(Promise.all([intact, refused, malformed])).resolves.toEqual([undefined, undefined, undefined]);
  });

  it('leaves the bare exit standing when aborted, disconnected, or without a daemon', async () => {
    const channel = fakeChannel();
    const verify = createRuntimeChildRuntimeVerifier(channel);
    const controller = new AbortController();

    const aborted = verify('/a', controller.signal);
    controller.abort();
    await expect(aborted).resolves.toBeUndefined();
    await expect(verify('/a', controller.signal)).resolves.toBeUndefined();

    const orphaned = verify('/b', new AbortController().signal);
    channel.disconnect();
    await expect(orphaned).resolves.toBeUndefined();
    await expect(verify('/c', new AbortController().signal)).resolves.toBeUndefined();
    /* Neither the pre-aborted nor the disconnected ask was sent. */
    expect(channel.sent.map((frame) => frame['runtimePath'])).toEqual(['/a', '/b']);
  });
});

const launch = {
  executablePath: '/store/closures/a/bin/python3',
  executableSha256: 'a'.repeat(64),
  executableName: 'Bundled Python',
  arguments: [],
  runtimePath: '/store/closures/a',
  resources: [],
  workspacePath: '/private/workspace',
  artifactPath: '/private/artifacts',
  commandId: 'Example#1',
} as const;

/**
 * Start one worker through `launcher` and let the daemon say it started.
 *
 * @param channel - The fake channel.
 * @param launcher - The launcher under test.
 * @returns The started worker.
 */
const started = async (
  channel: ReturnType<typeof fakeChannel>,
  launcher: ReturnType<typeof createRuntimeChildWorkerLauncher>,
) => {
  const worker = launcher(launch);
  channel.answer({ type: 'native-worker:started', id: '1' });
  return worker;
};

describe('createRuntimeChildWorkerLauncher resident samples', () => {
  it('sends no sample frame and gives the worker no reader when the daemon did not name the frame', async () => {
    const channel = fakeChannel();
    const worker = await started(channel, createRuntimeChildWorkerLauncher(channel));
    expect(worker.sampleResident).toBeUndefined();
    const older = await started(
      channel,
      createRuntimeChildWorkerLauncher(channel, { nativeWorkerFrames: ['native-worker:other'] }),
    );
    expect(older.sampleResident).toBeUndefined();
    expect(channel.sent.map(({ type }) => type)).toEqual(['native-worker:launch', 'native-worker:launch']);
  });

  it('asks the daemon for each sample and answers with the bytes it names, or nothing for a malformed answer', async () => {
    const channel = fakeChannel();
    const launcher = createRuntimeChildWorkerLauncher(channel, { nativeWorkerFrames: ['native-worker:sample'] });
    const worker = await started(channel, launcher);

    const first = worker.sampleResident!();
    const second = worker.sampleResident!();
    expect(channel.sent.slice(1)).toEqual([
      { type: 'native-worker:sample', id: '1', sample: '1' },
      { type: 'native-worker:sample', id: '1', sample: '2' },
    ]);
    channel.answer({ type: 'native-worker:resident', id: '1', sample: '9', bytes: 1 });
    channel.answer({ type: 'native-worker:resident', id: '1', sample: '2', bytes: -1 });
    channel.answer({ type: 'native-worker:resident', id: '1', sample: '1', bytes: 96 * 1024 * 1024 });
    await expect(Promise.all([first, second])).resolves.toEqual([96 * 1024 * 1024, undefined]);
  });

  it('answers nothing when the daemon is silent past its bound, the worker exited or the daemon is gone', async () => {
    vi.useFakeTimers();
    try {
      const channel = fakeChannel();
      const launcher = createRuntimeChildWorkerLauncher(channel, { nativeWorkerFrames: ['native-worker:sample'] });
      const worker = await started(channel, launcher);
      const silent = worker.sampleResident!();
      await vi.advanceTimersByTimeAsync(1000);
      await expect(silent).resolves.toBeUndefined();

      const exiting = worker.sampleResident!();
      channel.answer({ type: 'native-worker:exit', id: '1', exitCode: 0 });
      await expect(exiting).resolves.toBeUndefined();
      await expect(worker.sampleResident!()).resolves.toBeUndefined();

      const next = launcher(launch);
      channel.answer({ type: 'native-worker:started', id: '2' });
      const orphan = await next;
      channel.disconnect();
      await expect(orphan.sampleResident!()).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
