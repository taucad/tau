/**
 * Native kernel workers on Windows, contained by `tau-windows-sandbox.exe launch` (`windows-sandbox/README.md`, "Launch
 * protocol"): the same helper and the same one-time setup as the contained shell, with a per-launch AppContainer
 * package SID, read on the runtime root and the workspace mirror, write on the artifact root only, no network, and the
 * helper's kill-on-close job. The helper hashes the executable through a handle it holds until the process exists, so
 * a launch names the digest the host verified.
 *
 * The POSIX sandbox wraps a command line; Windows contains a process through a framed conversation with the helper.
 * {@link windowsNativeLaunchVector} therefore returns the helper's own command line carrying the launch, and
 * {@link spawnWindowsNative} speaks the protocol and answers as a child process whose standard streams are the worker's
 * and whose `exit` comes only once the helper has restored every folder permission it changed.
 *
 * Crash recovery: each launch journals its permission changes at `<journalDirectory>/<id>.acl.json` and records its
 * owner and helper processes at `<id>.native.json` before anything starts. {@link recoverWindowsNativeJournals} runs the
 * helper's `restore` for every journal whose owner and helper are gone, once, before this host's first launch.
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { realpathSync } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, Writable } from 'node:stream';

import { z } from 'zod';

import {
  createWindowsFrameDecoder,
  decodeWindowsHelperFrame,
  encodeWindowsFrame,
  encodeWindowsHostFrame,
  windowsSandboxProtocolVersion,
} from '#shell/windows-sandbox-protocol.js';
import type { WindowsHelperFrame, WindowsLaunchSpec } from '#shell/windows-sandbox-protocol.js';

/** Starts the helper with arguments; tests replace it with a stand-in. @public */
export type WindowsNativeHelperSpawn = (arguments_: readonly string[]) => ChildProcessWithoutNullStreams;

/**
 * How this host reaches the Windows sandbox for native workers. The services host configures it, from the same
 * helper, gate and install the contained shell uses, before its first native launch.
 *
 * @public
 */
export type WindowsNativeSandboxOptions = Readonly<{
  /** `tau-windows-sandbox.exe`, as the shell's composition resolves it. */
  helperPath: string;
  /** A host-owned directory outside every grant for this host's launch journals and receipts. */
  journalDirectory: string;
  /** Whether the helper's one-time elevated setup has run (its `status`). */
  installed: () => Promise<boolean>;
  /**
   * Run the one-time elevated setup (one UAC prompt) when {@link WindowsNativeSandboxOptions.installed} answers
   * `false`; rejects when the person declines it or it fails. Absent, a launch on a host without the setup is
   * unavailable.
   */
  setup?: (() => Promise<void>) | undefined;
  /** Starts the helper; defaults to spawning {@link WindowsNativeSandboxOptions.helperPath} without a window. */
  spawnHelper?: WindowsNativeHelperSpawn | undefined;
  /** Whether a process exists; defaults to a signal-0 probe, which reads another account's process as alive. */
  processAlive?: ((pid: number) => boolean) | undefined;
  /**
   * How long, in milliseconds, a launch waits for another sandboxed launch on this computer to end (the helper runs
   * one at a time) before it reports the helper's refusal; default 30 seconds.
   */
  busyWait?: number | undefined;
}>;

/** The launch the host hands the helper: the shell's spec, with the native fields of protocol version 1. @public */
export type WindowsNativeLaunchSpec = WindowsLaunchSpec &
  Readonly<{
    /** `sha256:<64 lowercase hex>`: required for an executable outside `%ProgramFiles%` and `%SystemRoot%`. */
    executableDigest: string;
    stdio: Readonly<{ kind: 'pipes'; input: true }>;
    /** Never set: an omitted network is none at all (the AppContainer has no network capability). */
    network?: undefined;
  }>;

/** The host's own command for one native launch, as {@link windowsNativeLaunchVector} returns it. @public */
export type WindowsNativeLaunchRequest = Readonly<{
  executablePath: string;
  executableSha256: string;
  arguments: readonly string[];
  readablePaths: readonly string[];
  writablePath: string;
  workingDirectory: string;
}>;

const launchArgumentPrefix = '--tau-native-launch=';
/** Largest input frame sent; the helper's frame limit is far larger, and a smaller frame keeps the pipe moving. */
const inputFrameBytes = 1024 * 1024;
/** Host frame `close-input` (`0x06`): the worker's standard input reaches end of file. */
const closeInputFrameType = 0x06;
const hexDigest = /^[\da-f]{64}$/u;

