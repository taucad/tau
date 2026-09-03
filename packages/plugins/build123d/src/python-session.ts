import { dirname, resolve } from 'node:path';

import {
  NativeProcessSession,
  NativeWorkerReportedError,
  processEnvironment,
  terminateProcessTree,
} from '@taucad/native-process-core';
import type { NativeProcessRequest, NativeProtocolResponse } from '@taucad/native-process-core';
import type { RuntimeLogger } from '@taucad/runtime/kernel';
import type { z } from 'zod';

import {
  build123dArtifactSchema,
  build123dEmptySchema,
  build123dProtocolVersion,
  build123dReadySchema,
  build123dResponseSchema,
  build123dShutdownSchema,
} from '#build123d.protocol.js';
import type { Build123dIssue } from '#build123d.protocol.js';

/** Host-owned paths, integrity evidence, and limits for one Python session. */
export type PythonSessionOptions = {
  readonly pythonExecutable: string;
  readonly workerPath: string;
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly trustFile: string;
  readonly pythonSha256: string;
  readonly workerSha256: string;
  readonly supportFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string }>;
  readonly requestTimeout: number;
  readonly maxArtifactBytes: number;
  readonly logger: RuntimeLogger;
};

type PythonRequest<Result> = {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly schema: z.ZodType<Result>;
  readonly signal: AbortSignal;
};

/** Error reported by the checked-in Python worker. */
export class Build123dWorkerError extends Error {
  public readonly issues: Build123dIssue[];

  public constructor(issues: readonly Build123dIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = [...issues];
    this.name = 'Build123dWorkerError';
  }
}

const parseReady = (value: unknown): void => {
  build123dReadySchema.parse(value);
};

const parseResponse = (value: unknown): NativeProtocolResponse<Build123dIssue> => {
  const response = build123dResponseSchema.parse(value);
  if ((response.result === undefined) === (response.error === undefined)) {
    throw new Error('Expected exactly one of result or error.');
  }
  return response.error
    ? { requestId: response.requestId, issues: response.error.issues }
    : { requestId: response.requestId, result: response.result };
};

/** One serialized, generation-scoped CPython session. */
export class PythonSession {
  private readonly session: NativeProcessSession<Build123dIssue>;
  private backgroundRelease: Promise<void> | undefined;
  private readonly options: PythonSessionOptions;
  private supportFilesValidated = false;

  public constructor(options: PythonSessionOptions) {
    this.options = options;
    this.session = new NativeProcessSession({
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
      workspacePath: options.workspacePath,
      artifactPath: options.artifactPath,
      trustFile: options.trustFile,
      resources: [
        { path: options.workerPath, sha256: options.workerSha256, label: 'Build123d worker' },
        ...options.supportFiles.map((file) => ({ ...file, label: 'Build123d worker support files' })),
      ],
      protocolVersion: build123dProtocolVersion,
      parseReady,
      parseResponse,
      requestTimeout: options.requestTimeout,
      maxArtifactBytes: options.maxArtifactBytes,
      logger: options.logger,
      sessionName: 'Build123d Python',
      executableName: 'Bundled Python',
      shutdown: { method: 'shutdown', parseResult: (value) => build123dShutdownSchema.parse(value) },
    });
  }

  public get generation(): number {
    return this.session.generation;
  }

  public assertTrusted(): Promise<void> {
    return this.session.assertTrusted();
  }

  public async request<Result>({ schema, ...request }: PythonRequest<Result>): Promise<Result> {
    this.validateSupportFiles();
    try {
      return await this.session.request({ ...request, parseResult: (value) => schema.parse(value) });
    } catch (error) {
      if (error instanceof NativeWorkerReportedError) {
        throw new Build123dWorkerError(error.issues);
      }
      throw error;
    }
  }

  public isHandleGenerationValid(generation: number): boolean {
    return this.session.isGenerationValid(generation);
  }

  public release(handleId: string, generation: number): void {
    if (!this.isHandleGenerationValid(generation)) {
      return;
    }
    this.backgroundRelease = this.ignoreFailure(
      this.request({
        method: 'release',
        params: { handleId },
        schema: build123dEmptySchema,
        signal: new AbortController().signal,
      }),
    );
  }

  public readArtifact(result: z.infer<typeof build123dArtifactSchema>): Promise<Uint8Array<ArrayBuffer>> {
    return this.session.readArtifact(build123dArtifactSchema.parse(result));
  }

  public async cleanup(): Promise<void> {
    await this.backgroundRelease;
    await this.session.cleanup();
  }

  private async ignoreFailure(operation: Promise<unknown>): Promise<void> {
    try {
      await operation;
    } catch {
      // Release is best-effort; session failure invalidates every handle.
    }
  }

  private validateSupportFiles(): void {
    if (this.supportFilesValidated) {
      return;
    }
    const supportByPath = new Set(this.options.supportFiles.map(({ path }) => resolve(path)));
    for (const name of ['analyzer.py', 'glb.py']) {
      if (!supportByPath.has(resolve(dirname(this.options.workerPath), name))) {
        throw new Error(`Build123d worker manifest is missing ${name}.`);
      }
    }
    this.supportFilesValidated = true;
  }
}

export const processEnvironmentForTest = processEnvironment;
export const terminateProcessTreeForTest = terminateProcessTree;
export type { NativeProcessRequest };
