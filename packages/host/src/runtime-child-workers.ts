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

import type {
  RuntimeChildRuntimeDamage,
  RuntimeChildWorker,
  RuntimeChildWorkerLaunch,
} from '#runtime-child-supervisor.js';

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

/**
 * A native runtime verifier that asks the daemon to re-verify a closure on this child's behalf (D8, ruling X35).
 *
 * A native session re-verifies its runtime when its worker exits before the handshake, so the refusal names the
 * damaged files. A runtime child cannot read the payload store, so this verifier sends the runtime root to the daemon,
 * which verifies it against its receipt and answers with what differs. A daemon that refuses, fails or is gone leaves
 * the bare exit standing.
 *
 * @param channel - The child's IPC channel; defaults to `process`.
 * @returns The verifier, shaped as `@taucad/native-process-core`'s `NativeRuntimeVerifier`.
 * @public
 *
 * @example <caption>Re-verify every failed handshake of a runtime child through its daemon</caption>
 * ```typescript
 * import { installNativeRuntimeVerifier } from '@taucad/native-process-core';
 * import { createRuntimeChildRuntimeVerifier } from '@taucad/host/runtime-host';
 *
 * installNativeRuntimeVerifier(createRuntimeChildRuntimeVerifier());
 * ```
 */
export const createRuntimeChildRuntimeVerifier = (
  channel: RuntimeChildChannel = process as RuntimeChildChannel,
): ((runtimePath: string, signal: AbortSignal) => Promise<RuntimeChildRuntimeDamage | undefined>) => {
  const pending = new Map<string, (damage: RuntimeChildRuntimeDamage | undefined) => void>();
  let requests = 0;
  channel.on('message', (message) => {
    const id = field(message, 'id');
    const answer = typeof id === 'string' ? pending.get(id) : undefined;
    if (field(message, 'type') !== 'native-worker:verified' || answer === undefined) {
      return;
    }
    const files = field(message, 'files');
    const remedy = field(message, 'remedy');
    answer(
      Array.isArray(files) && files.every((file) => typeof file === 'string') && typeof remedy === 'string'
        ? { files, remedy }
        : undefined,
    );
  });
  channel.once('disconnect', () => {
    for (const answer of pending.values()) {
      answer(undefined);
    }
  });
  return async (runtimePath, signal) => {
    if (!channel.connected || signal.aborted) {
      return undefined;
    }
    requests += 1;
    const id = `verify-${String(requests)}`;
    const answered = Promise.withResolvers<RuntimeChildRuntimeDamage | undefined>();
    const onAbort = (): void => {
      answered.resolve(undefined);
    };
    pending.set(id, answered.resolve);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      channel.send?.({ type: 'native-worker:verify', id, runtimePath });
      return await answered.promise;
    } finally {
      pending.delete(id);
      signal.removeEventListener('abort', onAbort);
    }
  };
};
