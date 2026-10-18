import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { NativeProcessSession, NativeWorkerReportedError } from '@taucad/native-process-core';
import type { NativeProtocolResponse } from '@taucad/native-process-core';
import type { RuntimeLogger } from '@taucad/runtime/kernel';
import { z } from 'zod';

import { pythonSupportModules } from '#python-kernel.js';
import type { PythonKernelWorker } from '#python-kernel.js';
import {
  pythonArtifactSchema,
  pythonIssueSchema,
  pythonProtocolVersion,
  pythonReadySchema,
  pythonResponseSchema,
} from '#python-protocol.js';
import type { PythonArtifact, PythonIssue } from '#python-protocol.js';

/**
 * Host-owned paths, integrity evidence and limits for one Python session.
 *
 * The interpreter lives at `<runtime>/bin/python3`; that runtime root, or the closure root a sealed closure names as
 * `runtimePath`, is the only host path the sandbox lets the worker read besides its workspace mirror.
 * @public
 */
export type PythonSessionOptions = {
  /** The kernel whose worker this session runs. */
  readonly worker: PythonKernelWorker;
  readonly pythonExecutable: string;
  readonly workerPath: string;
  /** The root the sandbox may read; defaults to the interpreter's prefix (`<runtime>/bin/python3`). */
  readonly runtimePath?: string;
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly pythonSha256: string;
  readonly workerSha256: string;
  readonly supportFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
  /** Milliseconds; zero waits for completion or cancellation. */
  readonly requestTimeout: number;
  readonly maxArtifactBytes: number;
  readonly logger: RuntimeLogger;
};

/**
 * One request to the worker; `schema` validates its result.
 * @public
 */
export type PythonRequest<Result> = {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly schema: z.ZodType<Result>;
  readonly signal: AbortSignal;
  /** Ask the worker to stop at its own operation boundary instead of recycling it. */
  readonly cancelMethod?: string;
};

/**
 * Error carrying the issues a Python worker reported for one request.
 * @public
 */
export class PythonWorkerError extends Error {
  public readonly issues: PythonIssue[];

  public constructor(issues: readonly PythonIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = [...issues];
    this.name = 'PythonWorkerError';
  }
}

/**
 * One serialized, generation-scoped CPython worker session.
 * @public
 */
export type PythonSession = {
  /** Current native worker generation; a recycled worker starts the next one. */
  readonly generation: number;
  /**
   * Execute one validated request through the bounded worker protocol. A request cancelled through its signal
   * settles as the caller's abort; worker issues reject with `PythonWorkerError`.
   */
  request<Result>(request: PythonRequest<Result>): Promise<Result>;
  /** Whether a handle from `generation` still belongs to the live worker. */
  isHandleGenerationValid(generation: number): boolean;
  /** Release a worker-retained handle (`release` with `{ handleId }`) without delaying caller disposal. */
  release(handleId: string, generation: number): void;
  /** Read and consume one artifact the worker wrote into the private artifact directory. */
  readArtifact(artifact: PythonArtifact): Promise<Uint8Array<ArrayBuffer>>;
  /** Write bytes into the private artifact directory for the worker to read, under a fresh name ending in `suffix`. */
  writeArtifact(payload: Uint8Array<ArrayBuffer>, suffix: string): Promise<PythonArtifact>;
  /** Run a best-effort operation that `cleanup` drains; its failure is ignored, as a failed session invalidates it. */
  background(operation: Promise<unknown>): void;
  /** Drain background operations and terminate the native worker. */
  cleanup(): Promise<void>;
};

const parseReady = (value: unknown): void => {
  pythonReadySchema.parse(value);
};

const parseResponse = (value: unknown): NativeProtocolResponse<PythonIssue> => {
  const response = pythonResponseSchema.parse(value);
  if ((response.result === undefined) === (response.error === undefined)) {
    throw new Error('Expected exactly one of result or error.');
  }
  return response.error
    ? { requestId: response.requestId, issues: response.error.issues }
    : { requestId: response.requestId, result: response.result };
};

