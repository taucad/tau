import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve as resolvePath, sep } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import type { RuntimeLogger } from '@taucad/runtime/kernel';

import {
  acquireNativeSandbox,
  launchInNativeSandbox,
  releaseNativeSandbox,
  spawnInNativeSandbox,
} from '#native-sandbox.js';

const maxProtocolLineBytes = 1_048_576;
const maxStderrBytes = 65_536;
/** Verified runtime payloads by fingerprint, shared by every session in this process (D24). */
const verifiedRuntimePayloads = new Map<string, Promise<void>>();
const maxQueueDepth = 16;
const terminationGraceMilliseconds = 500;

/** Integrity evidence for one host-owned native-process resource. @public */
export type NativeProcessResource = {
  readonly path: string;
  readonly sha256: string;
  readonly label: string;
};

/** Private artifact descriptor emitted by a native worker. @public */
export type NativeArtifact = {
  readonly artifactPath: string;
  readonly byteLength: number;
};

/** Validated response normalized by a language plugin. @public */
export type NativeProtocolResponse<Issue> =
  | { readonly requestId: string; readonly result: unknown }
  | { readonly requestId: string; readonly issues: readonly Issue[] };

/** Validation and synchronous delivery hooks for request-scoped native events. @public */
export type NativeProcessEventSubscription<Event> = {
  /** Validate and normalize one request-scoped event payload. */
  readonly parseEvent: (value: unknown) => Event;
  /** Consume a validated event synchronously, in protocol sequence order. */
  readonly onEvent: (event: Event) => void;
};

/** One typed operation sent over the serialized NDJSON lane. @public */
export type NativeProcessRequest<Result, Event = never> = {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly parseResult: (value: unknown) => Result;
  readonly signal: AbortSignal;
  /** Optional request-scoped unsolicited event channel; terminal responses remain unchanged. */
  readonly events?: NativeProcessEventSubscription<Event>;
  /**
   * Out-of-band method that asks the worker to stop at its own safe boundary.
   *
   * When set, an abort sends this notification instead of recycling the process, so
   * native work completed so far stays resident. The request timeout remains the
   * kill fallback for a worker that does not observe it.
   */
  readonly cancelMethod?: string;
};

/** Configuration for one supervised, sandboxed native child process. @public */
export type NativeProcessSessionOptions<Issue> = {
  readonly executablePath: string;
  readonly executableSha256: string;
  readonly arguments: readonly string[];
  /**
   * Read-only root of the bundled runtime.
   *
   * The executable and every resource must live inside it; it is the only host path,
   * besides the workspace mirror, that the sandbox re-allows for reading.
   */
  readonly runtimePath: string;
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly resources: readonly NativeProcessResource[];
  readonly protocolVersion: number;
  readonly parseReady: (value: unknown) => void;
  readonly parseResponse: (value: unknown) => NativeProtocolResponse<Issue>;
  /** Milliseconds. Zero lets requests run until completion or cancellation. */
  readonly requestTimeout: number;
  readonly maxArtifactBytes: number;
  /** Maximum UTF-8 bytes per worker response/event line; positive safe integer, default 1 MiB. */
  readonly maxProtocolLineBytes?: number;
  readonly logger: RuntimeLogger;
  readonly sessionName: string;
  readonly executableName: string;
  readonly shutdown?: {
    readonly method: string;
    readonly parseResult: (value: unknown) => unknown;
  };
};

type PendingRequest = {
  readonly parseResult: (value: unknown) => unknown;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly cleanup: () => void;
  readonly events:
    | {
        readonly parseEvent: (value: unknown) => unknown;
        readonly onEvent: (event: unknown) => unknown;
      }
    | undefined;
  lastEventSequence: number;
};

