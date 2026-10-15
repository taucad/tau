import { StringDecoder } from 'node:string_decoder';

import { processEnvironment, terminateProcessTree } from '#native-process-session.js';
import {
  acquireNativeSandbox,
  launchInNativeSandbox,
  releaseNativeSandbox,
  spawnInNativeSandbox,
} from '#native-sandbox.js';
import type { NativeSandboxLaunch } from '#native-sandbox.js';

/** Characters of each output stream kept; a longer stream keeps its tail. */
const outputLimit = 64 * 1024;

/**
 * One host-owned command run to completion inside the fixed Tau sandbox.
 * @public
 */
export type NativeSandboxCommand = NativeSandboxLaunch & {
  /** Aborting terminates the command's process tree. */
  readonly signal?: AbortSignal;
};

/**
 * How a sandboxed command ended.
 * @public
 */
export type NativeSandboxCommandResult = {
  /** The exit code, or `undefined` when a signal ended the command. */
  readonly exitCode: number | undefined;
  /** The signal that ended the command, when one did. */
  readonly signal: NodeJS.Signals | undefined;
  /** The tail of standard output, decoded as UTF-8. */
  readonly stdout: string;
  /** The tail of standard error, decoded as UTF-8. */
  readonly stderr: string;
};

const tail = (text: string): string => (text.length > outputLimit ? text.slice(-outputLimit) : text);

/**
 * Run one command inside the fixed Tau sandbox and wait for it to exit: the same profile every native worker gets
 * (no network, reads only under `readablePaths`, writes only under `writablePath`). Host-side seal steps, such as
 * compiling a prepared Python closure's bytecode, use it so no native code ever runs unsandboxed.
 *
 * @public
 * @param command - Executable, arguments, the paths it may use and an optional abort signal.
 * @returns The exit status and the tails of both output streams.
 * @throws {NativeRuntimeUnavailableError} When the sandbox cannot start; nothing is spawned.
 */
export const runInNativeSandbox = async (command: NativeSandboxCommand): Promise<NativeSandboxCommandResult> => {
  command.signal?.throwIfAborted();
  acquireNativeSandbox();
  try {
    const child = spawnInNativeSandbox(await launchInNativeSandbox(command), {
      cwd: command.workingDirectory,
      env: processEnvironment(command.writablePath),
    });
    child.stdin.end();
    const stdout = new StringDecoder('utf8');
    const stderr = new StringDecoder('utf8');
    let out = '';
    let error = '';
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      out = tail(out + stdout.write(chunk));
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      error = tail(error + stderr.write(chunk));
    });
    const onAbort = (): void => {
      void terminateProcessTree(child);
    };
    command.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const [exitCode, signal] = await new Promise<[number | undefined, NodeJS.Signals | undefined]>(
        (resolve, reject) => {
          child.once('error', reject);
          child.once('close', (code, closeSignal) => {
            resolve([code ?? undefined, closeSignal ?? undefined]);
          });
        },
      );
      command.signal?.throwIfAborted();
      return { exitCode, signal, stdout: tail(out + stdout.end()), stderr: tail(error + stderr.end()) };
    } finally {
      command.signal?.removeEventListener('abort', onAbort);
    }
  } finally {
    await releaseNativeSandbox();
  }
};