const receiptSchema = z.strictObject({
  version: z.literal(1),
  executionId: z.uuid(),
  owner: z.strictObject({ pid: z.number().int().positive() }),
  launcherPid: z.number().int().positive().optional(),
  runnerPid: z.number().int().positive().optional(),
});
type Receipt = z.infer<typeof receiptSchema>;

const carriedLaunchSchema = z.strictObject({
  executionId: z.uuid(),
  executablePath: z.string().min(1),
  executableSha256: z.string().regex(hexDigest),
  arguments: z.array(z.string()),
  readablePaths: z.array(z.string().min(1)),
  writablePath: z.string().min(1),
  workingDirectory: z.string().min(1),
});
type CarriedLaunch = z.infer<typeof carriedLaunchSchema>;

let configured: WindowsNativeSandboxOptions | undefined;
let installation: Promise<void> | undefined;
let recovery: Promise<void> | undefined;

/**
 * Configure, or with `undefined` clear, how native workers reach the Windows sandbox in this process.
 *
 * @public
 * @param options - The helper, its journal directory and its install check.
 */
export const configureWindowsNativeSandbox = (options: WindowsNativeSandboxOptions | undefined): void => {
  configured = options;
  installation = undefined;
  recovery = undefined;
};

/**
 * Why this host cannot contain a native worker, for the preparation host's `nativeContainment`: refused before
 * anything downloads. Windows contains native workers only once a host configured the helper
 * ({@link configureWindowsNativeSandbox}); every other OS contains them in its own sandbox.
 *
 * @public
 * @param indicators - The host's operating system.
 * @param packageName - The package whose native variant is asked for.
 * @returns The refusal, or `undefined` when this host contains native workers.
 */
export const nativeSandboxRefusal = (indicators: Readonly<{ os: string }>, packageName: string): string | undefined =>
  indicators.os === 'win32' && configured === undefined
    ? `Native kernels do not run on Windows in this Tau: it has no Windows sandbox, and no native worker runs unsandboxed. Use macOS or Linux (glibc) for ${packageName}.`
    : undefined;

const defaultProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
  }
};

const helperSpawn = (options: WindowsNativeSandboxOptions): WindowsNativeHelperSpawn =>
  options.spawnHelper ??
  ((arguments_) =>
    spawn(options.helperPath, [...arguments_], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    }));

const journalDirectoryOf = async (options: WindowsNativeSandboxOptions): Promise<string> => {
  await mkdir(options.journalDirectory, { recursive: true, mode: 0o700 });
  return realpath(options.journalDirectory);
};

const receiptPath = (directory: string, executionId: string): string => join(directory, `${executionId}.native.json`);
/** Derived, never read from a receipt, so a rewritten receipt cannot aim `restore` elsewhere. */
const journalPath = (directory: string, executionId: string): string => join(directory, `${executionId}.acl.json`);

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

/* Written and flushed, then renamed into place, so a crash leaves the old receipt or the new one. */
const persistReceipt = async (directory: string, receipt: Receipt): Promise<void> => {
  const target = receiptPath(directory, receipt.executionId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(receipt));
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
};

/** Run the helper's `restore --journal <path>`; resolves only when the helper confirms and the journal is gone. */
const restoreJournal = async (options: WindowsNativeSandboxOptions, journal: string): Promise<void> => {
  const helper = helperSpawn(options)(['restore', '--journal', journal]);
  helper.stdin.end();
  let diagnostic = '';
  helper.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    diagnostic = `${diagnostic}${chunk}`.slice(-2000);
  });
  helper.stdout.resume();
  const code = await new Promise<number | undefined>((resolve, reject) => {
    helper.once('error', reject);
    helper.once('close', (exitCode) => {
      resolve(exitCode ?? undefined);
    });
  });
  if (code !== 0 || (await exists(journal))) {
    throw new Error(
      `The Windows sandbox could not restore the folder permissions of an earlier native launch (${journal}): ${diagnostic.trim() || `exit ${String(code)}`}`,
    );
  }
};

/**
 * Restore every journal an earlier native launch of any Tau process left behind, when its owner and its helper are
 * gone, and forget receipts with nothing left to restore. A journal whose owner or helper still runs is left alone.
 *
 * @public
 * @param options - The configured sandbox.
 * @returns Once every such journal is restored.
 * @throws {Error} When the helper cannot restore one: a later launch must not grant over unrestored permissions.
 */