/** What `release` answers. */
const emptySchema = z.object({});
/** What `shutdown` answers. */
const shutdownSchema = z.object({ shutdown: z.literal(true) });

const ignoreFailure = async (operation: Promise<unknown>): Promise<void> => {
  try {
    await operation;
  } catch {
    // Best-effort; session failure invalidates every handle.
  }
};

/**
 * Create a session that launches the kernel's worker with the bundled interpreter (`-I -B -u`, then the workspace,
 * artifact directory and parent process id as arguments) inside the native sandbox, after verifying the interpreter,
 * the worker and every support module against their digests.
 *
 * @param options - The worker, its verified files, the session's private paths and limits.
 * @returns The session; nothing launches before the first request.
 * @public
 */
export const createPythonSession = (options: PythonSessionOptions): PythonSession => {
  const { kernelName } = options.worker;
  const session = new NativeProcessSession<PythonIssue>({
    executablePath: options.pythonExecutable,
    executableSha256: options.pythonSha256,
    arguments: [
      '-I',
      '-B',
      '-u',
      options.workerPath,
      '--workspace',
      options.workspacePath,
      '--artifacts',
      options.artifactPath,
      '--parent-pid',
      String(process.pid),
    ],
    runtimePath: options.runtimePath ?? resolve(dirname(options.pythonExecutable), '..'),
    workspacePath: options.workspacePath,
    artifactPath: options.artifactPath,
    resources: [
      { path: options.workerPath, sha256: options.workerSha256, label: `${kernelName} worker` },
      ...options.supportFiles.map((file) => ({ ...file, label: `${kernelName} worker support files` })),
    ],
    protocolVersion: pythonProtocolVersion,
    parseReady,
    parseResponse,
    requestTimeout: options.requestTimeout,
    maxArtifactBytes: options.maxArtifactBytes,
    logger: options.logger,
    sessionName: `${kernelName} Python`,
    executableName: 'Bundled Python',
    shutdown: { method: 'shutdown', parseResult: (value) => shutdownSchema.parse(value) },
  });
  let pending: Promise<void> = Promise.resolve();
  let supportFilesValidated = false;

  const validateSupportFiles = (): void => {
    if (supportFilesValidated) {
      return;
    }
    const supportByPath = new Set(options.supportFiles.map(({ path }) => resolve(path)));
    for (const module of pythonSupportModules(options.worker)) {
      if (!supportByPath.has(resolve(dirname(options.workerPath), module))) {
        throw new Error(`${kernelName} worker manifest is missing ${module}.`);
      }
    }
    supportFilesValidated = true;
  };

  const background = (operation: Promise<unknown>): void => {
    const previous = pending;
    pending = (async () => {
      await Promise.all([previous, ignoreFailure(operation)]);
    })();
  };

  const python: PythonSession = {
    get generation() {
      return session.generation;
    },
    async request({ schema, ...request }) {
      validateSupportFiles();
      try {
        return await session.request({ ...request, parseResult: (value) => schema.parse(value) });
      } catch (error) {
        // A cooperatively cancelled request settles as the caller's abort, not as a worker fault.
        request.signal.throwIfAborted();
        if (error instanceof NativeWorkerReportedError) {
          throw new PythonWorkerError(pythonIssueSchema.array().parse(error.issues));
        }
        throw error;
      }
    },
    isHandleGenerationValid: (generation) => session.isGenerationValid(generation),
    release(handleId, generation) {
      if (!session.isGenerationValid(generation)) {
        return;
      }
      background(
        python.request({
          method: 'release',
          params: { handleId },
          schema: emptySchema,
          signal: new AbortController().signal,
        }),
      );
    },
    readArtifact: async (artifact) => session.readArtifact(pythonArtifactSchema.parse(artifact)),
    async writeArtifact(payload, suffix) {
      const artifactPath = resolve(options.artifactPath, `${randomUUID()}.${suffix}`);
      await writeFile(artifactPath, payload, { flag: 'wx', mode: 0o600 });
      return { artifactPath, byteLength: payload.byteLength };
    },
    background,
    async cleanup() {
      await pending;
      await session.cleanup();
    },
  };
  return python;
};
