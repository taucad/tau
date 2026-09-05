import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { z } from 'zod';

/** Milliseconds. */
const childReadyTimeout = 30_000;
/** Milliseconds. */
const childCloseGrace = 5000;

const readyMessageSchema = z.object({
  type: z.literal('ready'),
  url: z.url(),
  runtimeVersion: z.string().min(1),
});

const errorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string().min(1),
});

/** Supervised loopback runtime-child lifecycle. @internal */
export type RuntimeChildHandle = {
  readonly url: URL;
  readonly runtimeVersion: string;
  readonly authorizationToken: string;
  readonly closed: Promise<{ readonly exitCode?: number; readonly signal?: NodeJS.Signals }>;
  close(): Promise<void>;
};

const minimalEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'WINDIR', 'LANG', 'LC_ALL']) {
    if (process.env[name] !== undefined) {
      environment[name] = process.env[name];
    }
  }
  return environment;
};

const developmentLoaderArguments = (modulePath: string): string[] => {
  if (!modulePath.endsWith('.ts')) {
    return [];
  }
  const importIndex = process.execArgv.indexOf('--import');
  if (importIndex === -1 || process.execArgv[importIndex + 1] !== 'tsx') {
    throw new Error('Tau Host cannot execute its TypeScript runtime child without the parent tsx loader.');
  }
  return ['--import', 'tsx'];
};

/**
 * Node's permission grants for the child.
 *
 * A **built** `.mjs` child runs under `--permission`, read-scoped to the
 * project and its own directory and write-scoped to the temp directory. That is
 * the shipped sandbox and it is unchanged.
 *
 * A **TypeScript** child gets none, and the honest reason is that it cannot
 * have one: the development loader transpiles by *spawning the esbuild service
 * binary*, registers its ESM hooks on a worker thread, and reads from wherever
 * it likes while resolving `tsconfig`. Granting `--allow-child-process` to let
 * it start would make `--permission` decorative — a sandbox that admits
 * arbitrary subprocesses contains nothing — so the flag is dropped instead of
 * hollowed out. Running `tau serve` from source is a development affordance on
 * a machine whose operator already acknowledged `--trust-projects`; the
 * distributed daemon runs the built child and keeps the real sandbox.
 *
 * @param modulePath - The child module being forked.
 * @returns The child's permission flags, or none for a development child.
 */
const permissionArguments = (modulePath: string): string[] =>
  modulePath.endsWith('.ts')
    ? []
    : [
        '--permission',
        `--allow-fs-read=${process.cwd()}`,
        `--allow-fs-read=${dirname(modulePath)}`,
        `--allow-fs-write=${tmpdir()}`,
      ];

// Node 24 does not gate network access. Node 26 requires the experimental
// all-or-nothing --allow-net for the loopback host; it cannot scope egress.
const runtimeNetworkArguments = (modulePath: string): string[] =>
  !modulePath.endsWith('.ts') && Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10) >= 26
    ? ['--allow-net']
    : [];

const killChild = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.send({ type: 'close' });
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
  });
  if (await Promise.race([exited.then(() => true), delay(childCloseGrace, false)])) {
    return;
  }
  child.kill('SIGTERM');
  if (await Promise.race([exited.then(() => true), delay(childCloseGrace, false)])) {
    return;
  }
  child.kill('SIGKILL');
  await exited;
};

/**
 * Start the permission-limited CLI-owned runtime child.
 *
 * @param options - Runtime-child module and CLI runtime arguments.
 * @returns A ready, authenticated loopback runtime child.
 * @internal
 */
export const startRuntimeChild = async (options: {
  readonly modulePath: string;
  readonly args?: readonly string[];
}): Promise<RuntimeChildHandle> => {
  const authorizationToken = randomBytes(32).toString('base64url');
  const child = fork(options.modulePath, [...(options.args ?? [])], {
    cwd: process.cwd(),
    env: minimalEnvironment(),
    execArgv: [
      ...developmentLoaderArguments(options.modulePath),
      ...permissionArguments(options.modulePath),
      ...runtimeNetworkArguments(options.modulePath),
    ],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const closed = new Promise<{ exitCode?: number; signal?: NodeJS.Signals }>((resolve) => {
    child.once('exit', (exitCode, signal) => {
      resolve({
        ...(exitCode === null ? {} : { exitCode }),
        ...(signal === null ? {} : { signal }),
      });
    });
  });
  const ready = Promise.withResolvers<z.infer<typeof readyMessageSchema>>();
  const onMessage = (message: unknown): void => {
    const parsed = readyMessageSchema.safeParse(message);
    if (parsed.success) {
      ready.resolve(parsed.data);
      return;
    }
    const childError = errorMessageSchema.safeParse(message);
    if (childError.success) {
      ready.reject(new Error(`Tau Host runtime child failed: ${childError.data.message}`));
    }
  };
  child.on('message', onMessage);
  child.once('error', (error) => {
    ready.reject(error);
  });
  child.once('exit', (exitCode, signal) => {
    ready.reject(
      new Error(`Tau Host runtime child exited before ready (code ${String(exitCode)}, signal ${String(signal)}).`),
    );
  });
  child.send({ type: 'start', authorizationToken });

  const message = await Promise.race([
    ready.promise,
    delay(childReadyTimeout, undefined, { ref: false }).then(() => {
      throw new Error('Tau Host runtime child did not become ready within 30 seconds.');
    }),
  ]).catch(async (error: unknown) => {
    await killChild(child);
    throw error;
  });
  child.off('message', onMessage);

  const url = new URL(message.url);
  if (url.protocol !== 'ws:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) {
    await killChild(child);
    throw new Error('Tau Host runtime child reported a non-loopback WebSocket URL.');
  }
  return {
    url,
    runtimeVersion: message.runtimeVersion,
    authorizationToken,
    closed,
    async close(): Promise<void> {
      await killChild(child);
    },
  };
};