type NativeProtocolEventFrame = {
  readonly requestId: string;
  readonly sequence: number;
  readonly event: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isEventFrameCandidate = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && (value['type'] === 'event' || 'sequence' in value || 'event' in value);

const isPromiseLike = (value: unknown): boolean =>
  (typeof value === 'object' || typeof value === 'function') &&
  value !== null &&
  typeof Reflect.get(value, 'then') === 'function';

const parseEventFrame = (value: Record<string, unknown>, protocolVersion: number): NativeProtocolEventFrame => {
  const { protocolVersion: receivedProtocolVersion, type, requestId, sequence, event } = value;
  if (
    receivedProtocolVersion !== protocolVersion ||
    type !== 'event' ||
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    !Number.isSafeInteger(sequence) ||
    (sequence as number) <= 0 ||
    !Object.hasOwn(value, 'event')
  ) {
    throw new Error('event frame does not match the native event envelope');
  }
  return { requestId, sequence: sequence as number, event };
};

/** A structured failure emitted by a native language worker. @public */
export class NativeWorkerReportedError<Issue> extends Error {
  public readonly issues: readonly Issue[];

  public constructor(issues: readonly Issue[]) {
    super('The native worker reported one or more issues.');
    this.issues = issues;
    this.name = 'NativeWorkerReportedError';
  }
}

const fileSha256 = async (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.once('error', reject);
    stream.once('end', () => {
      resolve(hash.digest('hex'));
    });
  });

const abortReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');

const isDescendant = (parent: string, candidate: string): boolean => {
  const child = relative(resolvePath(parent), resolvePath(candidate));
  return child.length > 0 && !child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child);
};

/**
 * Produce the deliberately minimal environment inherited by a native child.
 *
 * The private artifact directory doubles as the worker's home and temporary storage, so
 * runtime caches land inside the one writable root instead of the user's real home.
 *
 * @public
 * @param artifactPath - The worker's private writable directory.
 * @returns The complete child environment.
 */
export const processEnvironment = (artifactPath: string): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  environment['LANG'] = 'C.UTF-8';
  environment['LC_ALL'] = 'C.UTF-8';
  environment['HOME'] = artifactPath;
  environment['TMPDIR'] = artifactPath;
  environment['TEMP'] = artifactPath;
  environment['TMP'] = artifactPath;
  if (process.platform === 'win32') {
    if (process.env['SystemRoot']) {
      environment['SystemRoot'] = process.env['SystemRoot'];
    }
    return environment;
  }
  // The sandbox wrapper resolves its own `env` and shell through this fixed system path.
  environment['PATH'] = '/usr/bin:/bin';
  return environment;
};

/** Gracefully terminate a native process group, then hard-kill it after a short bound. @public */
export const terminateProcessTree = async (child: ChildProcessWithoutNullStreams): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  if (process.platform === 'win32') {
    const systemRoot = process.env['SystemRoot'];
    if (!systemRoot) {
      child.kill('SIGKILL');
      return;
    }
    await new Promise<void>((resolve) => {
      const killer = spawn(
        resolvePath(systemRoot, 'System32', 'taskkill.exe'),
        ['/pid', String(child.pid), '/T', '/F'],
        {
          shell: false,
          windowsHide: true,
          stdio: 'ignore',
        },
      );
      killer.once('close', resolve);
      killer.once('error', () => {
        child.kill('SIGKILL');
        resolve();
      });
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {
          // The process group exited during the grace period.
        }
      }
      resolve();
    }, terminationGraceMilliseconds);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
};

/** Everything one native worker launch needs: what runs, the digests it must match and the paths it may use. @public */
export type NativeWorkerLaunch = {
  readonly executablePath: string;
  readonly executableSha256: string;
  /** Names the executable in an integrity failure. */
  readonly executableName: string;
  readonly arguments: readonly string[];
  /** Read-only root that holds the executable and every resource. */
  readonly runtimePath: string;
  readonly resources: readonly NativeProcessResource[];
  /** The mirrored workspace, readable and the working directory. */
  readonly workspacePath: string;
  /** The single writable root. */
  readonly artifactPath: string;
  /** Attributes sandbox violations to this launch. */
  readonly commandId: string;
  /**
   * A directory that holds `workspacePath` and `artifactPath` and that only the process starting the worker can
   * replace. When set, the sandbox grants this directory instead of those two paths. A requester that can rewrite
   * its own directory then cannot redirect the worker's grants between the broker's check and the spawn.
   */
  readonly sandboxRoot?: string;
};

/** How a native worker ended: its exit code or signal, or the error that kept it from starting. @public */
export type NativeWorkerEnd =
  | { readonly exitCode?: number; readonly signal?: NodeJS.Signals }
  | { readonly error: Error };

