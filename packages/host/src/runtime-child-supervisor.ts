import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import type { Readable, Writable } from 'node:stream';
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
  /** Settles when the process exits, before its temp directory is removed: the signal that attributes a crash. */
  readonly exited: Promise<{ readonly exitCode?: number; readonly signal?: NodeJS.Signals }>;
  /** Settles once the process has exited and its temp directory is removed. */
  readonly closed: Promise<{ readonly exitCode?: number; readonly signal?: NodeJS.Signals }>;
  /** Send a control frame (for example a Zoo-scoped token) to the ready child; dropped once it has exited. */
  post<Frame extends { readonly type: string }>(frame: Frame): void;
  /** Stop the child; settles once `closed` has. */
  close(): Promise<void>;
};

/**
 * One native worker launch a runtime child asks its daemon for: what runs, the digests it must match and the paths
 * it may use. The shape of `NativeWorkerLaunch` in `@taucad/native-process-core`.
 *
 * @public
 */
export type RuntimeChildWorkerLaunch = {
  readonly executablePath: string;
  readonly executableSha256: string;
  readonly executableName: string;
  readonly arguments: readonly string[];
  readonly runtimePath: string;
  readonly resources: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly label: string }>;
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly commandId: string;
};

/** A native worker the daemon started for a runtime child: the shape of `NativeWorkerProcess`. @public */
export type RuntimeChildWorker = {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly ended: Promise<{ readonly exitCode?: number; readonly signal?: NodeJS.Signals } | { readonly error: Error }>;
  terminate(): Promise<void>;
};

/**
 * What a full re-verification of a native runtime root found: the shape of `NativeRuntimeDamage` in
 * `@taucad/native-process-core`.
 *
 * @public
 */
export type RuntimeChildRuntimeDamage = {
  /** Root-relative paths that differ, are missing or are not recorded, worst first. */
  readonly files: readonly string[];
  /** One sentence naming the repair, such as the command that re-verifies and repairs the runtime. */
  readonly remedy: string;
};

/**
 * One kernel's request for its sealed closure, as a runtime child sends it: the package and kernel, the dependencies
 * its closure is sealed from, and the package's unparsed `tau-plugin.json` with its root, which the child's runtime
 * definition reported. No kernel code crosses: the daemon reads the store's launch index from this data alone.
 *
 * @public
 */
export type RuntimeChildClosureRequest = {
  readonly package: string;
  readonly kernel: string;
  readonly dependencies: readonly string[];
  readonly manifest: unknown;
  /** `file:` URL of the package root, which payloads shipped inside the package resolve against. */
  readonly packageRoot: string;
};

/**
 * The native kernels a daemon serves through its runtime children (D37).
 *
 * A child lists its native kernels in its own runtime definition and reports their deployments once it has built it.
 * It cannot read the payload store, so each kernel asks the daemon for its sealed closure when it binds. The child runs
 * project code under Node's permission model and may not spawn, so the daemon starts each native worker on its behalf
 * (North Star S2): only from a closure it answered that child with, only through the OS sandbox, and with the sandbox
 * granting only a directory the daemon created for that child, which holds the child's private directory and which
 * neither the child nor its workers can replace.
 *
 * @public
 */
export type RuntimeChildNativeKernels = {
  /**
   * Where the daemon creates each child's directory: outside the daemon's temp directory, which the child may write,
   * so no one the daemon serves can swap an entry on the way to a worker's sandbox root. Launches are refused when
   * it is inside.
   */
  readonly directory: string;
  /**
   * The payload store's root. The broker resolves it to its real path once, when a child starts, so a store reached
   * through a symbolic link (macOS's `/tmp`, a linked home or `TAU_CONFIG_DIR`) still launches, while a closure whose
   * real path leaves the store does not.
   */
  readonly store: string;
  /**
   * Answer one kernel's closure request from the store's launch index, never downloading: read again on every
   * request, so a kernel prepared meanwhile binds on its next operation.
   * @returns The serialisable answer the child's kernel binds with, and the closure roots it names as sealed, which
   *   are the only roots that child may launch from. A rejection answers the kernel as not prepared.
   */
  readonly inspect: (
    request: RuntimeChildClosureRequest,
  ) => Promise<{ readonly answer: unknown; readonly roots: readonly string[] }>;
  /**
   * Called with each child's report of the native deployments its runtime definition lists, unparsed, once it has
   * built its runtime: what `prepare_kernel` names and prepares.
   */
  readonly reported?: ((report: unknown) => void) | undefined;
  /**
   * Verify, sandbox and spawn one accepted launch in this process (`startNativeWorker`). `sandboxRoot` is the
   * daemon-created directory the sandbox grants in place of the launch's workspace and artifact paths.
   */
  readonly start: (launch: RuntimeChildWorkerLaunch & { readonly sandboxRoot: string }) => Promise<RuntimeChildWorker>;
  /**
   * Re-verify one closure in full against its receipt, in this process, after a worker the child ran exited before its
   * handshake (D8, ruling X35). The child cannot read the store, so it asks; only a root inside the store is verified.
   * Seconds, never per launch.
   * @returns The damage found, or `undefined` when the closure is intact.
   */
  readonly verify: (runtimePath: string, signal: AbortSignal) => Promise<RuntimeChildRuntimeDamage | undefined>;
};