export const recoverWindowsNativeJournals = async (options: WindowsNativeSandboxOptions): Promise<void> => {
  const directory = await journalDirectoryOf(options);
  const alive = options.processAlive ?? defaultProcessAlive;
  const names = await readdir(directory);
  for (const name of names.filter((entry) => /^[\da-f-]{36}\.native\.json$/u.test(entry)).toSorted()) {
    const executionId = name.slice(0, -'.native.json'.length);
    // oxlint-disable-next-line no-await-in-loop -- one restore at a time: each runs the helper.
    const receipt = receiptSchema.parse(JSON.parse(await readFile(join(directory, name), 'utf8')));
    if (receipt.executionId !== executionId) {
      throw new Error(`Native sandbox receipt ${name} names another launch.`);
    }
    const running = [receipt.owner.pid, receipt.launcherPid, receipt.runnerPid].some(
      (pid) => pid !== undefined && pid !== process.pid && alive(pid),
    );
    if (running || receipt.owner.pid === process.pid) {
      continue;
    }
    const journal = journalPath(directory, executionId);
    // oxlint-disable-next-line no-await-in-loop -- see above.
    if (await exists(journal)) {
      // oxlint-disable-next-line no-await-in-loop -- see above.
      await restoreJournal(options, journal);
    }
    // oxlint-disable-next-line no-await-in-loop -- see above.
    await rm(join(directory, name), { force: true });
  }
};

/**
 * Whether this process can contain a native worker on Windows: the sandbox is configured, set up (running the
 * one-time setup once when it is configured to) and every journal an earlier crash left is restored.
 *
 * @public
 * @returns The configured sandbox.
 * @throws {Error} With the reason when it cannot; the caller reports the native runtime unavailable.
 */
export const ensureWindowsNativeSandbox = async (): Promise<WindowsNativeSandboxOptions> => {
  const options = configured;
  if (options === undefined) {
    throw new Error('the Windows sandbox is not enabled in this Tau build');
  }
  installation ??= (async () => {
    if (await options.installed()) {
      return;
    }
    if (options.setup === undefined) {
      throw new Error('the Windows sandbox has not been set up on this computer');
    }
    await options.setup();
    if (!(await options.installed())) {
      throw new Error('the Windows sandbox setup did not complete');
    }
  })();
  recovery ??= (async () => {
    await installation;
    await recoverWindowsNativeJournals(options);
  })();
  const attempt = recovery;
  try {
    await attempt;
  } catch (error) {
    // A later launch retries: the person may accept the setup prompt they declined, or a restore may now succeed.
    if (recovery === attempt) {
      installation = undefined;
      recovery = undefined;
    }
    throw error;
  }
  return options;
};

/**
 * The helper command line for one native launch: the helper, `launch`, and the launch itself, which
 * {@link spawnWindowsNative} sends as the spec frame. It records the launch's receipt before anything starts.
 *
 * @public
 * @param request - Executable and its verified digest, arguments and the paths it may use.
 * @returns The vector.
 * @throws {Error} When the sandbox is unavailable or the digest is malformed.
 */
export const windowsNativeLaunchVector = async (request: WindowsNativeLaunchRequest): Promise<readonly string[]> => {
  const options = await ensureWindowsNativeSandbox();
  if (!hexDigest.test(request.executableSha256)) {
    throw new Error('a native launch on Windows needs its executable’s verified sha256 digest');
  }
  const directory = await journalDirectoryOf(options);
  const executionId = randomUUID();
  await persistReceipt(directory, { version: 1, executionId, owner: { pid: process.pid } });
  const carried: CarriedLaunch = {
    executionId,
    /* The helper refuses a path whose final name differs (a link, a junction, an 8.3 short name): pass the long one. */
    executablePath: await realpath(request.executablePath),
    executableSha256: request.executableSha256,
    arguments: [...request.arguments],
    readablePaths: [...request.readablePaths],
    writablePath: request.writablePath,
    workingDirectory: request.workingDirectory,
  };
  return [
    options.helperPath,
    'launch',
    `${launchArgumentPrefix}${Buffer.from(JSON.stringify(carried), 'utf8').toString('base64url')}`,
  ];
};

