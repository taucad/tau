import { NativeProcessSession, NativeWorkerReportedError } from '@taucad/native-process-core';
import type { NativeProtocolResponse } from '@taucad/native-process-core';
import type { RuntimeLogger } from '@taucad/runtime/kernel';
import type { z } from 'zod';

import {
  picogkProtocolVersion,
  picogkIssueSchema,
  picogkReadySchema,
  picogkResponseSchema,
  picogkShutdownSchema,
} from '#picogk.protocol.js';
import type { PicogkIssue } from '#picogk.protocol.js';

/** Host-owned paths and bounds for a PicoGK worker session. @public */
export type PicogkSessionOptions = {
  readonly workerExecutable: string;
  readonly workerSha256: string;
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly trustFile: string;
  readonly resourceFiles: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly label: string }>;
  readonly requestTimeout: number;
  readonly maxArtifactBytes: number;
  readonly logger: RuntimeLogger;
};

type PicogkRequest<Result> = {
  readonly method: string;
  readonly params: Record<string, unknown>;
  readonly schema: z.ZodType<Result>;
  readonly signal: AbortSignal;
};

/** Structured user-code issues returned by the PicoGK worker. @public */
export class PicogkWorkerError extends Error {
  public readonly issues: PicogkIssue[];

  public constructor(issues: readonly PicogkIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = [...issues];
    this.name = 'PicogkWorkerError';
  }
}

const parseReady = (value: unknown): void => {
  picogkReadySchema.parse(value);
};

const parseResponse = (value: unknown): NativeProtocolResponse<PicogkIssue> => {
  const response = picogkResponseSchema.parse(value);
  if ((response.result === undefined) === (response.error === undefined)) {
    throw new Error('Expected exactly one of result or error.');
  }
  return response.error
    ? { requestId: response.requestId, issues: response.error.issues }
    : { requestId: response.requestId, result: response.result };
};

/** One serialized, warm CoreCLR/PicoGK worker session. @public */
export class PicogkSession {
  private readonly session: NativeProcessSession<PicogkIssue>;

  public constructor(options: PicogkSessionOptions) {
    this.session = new NativeProcessSession({
      executablePath: options.workerExecutable,
      executableSha256: options.workerSha256,
      arguments: [
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
      resources: options.resourceFiles,
      protocolVersion: picogkProtocolVersion,
      parseReady,
      parseResponse,
      requestTimeout: options.requestTimeout,
      maxArtifactBytes: options.maxArtifactBytes,
      logger: options.logger,
      sessionName: 'PicoGK C#',
      executableName: 'PicoGK C# worker',
      shutdown: { method: 'shutdown', parseResult: (value) => picogkShutdownSchema.parse(value) },
    });
  }

  /**
   * Submit one schema-validated operation through the serialized worker lane.
   * @returns The validated operation result.
   */
  public async request<Result>({ schema, ...request }: PicogkRequest<Result>): Promise<Result> {
    try {
      return await this.session.request({ ...request, parseResult: (value) => schema.parse(value) });
    } catch (error) {
      if (error instanceof NativeWorkerReportedError) {
        throw new PicogkWorkerError(picogkIssueSchema.array().parse(error.issues));
      }
      throw error;
    }
  }

  /**
   * Read and consume a confined worker artifact.
   * @param result - Validated private artifact descriptor.
   * @returns The artifact bytes.
   */
  public async readArtifact(result: { artifactPath: string; byteLength: number }): Promise<Uint8Array<ArrayBuffer>> {
    return this.session.readArtifact(result);
  }

  /** Replace the current worker generation after the active response settles. */
  public async recycle(): Promise<void> {
    await this.session.recycle();
  }

  /** Stop the worker and release its process resources. */
  public async cleanup(): Promise<void> {
    await this.session.cleanup();
  }
}