/** A started, sandboxed native worker, wherever it was spawned. @public */
export type NativeWorkerProcess = {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  /** Settles once, when the worker exits or fails to start. */
  readonly ended: Promise<NativeWorkerEnd>;
  /** Stop the worker's process tree, gracefully and then by force; settles once it has ended. */
  terminate(): Promise<void>;
};

/** Starts one native worker for a session. @public */
export type NativeWorkerLauncher = (launch: NativeWorkerLaunch) => Promise<NativeWorkerProcess>;

/*
 * A process-wide slot, keyed on the global symbol registry rather than held in a module binding: a host installs its
 * launcher once, and every copy of this package the runtime loads (one per plugin that bundles it) must see it.
 */
const launcherSlot = Symbol.for('@taucad/native-process-core/worker-launcher');

const installedLauncher = (): NativeWorkerLauncher | undefined => {
  const launcher: unknown = Reflect.get(globalThis, launcherSlot);
  return typeof launcher === 'function' ? (launcher as NativeWorkerLauncher) : undefined;
};

/**
 * Route every native worker this process starts through `launcher` instead of spawning it here.
 *
 * A host process that may not spawn (a runtime child under Node's permission model without `--allow-child-process`)
 * installs a launcher that asks a process holding that authority to start the worker on its behalf, through
 * {@link startNativeWorker}: verifying the digests, wrapping it in the sandbox and spawning it there. Sessions then
 * neither read the runtime root nor start the sandbox in this process.
 *
 * @public
 * @param launcher - The launcher, or `undefined` to spawn in this process again.
 */
export const installNativeWorkerLauncher = (launcher: NativeWorkerLauncher | undefined): void => {
  Reflect.set(globalThis, launcherSlot, launcher);
};

/**
 * What re-verifying a native runtime found: the files that differ from the record it was sealed with, and what the
 * user can do about it.
 * @public
 */
export type NativeRuntimeDamage = {
  /** Paths relative to the runtime root, sorted. */
  readonly files: readonly string[];
  /** One sentence naming the repair, such as the command that re-verifies and repairs the runtime. */
  readonly remedy: string;
};

/**
 * Re-verifies a native runtime root in full, file by file, against the record it was sealed with.
 * @public
 * @param runtimePath - The launch's runtime root.
 * @param signal - Aborts the check.
 * @returns The damage found, or `undefined` when the runtime is intact or is not one the verifier knows.
 */
export type NativeRuntimeVerifier = (
  runtimePath: string,
  signal: AbortSignal,
) => Promise<NativeRuntimeDamage | undefined>;

const verifierSlot = Symbol.for('@taucad/native-process-core/runtime-verifier');

/** Damaged files a refusal names; the rest are counted. */
const reportedDamagedFiles = 5;

/** Bound on one re-verification after a failed handshake: seconds normally, never a hang. Milliseconds. */
const reverificationTimeout = 300_000;

const installedVerifier = (): NativeRuntimeVerifier | undefined => {
  const verifier: unknown = Reflect.get(globalThis, verifierSlot);
  return typeof verifier === 'function' ? (verifier as NativeRuntimeVerifier) : undefined;
};

/**
 * Re-verify a session's runtime with `verifier` whenever its worker exits before the handshake (D8).
 *
 * A launch hashes only the executable and the few files the process loads first; anything else that is damaged
 * surfaces as a worker that exits before it is ready. The session then runs the verifier over its runtime root and,
 * when it finds damage, fails with an error that names the files and the remedy instead of the bare exit status.
 * Held process-wide, like the worker launcher, so every copy of this package sees it.
 *
 * @public
 * @param verifier - The verifier, or `undefined` to report bare exits again.
 */
export const installNativeRuntimeVerifier = (verifier: NativeRuntimeVerifier | undefined): void => {
  Reflect.set(globalThis, verifierSlot, verifier);
};

const verifyResourceDigests = async (launch: NativeWorkerLaunch): Promise<void> => {
  const resources = [
    { path: launch.executablePath, sha256: launch.executableSha256, label: launch.executableName },
    ...launch.resources,
  ];
  const escaped = resources.find(({ path }) => !isDescendant(launch.runtimePath, path));
  if (escaped) {
    throw new Error(`${escaped.label} is outside the native runtime root.`);
  }
  const verifiedResources = await Promise.all(
    resources.map(async (resource) => ({ ...resource, actual: await fileSha256(resource.path) })),
  );
  const mismatched = verifiedResources.find(({ actual, sha256 }) => actual !== sha256.toLowerCase());
  if (mismatched) {
    throw new Error(`${mismatched.label} failed its SHA-256 integrity check.`);
  }
};

