/**
 * Worker entry for `native-kernel-deadline.integration.test.ts`: a runtime kernel whose evaluation is one request to a
 * real native child process through {@link NativeProcessSession}, hosted with `nodeWorkerHost` in a real
 * `worker_threads` worker, as a native kernel runs in a node runtime realm.
 *
 * The child is the script named in `workerData`. A host that brokers native launches installs a launcher; this one
 * spawns the child directly in its own process group, unsandboxed, so the session's cancel, kill fallback and
 * respawn run for real without an OS sandbox on the test machine. The child keeps its own log; the kernel posts what
 * it saw (its entry, its cancel and how its native request settled) on the port in `workerData`. Neither travels the
 * runtime wire.
 *
 * @internal
 */

import { spawn } from 'node:child_process';
import { workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import { createKernelSuccess, defineKernel } from '@taucad/runtime/kernel';
import { nodeWorkerHost } from '@taucad/runtime/transport/node';
import type { RuntimeLogger } from '@taucad/runtime/types';
import { createRuntimeWorker, defineRuntime } from '@taucad/runtime/worker';
import { installNativeWorkerLauncher, NativeProcessSession, terminateProcessTree } from '#index.js';

/** What the test hands the worker. */
export type NativeKernelWorkerData = Readonly<{
  /** The child script, run with this Node binary. */
  childPath: string;
  /** The file the child appends its own log to. */
  logPath: string;
  /** Scratch directories the session requires. */
  workspacePath: string;
  artifactPath: string;
  /** The session's own kill fallback for one request. Milliseconds; zero waits forever. */
  requestTimeout: number;
  /** The kernel's own record. */
  record: MessagePort;
}>;

/** One line of the kernel's own record. */
export type KernelRecord =
  | Readonly<{ kind: 'entered'; mode: string }>
  | Readonly<{ kind: 'abort-seen'; reason: unknown }>
  | Readonly<{ kind: 'settled'; mode: string; result: 'resolved' | 'rejected'; generation: number }>;

const data = workerData as NativeKernelWorkerData;
data.record.unref();

const post = (line: KernelRecord): void => {
  data.record.postMessage(line);
};
const quiet = (): void => undefined;
const logger: RuntimeLogger = { log: quiet, debug: quiet, trace: quiet, warn: quiet, error: quiet, custom: quiet };

installNativeWorkerLauncher(async (launch) => {
  const child = spawn(launch.executablePath, [...launch.arguments], { detached: true, stdio: 'pipe' });
  const ended = new Promise<{ exitCode?: number; signal?: NodeJS.Signals } | { error: Error }>((resolve) => {
    child.once('exit', (exitCode, signal) => {
      resolve({ ...(exitCode === null ? {} : { exitCode }), ...(signal === null ? {} : { signal }) });
    });
    child.once('error', (error) => {
      resolve({ error });
    });
  });
  return {
    stdin: child.stdin,
    stdout: child.stdout,
    stderr: child.stderr,
    ended,
    terminate: async () => terminateProcessTree(child),
  };
});

const session = new NativeProcessSession<{ message: string }>({
  executablePath: process.execPath,
  executableSha256: 'launched-by-the-installed-launcher',
  arguments: [data.childPath, data.logPath],
  runtimePath: data.workspacePath,
  workspacePath: data.workspacePath,
  artifactPath: data.artifactPath,
  resources: [],
  protocolVersion: 1,
  parseReady(value) {
    if ((value as { type?: unknown }).type !== 'ready') {
      throw new Error('bad ready');
    }
  },
  parseResponse(value) {
    const record = value as { requestId: string; result?: unknown; issues?: Array<{ message: string }> };
    return record.issues === undefined
      ? { requestId: record.requestId, result: record.result }
      : { requestId: record.requestId, issues: record.issues };
  },
  requestTimeout: data.requestTimeout,
  maxArtifactBytes: 1024,
  logger,
  sessionName: 'Fixture native',
  executableName: 'fixture native executable',
});

const parameters = {
  schema: {
    $schema: 'https://json-structure.org/meta/extended/v0/#',
    $id: 'urn:taucad:test:native-deadline',
    $uses: ['JSONSchemaUnits'],
    name: 'NativeDeadlineParameters',
    type: 'object',
  },
  defaults: {},
} as const;

const nativeKernel = defineKernel({
  id: 'native-kernel',
  extensions: ['native'] as const,
  name: 'Native kernel',
  version: '1.0.0',
  views: { primary: { title: 'Primary', mimeType: 'image/svg+xml' } },
  exports: {},
  async initialize() {
    return {};
  },
  async resolve({ entryPath }) {
    return { resolved: [entryPath], unresolved: [] };
  },
  async describe() {
    return createKernelSuccess({ parameters });
  },
  async evaluate({ entryPath }, { signal }) {
    const mode = entryPath.endsWith('stuck.native') ? 'stuck' : 'ok';
    post({ kind: 'entered', mode });
    const seeAbort = (): void => {
      post({ kind: 'abort-seen', reason: signal.reason as unknown });
    };
    signal.addEventListener('abort', seeAbort, { once: true });
    // A cooperative native kernel: an abort sends `cancel`, and the session's request timeout is the kill fallback.
    try {
      await session.request({
        method: 'work',
        params: { mode },
        parseResult: (value) => value,
        signal,
        cancelMethod: 'cancel',
      });
      post({ kind: 'settled', mode, result: 'resolved', generation: session.generation });
    } catch (error) {
      post({ kind: 'settled', mode, result: 'rejected', generation: session.generation });
      throw error;
    } finally {
      // Only a cancel that reaches the native call is recorded; closing a finished document is not one.
      signal.removeEventListener('abort', seeAbort);
    }
    return { handle: {}, views: ['primary'] as const, exports: [] as const };
  },
  async render() {
    return { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' };
  },
});

await nodeWorkerHost({
  worker: createRuntimeWorker({ runtime: defineRuntime({ kernels: [nativeKernel()] }) }),
}).open();
