import { createDotnetSession } from '@taucad/dotnet-kernel-core';
import type { DotnetRequest, DotnetSession, DotnetSessionOptions, DotnetWorker } from '@taucad/dotnet-kernel-core';

import {
  picogkProtocolVersion,
  picogkIssueSchema,
  picogkReadySchema,
  picogkResponseSchema,
  picogkShutdownSchema,
} from '#picogk.protocol.js';
import type { PicogkIssue } from '#picogk.protocol.js';

/**
 * Host-owned paths and bounds for a PicoGK worker session.
 *
 * The runtime root (a prepared closure's root, else the worker's directory) is the only host
 * path the sandbox lets the worker read besides its workspace mirror.
 *
 * @public
 */
export type PicogkSessionOptions = DotnetSessionOptions;

/** Structured user-code issues returned by the PicoGK worker. @public */
export class PicogkWorkerError extends Error {
  public readonly issues: PicogkIssue[];

  public constructor(issues: readonly PicogkIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = [...issues];
    this.name = 'PicogkWorkerError';
  }
}

/** The PicoGK C# worker: its names, its protocol frames and the error its reported issues become. */
const picogkWorker: DotnetWorker<PicogkIssue> = {
  sessionName: 'PicoGK C#',
  executableName: 'PicoGK C# worker',
  protocolVersion: picogkProtocolVersion,
  readySchema: picogkReadySchema,
  responseSchema: picogkResponseSchema,
  issueSchema: picogkIssueSchema,
  shutdownSchema: picogkShutdownSchema,
  // Full assembly descriptors include per-component PBR metadata; measured up to 1.85 MB.
  maxProtocolLineBytes: 4 * 1024 * 1024,
  workerError: (issues) => new PicogkWorkerError(issues),
};

/** One serialized, warm CoreCLR/PicoGK worker session. @public */
export class PicogkSession {
  private readonly session: DotnetSession;

  public constructor(options: PicogkSessionOptions) {
    this.session = createDotnetSession(picogkWorker, options);
  }

  /**
   * Submit one schema-validated operation through the serialized worker lane.
   * @returns The validated operation result.
   */
  public async request<Result>(request: DotnetRequest<Result>): Promise<Result> {
    return this.session.request(request);
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