const verifyResources = async (launch: NativeWorkerLaunch): Promise<void> => {
  /* D24: the runtime root ships inside the signed bundle, so its digests are a property of the
   * installed payload rather than of a session. Sweeping per session charged every opened project
   * a fresh 167 MiB hash of bytes another session had already verified in this process. */
  const fingerprint = createHash('sha256')
    .update(
      [
        launch.runtimePath,
        launch.executablePath,
        launch.executableSha256,
        ...launch.resources.map(({ path, sha256 }) => `${path}\u0000${sha256}`),
      ].join('\u0000'),
    )
    .digest('hex');
  let verified = verifiedRuntimePayloads.get(fingerprint);
  if (verified === undefined) {
    verified = verifyResourceDigests(launch);
    verifiedRuntimePayloads.set(fingerprint, verified);
  }
  try {
    await verified;
  } catch (error) {
    /* Only a pass describes the payload. A failed read (a closure still being sealed, EMFILE) is forgotten, so the
     * next launch hashes again instead of failing until the process restarts. */
    if (verifiedRuntimePayloads.get(fingerprint) === verified) {
      verifiedRuntimePayloads.delete(fingerprint);
    }
    throw error;
  }
};

/* POSIX process groups of the workers this process started and that have not exited yet. */
const liveProcessGroups = new Set<number>();
let exitHookInstalled = false;

/* Synchronous, because nothing asynchronous runs in `'exit'`: a session's graceful `cleanup()` cannot finish there, and
 * a worker held inside a long native call would not see its parent watchdog fire until the call returned. */
const killLiveProcessGroups = (): void => {
  for (const pid of liveProcessGroups) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // The group exited already.
    }
  }
  liveProcessGroups.clear();
};

const trackProcessGroup = (child: ChildProcessWithoutNullStreams): void => {
  const { pid } = child;
  if (process.platform === 'win32' || pid === undefined) {
    return;
  }
  if (!exitHookInstalled) {
    exitHookInstalled = true;
    process.on('exit', killLiveProcessGroups);
  }
  liveProcessGroups.add(pid);
  child.once('exit', () => {
    liveProcessGroups.delete(pid);
  });
};

/* Wrap a verified launch in the sandbox and spawn it; nothing is spawned when the sandbox cannot wrap it. */
const spawnContained = async (launch: NativeWorkerLaunch): Promise<NativeWorkerProcess> => {
  const vector = await launchInNativeSandbox({
    executablePath: launch.executablePath,
    arguments: launch.arguments,
    readablePaths: [launch.runtimePath, launch.sandboxRoot ?? launch.workspacePath],
    writablePath: launch.sandboxRoot ?? launch.artifactPath,
    workingDirectory: launch.workspacePath,
    commandId: launch.commandId,
  });
  const child = spawnInNativeSandbox(vector, {
    cwd: launch.workspacePath,
    env: processEnvironment(launch.artifactPath),
  });
  trackProcessGroup(child);
  const ended = new Promise<NativeWorkerEnd>((resolve) => {
    child.once('error', (error) => {
      resolve({ error });
    });
    child.once('exit', (code, signal) => {
      resolve({ ...(code === null ? {} : { exitCode: code }), ...(signal === null ? {} : { signal }) });
    });
  });
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    ended,
    terminate: async () => terminateProcessTree(child),
  };
};

/**
 * Start one native worker in this process: check the executable and resources against their digests, wrap the
 * launch in the fixed Tau sandbox, and spawn it. The sandbox runtime is held until the worker ends.
 *
 * A process that brokers launches for a permission-limited one calls this for each request it accepts; the
 * requesting process installs a launcher that reaches it ({@link installNativeWorkerLauncher}).
 *
 * @public
 * @param launch - The launch.
 * @returns The started worker.
 * @throws {NativeRuntimeUnavailableError} When the sandbox cannot start; nothing is spawned.
 * @throws {Error} When a file is outside the runtime root or fails its digest.
 */