const readCarriedLaunch = (vector: readonly string[]): CarriedLaunch => {
  const argument = vector[2];
  if (vector.length !== 3 || vector[1] !== 'launch' || !argument?.startsWith(launchArgumentPrefix)) {
    throw new Error('Not a Windows native sandbox launch vector.');
  }
  return carriedLaunchSchema.parse(
    JSON.parse(Buffer.from(argument.slice(launchArgumentPrefix.length), 'base64url').toString('utf8')),
  );
};

const stringEnvironment = (environment: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );

/**
 * The spec frame for one launch: the worker's paths, environment and digest, with no network.
 *
 * @internal
 * @param launch - The carried launch.
 * @param environment - The worker's environment.
 * @param journal - Where the helper journals each descriptor it changes.
 * @returns The spec.
 */
export const windowsNativeLaunchSpec = (
  launch: Omit<CarriedLaunch, 'executionId'>,
  environment: NodeJS.ProcessEnv,
  journal: string,
): WindowsNativeLaunchSpec => ({
  version: windowsSandboxProtocolVersion,
  executable: launch.executablePath,
  executableDigest: `sha256:${launch.executableSha256}`,
  arguments: launch.arguments,
  workingDirectory: launch.workingDirectory,
  environment: stringEnvironment(environment),
  stdio: { kind: 'pipes', input: true },
  filesystem: { readable: launch.readablePaths, writable: [launch.writablePath], readOnly: [], denied: [] },
  journal,
});

const sandboxedChild = Symbol('tau.windowsSandboxedChild');

/** How long a launch waits for another sandboxed launch on this computer to end before it reports the refusal. */
const busyWaitMilliseconds = 30_000;
const busyBackoffMilliseconds = 100;
const busyBackoffCeilingMilliseconds = 2000;

/**
 * Whether the helper refused because another sandboxed launch holds the computer's descriptor lock (README,
 * Sessions): nothing changed, so asking again once it ends is safe.
 *
 * @param refusal - The helper's refusal.
 * @returns Whether to ask again.
 */
const isBusyRefusal = (refusal: Readonly<{ status: string; message: string }>): boolean =>
  refusal.status === 'sandbox-unavailable' && refusal.message.startsWith('another sandboxed launch is running');

/**
 * Whether a child came from {@link spawnWindowsNative}: ending it is the helper's `terminate`, so the helper still
 * restores permissions, never a process-tree kill of the helper.
 *
 * @public
 * @param child - A child process.
 * @returns Whether it is a Windows sandboxed native worker.
 */
export const isWindowsSandboxedChild = (child: ChildProcessWithoutNullStreams): boolean => sandboxedChild in child;

/**
 * Start the helper for a vector from {@link windowsNativeLaunchVector} and speak the launch protocol. The answer is a
 * child process: `stdin`, `stdout` and `stderr` are the worker's; `kill()` sends `terminate`; `exit` and `close` come
 * once the helper reported the worker's exit and restored every permission, or, when the helper died first, once this
 * host ran its `restore`. A refusal before anything ran is an `error`.
 *
 * @public
 * @param vector - The launch vector.
 * @param options - The worker's working directory and environment.
 * @returns The worker, as a child process.
 */
