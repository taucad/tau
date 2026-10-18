import { dirname } from 'node:path';

import { NativeProcessSession, NativeWorkerReportedError } from '@taucad/native-process-core';
import type { NativeProtocolResponse } from '@taucad/native-process-core';
import type { RuntimeLogger } from '@taucad/runtime/kernel';
import type { z } from 'zod';

/**
 * One response frame of a .NET worker, as its protocol schema validates it: exactly one of `result` or `error`.
 * @public
 */
export type DotnetWorkerResponse<Issue> = {
  readonly requestId: string;
  readonly result?: unknown;
  readonly error?: { readonly issues: readonly Issue[] };
};

/**
 * What a kernel states once about its worker: the names its errors use and the protocol its frames follow. Every
 * session of the kernel shares it.
 * @public
 */
export type DotnetWorker<Issue> = {
  /** Names the session in errors, such as `PicoGK C#`. */
  readonly sessionName: string;
  /** Names the process in errors, such as `PicoGK C# worker`. */
  readonly executableName: string;
  /** The version the `ready` frame and every response carry. */
  readonly protocolVersion: number;
  /** Validates the worker's `ready` frame. */
  readonly readySchema: z.ZodType;
  /** Validates one response frame. */
  readonly responseSchema: z.ZodType<DotnetWorkerResponse<Issue>>;
  /** Validates one issue of a failed request. */
  readonly issueSchema: z.ZodType<Issue>;
  /** Validates the result of the `shutdown` request the session sends before it stops the worker. */
  readonly shutdownSchema: z.ZodType;
  /** UTF-8 bytes allowed per response line; the native process default when absent. */
  readonly maxProtocolLineBytes?: number;
  /** The error a request rejects with when the worker reports issues for it. */
  readonly workerError: (issues: Issue[]) => Error;
};

/**
 * Host-owned paths and bounds of one .NET worker session: a kernel's resolved options plus its workspace mirror.
 *
 * The runtime root (a prepared closure's root, else the worker's directory) is the only host path the sandbox lets
 * the worker read besides its workspace mirror.
 *
 * @public
 */
export type DotnetSessionOptions = {
  readonly workerExecutable: string;
  readonly workerSha256: string;
  /** Read-only runtime root; defaults to the executable's directory. */
  readonly runtimePath?: string;
  /** Arguments before the worker's own, such as the worker assembly the `dotnet` muxer runs. */
  readonly workerArguments?: readonly string[];
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly resourceFiles: ReadonlyArray<{
    readonly path: string;
    readonly sha256: string;
    readonly label: string;
  }>;
  /** Milliseconds. Zero waits for completion or cancellation. */
  readonly requestTimeout: number;
  readonly maxArtifactBytes: number;
  readonly logger: RuntimeLogger;
};

/**
 * One schema-validated worker operation.
 * @public
 */
export type DotnetRequest<Result> = {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly schema: z.ZodType<Result>;
  readonly signal: AbortSignal;
  /** Worker method that stops this request cooperatively instead of ending the worker generation. */
  readonly cancelMethod?: string;
};

/**
 * One serialized, warm .NET worker session.
 * @public
 */
export type DotnetSession = {
  /**
   * Submit one schema-validated operation through the serialized worker lane.
   * @returns The validated result; rejects with the worker's `workerError` when the worker reports issues.
   */
  readonly request: <Result>(request: DotnetRequest<Result>) => Promise<Result>;
  /**
   * Read and consume a confined worker artifact.
   * @returns The artifact bytes.
   */
  readonly readArtifact: (result: {
    readonly artifactPath: string;
    readonly byteLength: number;
  }) => Promise<Uint8Array<ArrayBuffer>>;
  /** Replace the current worker generation after the active response settles. */
  readonly recycle: () => Promise<void>;
  /** Stop the worker and release its process resources. */
  readonly cleanup: () => Promise<void>;
};

/**
 * Start a .NET worker session on the shared native process lifecycle: the sandbox, integrity checks, the JSON-lines
 * lane and the parent watchdog. The worker receives its arguments after `workerArguments`, as
 * `--workspace <path> --artifacts <path> --parent-pid <pid>`.
 *
 * @param worker - The kernel's worker description.
 * @param options - The session's resolved options and workspace mirror paths.
 * @returns A session whose worker starts on the first request.
 * @public
 */
export const createDotnetSession = <Issue>(
  worker: DotnetWorker<Issue>,
  options: DotnetSessionOptions,
): DotnetSession => {
  const parseResponse = (value: unknown): NativeProtocolResponse<Issue> => {
    const response = worker.responseSchema.parse(value);
    if ((response.result === undefined) === (response.error === undefined)) {
      throw new Error('Expected exactly one of result or error.');
    }
    return response.error
      ? { requestId: response.requestId, issues: response.error.issues }
      : { requestId: response.requestId, result: response.result };
  };
  const session = new NativeProcessSession<Issue>({
    executablePath: options.workerExecutable,
    executableSha256: options.workerSha256,
    arguments: [
      ...(options.workerArguments ?? []),
      '--workspace',
      options.workspacePath,
      '--artifacts',
      options.artifactPath,
      '--parent-pid',
      String(process.pid),
    ],
    runtimePath: options.runtimePath ?? dirname(options.workerExecutable),
    workspacePath: options.workspacePath,
    artifactPath: options.artifactPath,
    resources: options.resourceFiles,
    protocolVersion: worker.protocolVersion,
    parseReady: (value) => {
      worker.readySchema.parse(value);
    },
    parseResponse,
    requestTimeout: options.requestTimeout,
    maxArtifactBytes: options.maxArtifactBytes,
    ...(worker.maxProtocolLineBytes === undefined ? {} : { maxProtocolLineBytes: worker.maxProtocolLineBytes }),
    logger: options.logger,
    sessionName: worker.sessionName,
    executableName: worker.executableName,
    shutdown: {
      method: 'shutdown',
      parseResult: (value) => worker.shutdownSchema.parse(value),
    },
  });
  return {
    async request({ schema, ...request }) {
      try {
        return await session.request({ ...request, parseResult: (value) => schema.parse(value) });
      } catch (error) {
        if (error instanceof NativeWorkerReportedError) {
          throw worker.workerError(worker.issueSchema.array().parse(error.issues));
        }
        throw error;
      }
    },
    readArtifact: async (result) => session.readArtifact(result),
    recycle: async () => session.recycle(),
    cleanup: async () => session.cleanup(),
  };
};