export const startNativeWorker: NativeWorkerLauncher = async (launch) => {
  await verifyResources(launch);
  acquireNativeSandbox();
  let worker: NativeWorkerProcess;
  try {
    worker = await spawnContained(launch);
  } catch (error) {
    await releaseNativeSandbox();
    throw error;
  }
  // async-iife: bootstrap -- the lease ends with the worker; nothing awaits it.
  void (async () => {
    await worker.ended;
    await releaseNativeSandbox().catch(() => undefined);
  })();
  return worker;
};

/** One warm, serialized, generation-scoped native worker session. @public */
export class NativeProcessSession<Issue> {
  public generation = 0;
  private child: NativeWorkerProcess | undefined;
  private ready: Promise<void> | undefined;
  private resolveReady: (() => void) | undefined;
  private rejectReady: ((reason: unknown) => void) | undefined;
  /** The unfinished protocol line, as received, and its UTF-8 byte length. */
  private stdoutChunks: string[] = [];
  private stdoutBytes = 0;
  private stderr = '';
  private decoder = new StringDecoder('utf8');
  private readonly pending = new Map<string, PendingRequest>();
  private queue = Promise.resolve();
  private queueDepth = 0;
  private requestSequence = 0;
  private termination: Promise<void> | undefined;
  private closed = false;
  private sandboxLeased = false;
  // oxlint-disable-next-line typescript/parameter-properties -- erasableSyntaxOnly forbids parameter properties.
  private readonly options: NativeProcessSessionOptions<Issue>;
  private readonly maxProtocolLineBytes: number;

  public constructor(options: NativeProcessSessionOptions<Issue>) {
    this.maxProtocolLineBytes = options.maxProtocolLineBytes ?? maxProtocolLineBytes;
    if (!Number.isSafeInteger(this.maxProtocolLineBytes) || this.maxProtocolLineBytes <= 0) {
      throw new TypeError('maxProtocolLineBytes must be a positive safe integer.');
    }
    this.options = options;
  }