export const spawnWindowsNative = (
  vector: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): ChildProcessWithoutNullStreams => {
  const sandbox = configured;
  const { executionId, ...launch } = readCarriedLaunch(vector);
  // oxlint-disable-next-line unicorn/prefer-event-target -- the answer stands in for a ChildProcess, an EventEmitter.
  const child = new EventEmitter() as EventEmitter & {
    -readonly [Key in keyof ChildProcessWithoutNullStreams]: ChildProcessWithoutNullStreams[Key];
  } & { [sandboxedChild]: true };
  if (sandbox === undefined || vector[0] !== sandbox.helperPath) {
    throw new Error('The Windows native sandbox is not configured for this launch vector.');
  }
  const directory = realpathSync(sandbox.journalDirectory);
  const spawnHelper = helperSpawn(sandbox);
  let helper = spawnHelper(['launch']);
  let decoder = createWindowsFrameDecoder();
  const firstAttempt = Date.now();
  let busyRetries = 0;
  let busy = false;
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let phase: 'awaiting-ready' | 'arming' | 'starting' | 'running' | 'ended' = 'awaiting-ready';
  let reported: Extract<WindowsHelperFrame, { type: 'exit' }>['exit'] | undefined;
  let refusal: string | undefined;
  let cleanupFailure: string | undefined;
  let protocolFailure: Error | undefined;
  /* Read through a call, so a check after an await sees the phase as it is then. */
  const inPhase = (expected: typeof phase): boolean => phase === expected;
  const queued: Array<Uint8Array<ArrayBuffer>> = [];
  let inputEnded = false;

  const sendToHelper = (bytes: Uint8Array<ArrayBuffer>, callback?: () => void): void => {
    if (helper.stdin.writable) {
      helper.stdin.write(bytes, callback);
    } else {
      callback?.();
    }
  };
  const inputFrames = (chunk: Uint8Array<ArrayBuffer>): Array<Uint8Array<ArrayBuffer>> => {
    const frames: Array<Uint8Array<ArrayBuffer>> = [];
    for (let offset = 0; offset < chunk.byteLength; offset += inputFrameBytes) {
      frames.push(encodeWindowsHostFrame({ type: 'input', bytes: chunk.slice(offset, offset + inputFrameBytes) }));
    }
    return frames;
  };
  const closeInput = (): void => {
    sendToHelper(encodeWindowsFrame(closeInputFrameType, new Uint8Array(0)));
  };
  const flush = (): void => {
    for (const frame of queued.splice(0)) {
      sendToHelper(frame);
    }
    if (inputEnded) {
      closeInput();
    }
  };

  child.stdin = new Writable({
    write(chunk: Uint8Array<ArrayBuffer>, _encoding, callback) {
      const frames = inputFrames(new Uint8Array(chunk));
      if (phase !== 'running') {
        queued.push(...frames);
        callback();
        return;
      }
      const last = frames.pop();
      for (const frame of frames) {
        sendToHelper(frame);
      }
      if (last === undefined) {
        callback();
      } else {
        sendToHelper(last, callback);
      }
    },
    final(callback) {
      inputEnded = true;
      if (phase === 'running') {
        closeInput();
      }
      callback();
    },
  });
  child.stdout = stdout as unknown as ChildProcessWithoutNullStreams['stdout'];
  child.stderr = stderr as unknown as ChildProcessWithoutNullStreams['stderr'];
  child.stdio = [child.stdin, child.stdout, child.stderr, undefined, undefined] as never;
  child.pid = helper.pid;
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child[sandboxedChild] = true;
  child.kill = (): boolean => {
    if (phase === 'ended') {
      return false;
    }
    child.killed = true;
    // Terminate ends the job; closing the helper's input ends it too, should the frame not arrive.
    sendToHelper(encodeWindowsHostFrame({ type: 'terminate' }));
    helper.stdin.end();
    return true;
  };

  const fail = (error: Error): void => {
    protocolFailure ??= error;
    child.kill();
  };

  const arm = async (pids: Readonly<{ launcherPid: number; runnerPid: number }>): Promise<void> => {
    await persistReceipt(directory, { version: 1, executionId, owner: { pid: process.pid }, ...pids });
  };

  const onFrame = (frame: WindowsHelperFrame): void => {
    switch (frame.type) {
      case 'ready': {
        if (phase !== 'awaiting-ready') {
          fail(new Error('The Windows sandbox helper reported ready twice.'));
          return;
        }
        phase = 'arming';
        // async-iife: bootstrap -- the start frame waits for the durable record; a failure ends the launch.
        void (async () => {
          try {
            // The helper's processes are on record before the worker starts, so a crash from here on is recoverable.
            await arm({ launcherPid: frame.ready.launcherPid, runnerPid: frame.ready.runnerPid });
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
            return;
          }
          if (inPhase('arming')) {
            phase = 'starting';
            sendToHelper(encodeWindowsHostFrame({ type: 'start' }));
          }
        })();
        return;
      }
      case 'started': {
        if (phase === 'starting') {
          phase = 'running';
          flush();
        }
        return;
      }
      case 'stdout': {
        stdout.write(frame.bytes);
        return;
      }
      case 'stderr':
      case 'output': {
        stderr.write(frame.bytes);
        return;
      }
      case 'exit': {
        reported = frame.exit;
        return;
      }
      case 'refused': {
        busy = phase === 'awaiting-ready' && isBusyRefusal(frame.refusal);
        refusal = frame.refusal.diagnostic
          ? `${frame.refusal.message} (${frame.refusal.diagnostic})`
          : frame.refusal.message;
        return;
      }
      case 'cleanup-failed': {
        cleanupFailure = frame.message;
        break;
      }
    }
  };

  let helperDiagnostic = '';

  const settle = async (helperCode: number | undefined): Promise<void> => {
    phase = 'ended';
    const journal = journalPath(directory, executionId);
    const confirmed = reported !== undefined && cleanupFailure === undefined;
    let restoreFailure: Error | undefined;
    if (confirmed) {
      await rm(journal, { force: true });
    } else if (await exists(journal)) {
      try {
        await restoreJournal(sandbox, journal);
      } catch (error) {
        restoreFailure = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (restoreFailure === undefined) {
      await rm(receiptPath(directory, executionId), { force: true });
    }
    stdout.end();
    stderr.end();
    if (refusal !== undefined && reported === undefined) {
      child.emit('error', new Error(`The Windows sandbox refused the native launch: ${refusal}`));
      return;
    }
    if (restoreFailure !== undefined) {
      // The worker is gone but a folder may still carry its grant: the receipt stays for the next start's recovery.
      child.emit('error', restoreFailure);
      return;
    }
    if (protocolFailure !== undefined) {
      child.emit(
        'error',
        new Error(`The Windows sandbox launch failed: ${protocolFailure.message}`, { cause: protocolFailure }),
      );
      return;
    }
    if (cleanupFailure !== undefined) {
      child.emit(
        'error',
        new Error(`The Windows sandbox could not confirm the native worker's cleanup: ${cleanupFailure}`),
      );
      return;
    }
    if (reported === undefined) {
      const reason = helperDiagnostic.trim() || `the helper exited ${String(helperCode)}`;
      child.emit('error', new Error(`The Windows sandbox helper ended before the native worker did: ${reason}`));
      return;
    }
    // ChildProcess reports an absent code or signal as null.
    const code = reported.exitCode ?? null; // oxlint-disable-line unicorn/no-null -- ChildProcess's own contract.
    const signal = (reported.signal as NodeJS.Signals | undefined) ?? null; // oxlint-disable-line unicorn/no-null -- as above.
    child.exitCode = code;
    child.signalCode = signal;
    child.emit('exit', code, signal);
    child.emit('close', code, signal);
  };

  /*
   * The helper runs one sandboxed launch per computer until concurrent restore lands, and refuses a second at once
   * with nothing changed. A launch that finds it busy waits for the other to end, within a bound, by asking again.
   */
  const retryWhenBusy = (): boolean => {
    const waited = Date.now() - firstAttempt;
    if (!busy || child.killed || reported !== undefined || waited >= (sandbox.busyWait ?? busyWaitMilliseconds)) {
      return false;
    }
    const retryDelayMilliseconds = Math.min(busyBackoffMilliseconds * 2 ** busyRetries, busyBackoffCeilingMilliseconds);
    busyRetries += 1;
    busy = false;
    setTimeout(() => {
      if (child.killed) {
        void settle(undefined);
        return;
      }
      refusal = undefined;
      helperDiagnostic = '';
      helper = spawnHelper(['launch']);
      decoder = createWindowsFrameDecoder();
      child.pid = helper.pid;
      attach();
    }, retryDelayMilliseconds).unref();
    return true;
  };

  const attach = (): void => {
    const current = helper;
    current.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      try {
        for (const raw of decoder.push(new Uint8Array(chunk))) {
          onFrame(decodeWindowsHelperFrame(raw));
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    current.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      helperDiagnostic = `${helperDiagnostic}${chunk}`.slice(-2000);
    });
    current.stdin.on('error', () => {
      // The helper closing its input first is reported through its exit.
    });
    current.once('error', (error) => {
      phase = 'ended';
      stdout.end();
      stderr.end();
      // async-iife: bootstrap -- nothing ran, so only the receipt is left; the caller hears the error.
      void (async () => {
        await rm(receiptPath(directory, executionId), { force: true });
        child.emit('error', error);
      })();
    });
    current.once('close', (code) => {
      if (retryWhenBusy()) {
        return;
      }
      // async-iife: bootstrap -- settlement reaches the caller as this child's own exit or error.
      void settle(code ?? undefined);
    });
    sendToHelper(
      encodeWindowsHostFrame({
        type: 'spec',
        spec: windowsNativeLaunchSpec(
          { ...launch, workingDirectory: options.cwd },
          options.env,
          journalPath(directory, executionId),
        ),
      }),
    );
  };
  attach();
  return child as unknown as ChildProcessWithoutNullStreams;
};
