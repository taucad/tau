import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
  /** Send a control frame (for example a Zoo-scoped token) to the ready child; dropped once it has exited. */
  post<Frame extends { readonly type: string }>(frame: Frame): void;
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
  const hasTsxLoader = process.execArgv.some(
    (argument, index) =>
      process.execArgv[index - 1] === '--import' && (argument === 'tsx' || argument.endsWith('/tsx/dist/loader.mjs')),
  );
  if (!hasTsxLoader) {
    throw new Error('Tau Host cannot execute its TypeScript runtime child without the parent tsx loader.');
  }
  return ['--import', 'tsx'];
};

/**
 * Node's permission grants for the child.
 *
 * A **built** `.mjs` child runs under `--permission`, read-scoped to the
 * project, its own directory and its private temp directory, and write-scoped
 * to the temp directory. The private directory is the child's `os.tmpdir()`:
 * a bundling kernel runs a model by writing its bundle there and importing it,
 * and the import reads the file back.
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
 * @param temporaryDirectory - The child's private temp directory.
 * @returns The child's permission flags, or none for a development child.
 */
const permissionArguments = (modulePath: string, temporaryDirectory: string): string[] =>
  modulePath.endsWith('.ts')
    ? []
    : [
        '--permission',
        `--allow-fs-read=${process.cwd()}`,
        `--allow-fs-read=${dirname(modulePath)}`,
        `--allow-fs-read=${temporaryDirectory}`,
        `--allow-fs-write=${tmpdir()}`,
        `--allow-fs-write=${temporaryDirectory}`,
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
  /* A send on a disconnected channel emits an `'error'` nothing listens for, which would end the daemon; a child
   * that cannot hear `close` still exits at the signals below. */
  if (child.connected) {
    child.send({ type: 'close' });
  }
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
  /* The real path: importing a module resolves symlinks component by component (macOS's `/var` is a link to
   * `/private/var`), and the grants cover only this directory, not its symlinked ancestors. */
  const temporaryDirectory = await realpath(await mkdtemp(join(tmpdir(), 'tau-runtime-child-')));
  const child = fork(options.modulePath, [...(options.args ?? [])], {
    cwd: process.cwd(),
    env: {
      ...minimalEnvironment(),
      // `os.tmpdir()` reads TMPDIR on POSIX and TEMP or TMP on Windows.
      /* eslint-disable @typescript-eslint/naming-convention -- environment variables are not camelCase */
      TMPDIR: temporaryDirectory,
      TEMP: temporaryDirectory,
      TMP: temporaryDirectory,
      /* eslint-enable @typescript-eslint/naming-convention -- end of the environment variables */
    },
    execArgv: [
      ...developmentLoaderArguments(options.modulePath),
      ...permissionArguments(options.modulePath, temporaryDirectory),
      ...runtimeNetworkArguments(options.modulePath),
    ],
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const exited = new Promise<{ exitCode?: number; signal?: NodeJS.Signals }>((resolve) => {
    child.once('exit', (exitCode, signal) => {
      resolve({
        ...(exitCode === null ? {} : { exitCode }),
        ...(signal === null ? {} : { signal }),
      });
    });
  });
  /* The directory is the child's alone, so it goes with the child; a failed removal leaves only temp files. */
  const removeTemporaryDirectoryOnExit = async (): Promise<Awaited<typeof exited>> => {
    const exit = await exited;
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch {
      // The OS reclaims the temp directory.
    }
    return exit;
  };
  const closed = removeTemporaryDirectoryOnExit();
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
    post(frame): void {
      if (child.connected) {
        child.send(frame);
      }
    },
    async close(): Promise<void> {
      await killChild(child);
    },
  };
};