const deploymentsMessageSchema = z.object({ type: z.literal('native-deployments'), report: z.unknown() });

const inspectMessageSchema = z.object({
  type: z.literal('native-closure:inspect'),
  id: z.string().min(1).max(128),
  request: z.object({
    package: z.string().min(1).max(256),
    kernel: z.string().min(1).max(256),
    dependencies: z.array(z.string().min(1).max(256)).max(64),
    manifest: z.unknown(),
    packageRoot: z.string().min(1),
  }),
});

const workerLaunchMessageSchema = z.object({
  type: z.literal('native-worker:launch'),
  id: z.string().min(1).max(128),
  launch: z.object({
    executablePath: z.string().min(1),
    executableSha256: z.string().regex(/^[\da-f]{64}$/iu),
    executableName: z.string().min(1).max(256),
    arguments: z.array(z.string()).max(64),
    runtimePath: z.string().min(1),
    resources: z
      .array(
        z.object({ path: z.string().min(1), sha256: z.string().regex(/^[\da-f]{64}$/iu), label: z.string().max(256) }),
      )
      .max(4096),
    workspacePath: z.string().min(1),
    artifactPath: z.string().min(1),
    commandId: z.string().min(1).max(256),
  }),
});

const verifyMessageSchema = z.object({
  type: z.literal('native-worker:verify'),
  id: z.string().min(1).max(128),
  runtimePath: z.string().min(1),
});

const workerControlMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('native-worker:stdin'), id: z.string(), data: z.base64() }),
  z.object({ type: z.literal('native-worker:stdin-end'), id: z.string() }),
  z.object({ type: z.literal('native-worker:terminate'), id: z.string() }),
]);

const isWithin = (root: string, candidate: string): boolean => {
  const path = relative(root, candidate);
  return path.length > 0 && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
};

/**
 * Why a child's launch is refused, or nothing: the runtime root must be a sealed closure in the store, spelled as the
 * daemon answered it or as its real path, whose real path lies inside the store's; everything the worker runs must lie
 * inside it, and the worker's workspace and writable root inside the child's own directory.
 * The child can still rewrite its directory after this check, so the sandbox never grants these two paths: it grants
 * the daemon's directory that holds them ({@link startRuntimeChild}).
 *
 * @param launch - The child's request.
 * @param closureRoots - The sealed closures the daemon answered this child's kernels with.
 * @param directories - The store's real path, or `undefined` when it could not be resolved, and the child's private
 *   temp directory (a real path).
 * @returns The refusal, or `undefined` to start it.
 */
const launchRefusal = async (
  launch: RuntimeChildWorkerLaunch,
  closureRoots: readonly string[],
  directories: { readonly store: string | undefined; readonly privateDirectory: string },
): Promise<string | undefined> => {
  const { store, privateDirectory } = directories;
  const real = async (path: string): Promise<string | undefined> => {
    try {
      return await realpath(path);
    } catch {
      return undefined;
    }
  };
  const runtimePath = await real(launch.runtimePath);
  const sealed = await Promise.all(closureRoots.map(async (root) => ({ root, real: await real(root) })));
  const closure = sealed.find((candidate) => runtimePath !== undefined && candidate.real === runtimePath);
  /* Real paths on both sides, inside the real store; and only the daemon's spelling or the real one, so a link of the
   * child's own that resolves into a closure is not one. */
  if (
    store === undefined ||
    runtimePath === undefined ||
    closure === undefined ||
    !isWithin(store, runtimePath) ||
    (launch.runtimePath !== closure.root && launch.runtimePath !== runtimePath)
  ) {
    return `${launch.runtimePath} is not a closure sealed in the payload store.`;
  }
  const escaped = [launch.executablePath, ...launch.resources.map(({ path }) => path)].find(
    (path) => !isWithin(launch.runtimePath, path),
  );
  if (escaped !== undefined) {
    return `${escaped} is outside the sealed closure.`;
  }
  for (const path of [launch.workspacePath, launch.artifactPath]) {
    // oxlint-disable-next-line no-await-in-loop -- two paths, checked in order.
    const resolved = await real(path);
    if (resolved === undefined || resolved !== path || !isWithin(privateDirectory, resolved)) {
      return `${path} is not inside the runtime child's private directory.`;
    }
  }
  return undefined;
};

