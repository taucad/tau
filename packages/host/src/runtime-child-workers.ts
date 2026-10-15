/**
 * The runtime child's half of native worker brokering (D37, North Star S2).
 *
 * The runtime child runs project code under Node's permission model without `--allow-child-process`, so it cannot
 * start a native kernel's worker itself. It asks its daemon instead, over the IPC channel it was forked with: the
 * daemon checks that the launch comes from a closure sealed in the payload store, verifies it, wraps it in the OS
 * sandbox and spawns it (`runtime-child-supervisor.ts`), then carries the worker's pipes back here. This module is
 * that request and those pipes, shaped as `@taucad/native-process-core`'s `NativeWorkerProcess`, so a child installs
 * it with `installNativeWorkerLauncher` and every native session it runs launches through the daemon.
 *
 * @module
 */
import { PassThrough, Writable } from 'node:stream';

import type { RuntimeChildWorker, RuntimeChildWorkerLaunch } from '#runtime-child-supervisor.js';

/** The IPC channel a forked child talks to its parent over; `process` in a runtime child. @public */
export type RuntimeChildChannel = {
  readonly connected: boolean;
  send?: ((message: Readonly<Record<string, unknown>>) => boolean) | undefined;
  on(event: 'message', listener: (message: unknown) => void): unknown;
  once(event: 'disconnect', listener: () => void): unknown;
};

type Pending = {
  readonly started: PromiseWithResolvers<void>;
  readonly ended: PromiseWithResolvers<Awaited<RuntimeChildWorker['ended']>>;
  readonly stdout: PassThrough;
  readonly stderr: PassThrough;
};

const field = (message: unknown, name: string): unknown =>
  typeof message === 'object' && message !== null ? Reflect.get(message, name) : undefined;

/**
 * A native worker launcher that asks the daemon to start each worker on this child's behalf.
 *
 * @param channel - The child's IPC channel; defaults to `process`.
 * @returns The launcher: it resolves once the daemon started the worker, and rejects with the daemon's refusal
 *   (a closure that is not sealed, a failed digest, a sandbox that could not start) when it did not.
 * @public
 *
 * @example <caption>Launch every native worker of a runtime child through its daemon</caption>
 * ```typescript
 * import { installNativeWorkerLauncher } from '@taucad/native-process-core';
 * import { createRuntimeChildWorkerLauncher } from '@taucad/host/runtime-host';
 *
 * installNativeWorkerLauncher(createRuntimeChildWorkerLauncher());
 * ```
 */
export const createRuntimeChildWorkerLauncher = (
  channel: RuntimeChildChannel = process as RuntimeChildChannel,
): ((launch: RuntimeChildWorkerLaunch) => Promise<RuntimeChildWorker>) => {
  const workers = new Map<string, Pending>();
  let launches = 0;
  const send = (frame: Readonly<Record<string, unknown>>): void => {
    if (channel.connected) {
      channel.send?.(frame);
    }
  };
  const settle = (id: string, pending: Pending, end: Awaited<Pending['ended']['promise']>): void => {
    workers.delete(id);
    pending.stdout.end();
    pending.stderr.end();
    pending.started.reject(new Error('The native worker ended before it started.'));
    pending.ended.resolve(end);
  };
  channel.on('message', (message) => {
    const type = field(message, 'type');
    const id = field(message, 'id');
    const pending = typeof id === 'string' ? workers.get(id) : undefined;
    if (pending === undefined || typeof type !== 'string' || !type.startsWith('native-worker:')) {
      return;
    }
    const data = field(message, 'data');
    if (type === 'native-worker:started') {
      pending.started.resolve();
    } else if (type === 'native-worker:refused') {
      workers.delete(id as string);
      pending.started.reject(new Error(String(field(message, 'message'))));
    } else if ((type === 'native-worker:stdout' || type === 'native-worker:stderr') && typeof data === 'string') {
      (type === 'native-worker:stdout' ? pending.stdout : pending.stderr).write(Buffer.from(data, 'base64'));
    } else if (type === 'native-worker:exit') {
      const failure = field(message, 'message');
      const exitCode = field(message, 'exitCode');
      const signal = field(message, 'signal');
      settle(
        id as string,
        pending,
        typeof failure === 'string'
          ? { error: new Error(failure) }
          : {
              ...(typeof exitCode === 'number' ? { exitCode } : {}),
              ...(typeof signal === 'string' ? { signal: signal as NodeJS.Signals } : {}),
            },
      );
    }
  });
  /* The daemon is gone, and with it every worker it started for this child. */
  channel.once('disconnect', () => {
    for (const [id, pending] of workers) {
      settle(id, pending, { error: new Error('Tau Host stopped while the native worker ran.') });
    }
  });
  return async (launch) => {
    if (!channel.connected) {
      throw new Error('This runtime child has no Tau Host to start its native worker.');
    }
    launches += 1;
    const id = String(launches);
    const pending: Pending = {
      started: Promise.withResolvers(),
      ended: Promise.withResolvers(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    };
    workers.set(id, pending);
    send({ type: 'native-worker:launch', id, launch });
    await pending.started.promise;
    const stdin = new Writable({
      write: (chunk: Uint8Array<ArrayBuffer>, _encoding, callback) => {
        send({ type: 'native-worker:stdin', id, data: Buffer.from(chunk).toString('base64') });
        callback();
      },
      final: (callback) => {
        send({ type: 'native-worker:stdin-end', id });
        callback();
      },
    });
    return {
      stdin,
      stdout: pending.stdout,
      stderr: pending.stderr,
      ended: pending.ended.promise,
      terminate: async () => {
        send({ type: 'native-worker:terminate', id });
        await pending.ended.promise;
      },
    };
  };
};
