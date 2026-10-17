import { describe, expect, it } from 'vitest';

import { createRuntimeChildRuntimeVerifier } from '#runtime-child-workers.js';
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