/**
 * Serve one child's native kernels until it exits: answer each kernel's closure request from the store, refuse what
 * {@link launchRefusal} refuses, start the rest, carry each worker's pipes over the IPC channel, and stop every worker
 * the child leaves behind. A child whose worker exited before its handshake asks for its closure to be re-verified
 * here, where the store is readable.
 *
 * @param child - The forked runtime child.
 * @param native - The daemon's native kernels.
 * @param directories - The store's real path, resolved until it exists (a child started on an empty store launches
 *   once a kernel is prepared), the child's private temp directory, and either the daemon-created directory that holds it (each worker's sandbox root) or why there is none
 *   safe to grant.
 */
const brokerNativeWorkers = (
  child: ChildProcess,
  native: RuntimeChildNativeKernels,
  directories: {
    readonly store: () => Promise<string | undefined>;
    readonly privateDirectory: string;
    readonly sandboxRoot: string | { readonly refusal: string };
  },
): void => {
  const { privateDirectory, sandboxRoot } = directories;
  const workers = new Map<string, Promise<RuntimeChildWorker | undefined>>();
  /* The closures this child's kernels were answered with: the only roots it may launch from. */
  const answeredRoots = new Set<string>();
  const send = (frame: Readonly<Record<string, unknown>>): void => {
    if (child.connected) {
      child.send(frame);
    }
  };
  const launch = async (id: string, request: RuntimeChildWorkerLaunch): Promise<RuntimeChildWorker | undefined> => {
    let worker: RuntimeChildWorker;
    try {
      const refusal =
        typeof sandboxRoot === 'string'
          ? await launchRefusal(request, [...answeredRoots], { store: await directories.store(), privateDirectory })
          : sandboxRoot.refusal;
      if (refusal !== undefined || typeof sandboxRoot !== 'string') {
        throw new Error(`Tau Host refused a native worker launch: ${refusal}`);
      }
      worker = await native.start({ ...request, sandboxRoot });
    } catch (error) {
      send({ type: 'native-worker:refused', id, message: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
    /* A child that exited while its worker started leaves no one to read it. */
    if (child.exitCode !== null || child.signalCode !== null) {
      await worker.terminate();
      return undefined;
    }
    send({ type: 'native-worker:started', id });
    worker.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      send({ type: 'native-worker:stdout', id, data: Buffer.from(chunk).toString('base64') });
    });
    worker.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      send({ type: 'native-worker:stderr', id, data: Buffer.from(chunk).toString('base64') });
    });
    /* A worker that exits mid-write fails its pipe; its end is reported below. */
    worker.stdin.on('error', () => undefined);
    // async-iife: bootstrap -- the worker's end is reported to the child; nothing awaits it.
    void (async () => {
      const end = await worker.ended;
      workers.delete(id);
      send(
        'error' in end
          ? { type: 'native-worker:exit', id, message: end.error.message }
          : { type: 'native-worker:exit', id, ...end },
      );
    })();
    return worker;
  };
  /* One verification per closure at a time: workers of one closure that fail together share its answer. */
  const verifications = new Map<string, Promise<Readonly<Record<string, unknown>>>>();
  const childGone = new AbortController();
  const verification = async (runtimePath: string): Promise<Readonly<Record<string, unknown>>> => {
    try {
      const [real, store] = await Promise.all([realpath(runtimePath).catch(() => undefined), directories.store()]);
      if (store === undefined || real === undefined || !isWithin(store, real)) {
        return { message: `Tau Host refused to verify ${runtimePath}: it is not inside the payload store.` };
      }
      /* No timer of its own: a local re-hash of one closure, bounded by the child's wait and cancelled when the
       * child exits. */
      const damage = await native.verify(runtimePath, childGone.signal);
      return damage === undefined ? {} : { files: [...damage.files], remedy: damage.remedy };
    } catch (error) {
      return { message: error instanceof Error ? error.message : String(error) };
    }
  };
  const verify = (id: string, runtimePath: string): void => {
    let pending = verifications.get(runtimePath);
    if (pending === undefined) {
      pending = verification(runtimePath);
      verifications.set(runtimePath, pending);
      // async-iife: bootstrap -- the entry is dropped once settled, so a later failure verifies afresh.
      void (async () => {
        await pending;
        verifications.delete(runtimePath);
      })();
    }
    // async-iife: bootstrap -- the answer is sent to the child; nothing awaits it.
    void (async () => {
      send({ type: 'native-worker:verified', id, ...(await pending) });
    })();
  };
  const inspect = async (id: string, request: RuntimeChildClosureRequest): Promise<void> => {
    let reply: Readonly<Record<string, unknown>>;
    try {
      const { answer, roots } = await native.inspect(request);
      for (const root of roots) {
        answeredRoots.add(root);
      }
      reply = { answer };
    } catch (error) {
      reply = { message: error instanceof Error ? error.message : String(error) };
    }
    send({ type: 'native-closure:answer', id, ...reply });
  };
  child.on('message', (message: unknown) => {
    const reported = deploymentsMessageSchema.safeParse(message);
    if (reported.success) {
      native.reported?.(reported.data.report);
      return;
    }
    const inspectRequest = inspectMessageSchema.safeParse(message);
    if (inspectRequest.success) {
      void inspect(inspectRequest.data.id, inspectRequest.data.request);
      return;
    }
    const verifyRequest = verifyMessageSchema.safeParse(message);
    if (verifyRequest.success) {
      verify(verifyRequest.data.id, verifyRequest.data.runtimePath);
      return;
    }
    const requested = workerLaunchMessageSchema.safeParse(message);
    if (requested.success) {
      const { id, launch: request } = requested.data;
      if (!workers.has(id)) {
        workers.set(id, launch(id, request));
      }
      return;
    }
    const control = workerControlMessageSchema.safeParse(message);
    if (!control.success) {
      return;
    }
    // async-iife: bootstrap -- a control frame acts on a worker that may still be starting.
    void (async () => {
      const worker = await workers.get(control.data.id);
      if (worker === undefined) {
        return;
      }
      if (control.data.type === 'native-worker:stdin') {
        worker.stdin.write(Buffer.from(control.data.data, 'base64'));
      } else if (control.data.type === 'native-worker:stdin-end') {
        worker.stdin.end();
      } else {
        await worker.terminate();
      }
    })();
  });
  child.once('exit', () => {
    childGone.abort();
    for (const starting of workers.values()) {
      // async-iife: bootstrap -- a worker outlives no child; nothing awaits its stop.
      void (async () => {
        const worker = await starting;
        await worker?.terminate();
      })();
    }
  });
};