  /** Queue one operation in the session's serialized request lane. */
  public async request<Result, Event = never>(request: NativeProcessRequest<Result, Event>): Promise<Result> {
    if (this.closed) {
      throw new Error(`${this.options.sessionName} session is closed.`);
    }
    if (this.queueDepth >= maxQueueDepth) {
      throw new Error(`${this.options.sessionName} request queue exceeds ${String(maxQueueDepth)} operations.`);
    }
    this.queueDepth += 1;
    // oxlint-disable-next-line promise/prefer-await-to-then -- Promise is the serialized admission tail.
    const operation = this.queue.then(async () => {
      if (this.closed) {
        throw new Error(`${this.options.sessionName} session is closed.`);
      }
      request.signal.throwIfAborted();
      const abortStart = (): void => {
        this.requestTermination(abortReason(request.signal));
      };
      request.signal.addEventListener('abort', abortStart, { once: true });
      try {
        await this.start();
      } finally {
        request.signal.removeEventListener('abort', abortStart);
      }
      request.signal.throwIfAborted();
      return this.send(request);
    });
    // oxlint-disable-next-line promise/prefer-await-to-then -- both settlements must advance the admission tail.
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await operation;
    } finally {
      this.queueDepth -= 1;
    }
  }

  /** Whether a retained handle belongs to the currently live worker generation. */
  public isGenerationValid(generation: number): boolean {
    return this.child !== undefined && generation === this.generation;
  }

  /** Read and delete one private artifact after physical confinement and size checks. */
  public async readArtifact(artifact: NativeArtifact): Promise<Uint8Array<ArrayBuffer>> {
    const resolved = resolvePath(artifact.artifactPath);
    if (!isDescendant(this.options.artifactPath, resolved)) {
      throw new Error(`${this.options.sessionName} returned an artifact outside its private directory.`);
    }
    const [stats, physical] = await Promise.all([lstat(resolved), realpath(resolved)]);
    if (!stats.isFile() || stats.isSymbolicLink() || !isDescendant(this.options.artifactPath, physical)) {
      throw new Error(`${this.options.sessionName} returned an invalid artifact file.`);
    }
    if (stats.size !== artifact.byteLength || stats.size > this.options.maxArtifactBytes) {
      throw new Error(`${this.options.sessionName} returned an artifact with an invalid size.`);
    }
    try {
      const bytes = await readFile(physical);
      if (bytes.byteLength !== artifact.byteLength || bytes.byteLength > this.options.maxArtifactBytes) {
        throw new Error(`${this.options.sessionName} artifact changed while it was being read.`);
      }
      /* `readFile` sizes a dedicated buffer to the file, so a view over it is the artifact; only a read that landed in
       * a shared pool slab is copied, so the result never retains bytes beyond its own. */
      return bytes.buffer instanceof ArrayBuffer &&
        bytes.byteOffset === 0 &&
        bytes.buffer.byteLength === bytes.byteLength
        ? new Uint8Array(bytes.buffer, 0, bytes.byteLength)
        : Uint8Array.from(bytes);
    } finally {
      await unlink(physical).catch(() => undefined);
    }
  }

  /** Terminate the current generation while allowing the next request to start a fresh child. */
  public async recycle(reason = new Error(`${this.options.sessionName} requested process recycling.`)): Promise<void> {
    const { child } = this;
    if (!child) {
      return;
    }
    this.fail(child, reason);
    await child.terminate();
  }

  /** Gracefully stop the worker and force-kill any remaining descendant tree. */
  public async cleanup(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      await this.stop();
    } finally {
      if (this.sandboxLeased) {
        this.sandboxLeased = false;
        await releaseNativeSandbox();
      }
    }
  }

  private async stop(): Promise<void> {
    await this.termination;
    const { child } = this;
    if (!child) {
      return;
    }
    if (this.options.shutdown) {
      try {
        await this.send({
          method: this.options.shutdown.method,
          params: {},
          parseResult: this.options.shutdown.parseResult,
          signal: new AbortController().signal,
        });
      } catch {
        // Forced termination below is the cleanup fallback.
      }
    }
    await child.terminate();
  }

  private requestTermination(error: Error): void {
    this.termination = this.recycle(error);
  }

  private launch(): NativeWorkerLaunch {
    return {
      executablePath: this.options.executablePath,
      executableSha256: this.options.executableSha256,
      executableName: this.options.executableName,
      arguments: this.options.arguments,
      runtimePath: this.options.runtimePath,
      resources: this.options.resources,
      workspacePath: this.options.workspacePath,
      artifactPath: this.options.artifactPath,
      commandId: `${this.options.sessionName}#${String(this.generation + 1)}`,
    };
  }

  /* Verify, lease and spawn here; or, with a launcher installed, let the process that brokers launches do all three. */
  private async startWorker(): Promise<NativeWorkerProcess> {
    const launch = this.launch();
    const launcher = installedLauncher();
    if (launcher !== undefined) {
      return launcher(launch);
    }
    await verifyResources(launch);
    // A cleanup() during verification already closed the session; a lease taken now would never be released.
    if (this.closed) {
      throw new Error(`${this.options.sessionName} session is closed.`);
    }
    if (!this.sandboxLeased) {
      this.sandboxLeased = true;
      acquireNativeSandbox();
    }
    return spawnContained(launch);
  }

  private async start(): Promise<void> {
    if (this.child && this.ready) {
      await this.ready;
      return;
    }
    const child = await this.startWorker();
    if (this.closed) {
      await child.terminate();
      throw new Error(`${this.options.sessionName} session is closed.`);
    }
    this.generation += 1;
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.stderr = '';
    this.decoder = new StringDecoder('utf8');
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    this.child = child;
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      this.onStdout(chunk);
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      this.onStderr(chunk);
    });
    // Set by the end handler, which TypeScript cannot see run before the catch below.
    const handshake = { exitedBeforeReady: false };
    // async-iife: bootstrap -- the worker's end fails whatever it was serving; nothing awaits it.
    void (async () => {
      const end = await child.ended;
      handshake.exitedBeforeReady = this.child === child && this.resolveReady !== undefined && !('error' in end);
      this.fail(
        child,
        'error' in end
          ? end.error
          : new Error(`${this.options.sessionName} exited (${String(end.exitCode ?? end.signal)}).`),
      );
    })();
    const handshakeTimer = setTimeout(() => {
      this.requestTermination(new Error(`${this.options.sessionName} handshake timed out.`));
    }, this.options.requestTimeout || 120_000);
    handshakeTimer.unref();
    try {
      await this.ready;
    } catch (error) {
      throw handshake.exitedBeforeReady ? await this.reverified(error) : error;
    } finally {
      clearTimeout(handshakeTimer);
    }
  }

  /* D8: a worker that exits before its handshake is evidence of damage the launch check does not hash. Re-verify the
   * whole runtime and name what differs; with no verifier, or nothing found, the exit stands as it was. */
  private async reverified(error: unknown): Promise<unknown> {
    const verifier = installedVerifier();
    if (verifier === undefined) {
      return error;
    }
    let damage: NativeRuntimeDamage | undefined;
    try {
      damage = await verifier(this.options.runtimePath, AbortSignal.timeout(reverificationTimeout));
    } catch (verificationError) {
      this.options.logger.debug(
        `${this.options.sessionName} runtime re-verification failed: ${verificationError instanceof Error ? verificationError.message : String(verificationError)}`,
      );
      return error;
    }
    if (damage === undefined || damage.files.length === 0) {
      return error;
    }
    const shown = damage.files.slice(0, reportedDamagedFiles).join(', ');
    const more =
      damage.files.length > reportedDamagedFiles
        ? ` and ${String(damage.files.length - reportedDamagedFiles)} more`
        : '';
    const exit = error instanceof Error ? error.message.replace(/\.$/u, '') : String(error);
    return new Error(
      `${exit} before it was ready, and re-verifying its runtime at ${this.options.runtimePath} found files that differ from their receipt: ${shown}${more}. ${damage.remedy}`,
      { cause: error },
    );
  }

  private async send<Result, Event = never>(request: NativeProcessRequest<Result, Event>): Promise<Result> {
    const { child } = this;
    if (!child?.stdin.writable) {
      throw new Error(`${this.options.sessionName} is not writable.`);
    }
    const requestId = `${String(this.generation)}:${String(++this.requestSequence)}`;
    return new Promise<Result>((resolve, reject) => {
      const requestTimer =
        this.options.requestTimeout > 0
          ? setTimeout(() => {
              this.requestTermination(new Error(`${this.options.sessionName} ${request.method} request timed out.`));
            }, this.options.requestTimeout)
          : undefined;
      requestTimer?.unref();
      const abort = (): void => {
        if (request.cancelMethod !== undefined && child.stdin.writable) {
          // Cooperative stop: the worker answers this request itself and keeps its resident prefix.
          child.stdin.write(
            `${JSON.stringify({ protocolVersion: this.options.protocolVersion, method: request.cancelMethod, requestId })}\n`,
            'utf8',
          );
          return;
        }
        this.requestTermination(abortReason(request.signal));
      };
      request.signal.addEventListener('abort', abort, { once: true });
      const cleanup = (): void => {
        clearTimeout(requestTimer);
        request.signal.removeEventListener('abort', abort);
      };
      this.pending.set(requestId, {
        parseResult: request.parseResult,
        resolve: resolve as (value: unknown) => void,
        reject,
        cleanup,
        events: request.events as PendingRequest['events'],
        lastEventSequence: 0,
      });
      child.stdin.write(
        `${JSON.stringify({ protocolVersion: this.options.protocolVersion, requestId, method: request.method, params: request.params })}\n`,
        'utf8',
        (error: unknown) => {
          if (error instanceof Error) {
            this.requestTermination(error);
          }
        },
      );
    });
  }

  /* Linear in the bytes received: the unfinished tail is kept as chunks with a running byte count, and a chunk's
   * lines are cut by offset rather than by re-slicing the remainder after each one. */
  private onStdout(chunk: Uint8Array<ArrayBuffer>): void {
    const text = this.decoder.write(chunk);
    let start = 0;
    let newline = text.indexOf('\n');
    while (newline >= 0) {
      const piece = text.slice(start, newline);
      this.stdoutBytes += Buffer.byteLength(piece);
      if (this.stdoutBytes > this.maxProtocolLineBytes) {
        this.oversizedFrame();
        return;
      }
      this.stdoutChunks.push(piece);
      const line = this.stdoutChunks.join('');
      this.stdoutChunks = [];
      this.stdoutBytes = 0;
      this.onLine(line);
      start = newline + 1;
      newline = text.indexOf('\n', start);
    }
    if (start < text.length) {
      const tail = text.slice(start);
      this.stdoutBytes += Buffer.byteLength(tail);
      this.stdoutChunks.push(tail);
      if (this.stdoutBytes > this.maxProtocolLineBytes) {
        this.oversizedFrame();
      }
    }
  }

  private oversizedFrame(): void {
    this.stdoutChunks = [];
    this.stdoutBytes = 0;
    this.requestTermination(new Error(`${this.options.sessionName} emitted an oversized protocol frame.`));
  }

  private onStderr(chunk: Uint8Array<ArrayBuffer>): void {
    const privatePaths = [
      this.options.workspacePath,
      this.options.artifactPath,
      ...this.options.resources.map(({ path }) => dirname(path)),
      dirname(this.options.executablePath),
    ];
    let output = Buffer.from(chunk).toString('utf8');
    for (const path of privatePaths) {
      output = output.replaceAll(path, '<private>');
    }
    this.stderr = (this.stderr + output).slice(-maxStderrBytes);
    this.options.logger.debug(output.trimEnd());
  }

  private onLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.requestTermination(new Error(`${this.options.sessionName} emitted malformed JSON.`, { cause: error }));
      return;
    }
    if (this.resolveReady) {
      try {
        this.options.parseReady(value);
      } catch (error) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an invalid handshake.`, { cause: error }),
        );
        return;
      }
      const { resolveReady } = this;
      this.resolveReady = undefined;
      this.rejectReady = undefined;
      resolveReady();
      return;
    }

    if (isEventFrameCandidate(value)) {
      let eventFrame: NativeProtocolEventFrame;
      try {
        eventFrame = parseEventFrame(value, this.options.protocolVersion);
      } catch (error) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an invalid event frame.`, { cause: error }),
        );
        return;
      }
      const request = this.pending.get(eventFrame.requestId);
      if (!request) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an event for an unknown request: ${eventFrame.requestId}`),
        );
        return;
      }
      const expectedSequence = request.lastEventSequence + 1;
      if (eventFrame.sequence !== expectedSequence) {
        this.requestTermination(
          new Error(
            `${this.options.sessionName} emitted event sequence ${String(eventFrame.sequence)}; expected ${String(expectedSequence)}.`,
          ),
        );
        return;
      }
      if (!request.events) {
        this.requestTermination(
          new Error(`${this.options.sessionName} emitted an event for a request without an event subscription.`),
        );
        return;
      }
      try {
        const event = request.events.parseEvent(eventFrame.event);
        const callbackResult = request.events.onEvent(event);
        if (isPromiseLike(callbackResult)) {
          throw new Error('native process event callbacks must be synchronous');
        }
      } catch (error) {
        this.requestTermination(
          new Error(`${this.options.sessionName} event payload failed validation or delivery.`, { cause: error }),
        );
        return;
      }
      request.lastEventSequence = eventFrame.sequence;
      return;
    }

    let response: NativeProtocolResponse<Issue>;
    try {
      response = this.options.parseResponse(value);
    } catch (error) {
      this.requestTermination(
        new Error(`${this.options.sessionName} emitted an invalid response frame.`, { cause: error }),
      );
      return;
    }
    const request = this.pending.get(response.requestId);
    if (!request) {
      this.requestTermination(
        new Error(`${this.options.sessionName} emitted an unknown response id: ${response.requestId}`),
      );
      return;
    }
    this.pending.delete(response.requestId);
    request.cleanup();
    if ('issues' in response) {
      request.reject(new NativeWorkerReportedError(response.issues));
      return;
    }
    try {
      request.resolve(request.parseResult(response.result));
    } catch (error) {
      request.reject(new Error(`${this.options.sessionName} response result failed validation.`, { cause: error }));
      this.requestTermination(new Error(`${this.options.sessionName} violated its result schema.`));
    }
  }

  private fail(child: NativeWorkerProcess, error: Error): void {
    if (this.child !== child) {
      return;
    }
    this.child = undefined;
    this.ready = undefined;
    this.rejectReady?.(error);
    this.resolveReady = undefined;
    this.rejectReady = undefined;
    for (const request of this.pending.values()) {
      request.cleanup();
      request.reject(error);
    }
    this.pending.clear();
  }
}