/** Milliseconds a child directory may go without its owner marker before a sweep takes it for abandoned. */
const unmarkedDirectoryGrace = 10 * 60_000;
const childDirectoryPrefix = 'tau-runtime-child-';
/* The directories a sweep has already run for in this process. */
const swept = new Set<string>();

/** Whether a process with this id is running; a process this one may not signal is running too. */
const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * Remove the child directories a daemon left behind under its native directory, which, unlike TMPDIR, no OS cleans:
 * a daemon that crashed or was killed, or a removal that failed while a worker still wrote. Each directory's owner
 * marker (`<directory>.pid`, beside it where neither the child nor a worker can write) names the daemon that made it;
 * one whose daemon still runs is kept, so concurrent daemons leave each other alone. Runs once per directory.
 *
 * @param directory - The daemon's native directory.
 */
const sweepAbandonedChildDirectories = async (directory: string): Promise<void> => {
  if (swept.has(directory)) {
    return;
  }
  swept.add(directory);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return;
  }
  const abandoned = async (name: string): Promise<boolean> => {
    const owner = Number.parseInt(await readFile(join(directory, `${name}.pid`), 'utf8').catch(() => ''), 10);
    if (Number.isSafeInteger(owner) && owner > 0) {
      return owner !== process.pid && !processAlive(owner);
    }
    /* No marker: a daemon stopped between creating the directory and marking it, or is marking it now. */
    const { mtimeMs } = await stat(join(directory, name));
    return Date.now() - mtimeMs > unmarkedDirectoryGrace;
  };
  await Promise.all(
    entries
      .filter((name) => name.startsWith(childDirectoryPrefix) && !name.endsWith('.pid'))
      .map(async (name) => {
        try {
          if (await abandoned(name)) {
            await rm(join(directory, name), { recursive: true, force: true });
            await rm(join(directory, `${name}.pid`), { force: true });
          }
        } catch {
          // The next daemon's sweep tries again.
        }
      }),
  );
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
  /** The native kernels this child's runtime lists, whose closures the caller answers and whose workers it starts. */
  readonly native?: RuntimeChildNativeKernels;
}): Promise<RuntimeChildHandle> => {
  const authorizationToken = randomBytes(32).toString('base64url');
  /* The real path: importing a module resolves symlinks component by component (macOS's `/var` is a link to
   * `/private/var`), and the grants cover only this directory, not its symlinked ancestors. A child with native
   * kernels gets its directory inside one the daemon creates outside every grant: that outer directory is what a
   * worker's sandbox grants, and since neither the child nor a worker can replace it, a path the child rewrites
   * after the broker checked it cannot carry the grant elsewhere. */
  const parentDirectory = options.native?.directory ?? tmpdir();
  if (options.native !== undefined) {
    await mkdir(parentDirectory, { recursive: true, mode: 0o700 });
    await sweepAbandonedChildDirectories(parentDirectory);
  }
  /* What the child's exit removes: its temp directory, or the daemon's directory that holds it. */
  const removableDirectory = await realpath(await mkdtemp(join(parentDirectory, childDirectoryPrefix)));
  /* Outside TMPDIR nothing reclaims a directory this daemon leaves behind; the marker lets the next sweep do it. */
  const ownerMarker = options.native === undefined ? undefined : `${removableDirectory}.pid`;
  if (ownerMarker !== undefined) {
    await writeFile(ownerMarker, `${String(process.pid)}\n`, { mode: 0o600 });
  }
  const temporaryDirectory = options.native === undefined ? removableDirectory : join(removableDirectory, 'tmp');
  /* The child may write the daemon's temp directory, so a sandbox root inside it could be swapped after all. */
  const childWritableTemporary = await realpath(tmpdir());
  const sandboxRoot =
    removableDirectory === childWritableTemporary || isWithin(childWritableTemporary, removableDirectory)
      ? {
          refusal: `${parentDirectory} is inside ${childWritableTemporary}, which the runtime child may write; keep the native workers' directory outside TMPDIR.`,
        }
      : removableDirectory;
  if (options.native !== undefined) {
    await mkdir(temporaryDirectory);
  }
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
  if (options.native !== undefined) {
    const storePath = options.native.store;
    /* Resolved once it exists: a store that does not exist yet holds no closure, and the child's kernels bind once one
     * is prepared, without the child restarting. */
    let store: string | undefined;
    const resolveStore = async (): Promise<string | undefined> => {
      store ??= await realpath(storePath).catch(() => undefined);
      return store;
    };
    brokerNativeWorkers(child, options.native, {
      store: resolveStore,
      privateDirectory: temporaryDirectory,
      sandboxRoot,
    });
  }
  const exited = new Promise<{ exitCode?: number; signal?: NodeJS.Signals }>((resolve) => {
    child.once('exit', (exitCode, signal) => {
      resolve({
        ...(exitCode === null ? {} : { exitCode }),
        ...(signal === null ? {} : { signal }),
      });
    });
  });
  /* The directory is the child's alone, so it goes with the child. A failed removal leaves it to the OS in TMPDIR, and
   * to the next daemon's sweep in the native directory, whose marker then names a daemon that is gone. */
  const removeTemporaryDirectoryOnExit = async (): Promise<Awaited<typeof exited>> => {
    const exit = await exited;
    try {
      await rm(removableDirectory, { recursive: true, force: true });
      if (ownerMarker !== undefined) {
        await rm(ownerMarker, { force: true });
      }
    } catch {
      // Reclaimed later, as above.
    }
    return exit;
  };
  const closed = removeTemporaryDirectoryOnExit();
  /* Stopped means exited *and* its directory removed, so a caller that awaits a stop never sees `closed` pending. */
  const stop = async (): Promise<void> => {
    await killChild(child);
    await closed;
  };
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
  /* `native`: this daemon answers the child's closure requests and brokers its workers. */
  child.send({ type: 'start', authorizationToken, ...(options.native === undefined ? {} : { native: true }) });

  const message = await Promise.race([
    ready.promise,
    delay(childReadyTimeout, undefined, { ref: false }).then(() => {
      throw new Error('Tau Host runtime child did not become ready within 30 seconds.');
    }),
  ]).catch(async (error: unknown) => {
    await stop();
    throw error;
  });
  child.off('message', onMessage);

  const url = new URL(message.url);
  if (url.protocol !== 'ws:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) {
    await stop();
    throw new Error('Tau Host runtime child reported a non-loopback WebSocket URL.');
  }
  return {
    url,
    runtimeVersion: message.runtimeVersion,
    authorizationToken,
    exited,
    closed,
    post(frame): void {
      if (child.connected) {
        child.send(frame);
      }
    },
    async close(): Promise<void> {
      await stop();
    },
  };
};
