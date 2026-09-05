import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { NativeProcessSession, NativeWorkerReportedError } from '@taucad/native-process-core';
import type { NativeProtocolResponse } from '@taucad/native-process-core';
import type { KernelComputeSession, RuntimeLogger } from '@taucad/runtime/kernel';
import type { ComputeAction } from '@taucad/cache-core';
import type { z } from 'zod';

import {
  build123dArtifactSchema,
  build123dComputePublicationsSchema,
  build123dEmptySchema,
  build123dIssueSchema,
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

/** Worker-private preload descriptor passed through the bounded NDJSON request. */
export type Build123dComputePreload = {
  readonly artifactPath: string;
  readonly byteLength: number;
};

/** One exact semantic publication returned by the worker after a successful build. */
export type Build123dComputePublication = {
  readonly action: ComputeAction;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly mediaType: 'application/vnd.opencascade.brep';
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

  public constructor(sessionOptions: PythonSessionOptions) {
    this.options = sessionOptions;
    const options = sessionOptions;
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

  /** Current native worker generation. */
  public get generation(): number {
    return this.session.generation;
  }

  /** Verify that the project has explicitly trusted native execution. */
  public async assertTrusted(): Promise<void> {
    await this.session.assertTrusted();
  }

  /** Execute one validated request through the bounded worker protocol. */
  public async request<Result>({ schema, ...request }: PythonRequest<Result>): Promise<Result> {
    this.validateSupportFiles();
    try {
      return await this.session.request({ ...request, parseResult: (value) => schema.parse(value) });
    } catch (error) {
      if (error instanceof NativeWorkerReportedError) {
        throw new Build123dWorkerError(build123dIssueSchema.array().parse(error.issues));
      }
      throw error;
    }
  }

  /** Test whether a native handle still belongs to the live worker generation. */
  public isHandleGenerationValid(generation: number): boolean {
    return this.session.isGenerationValid(generation);
  }

  /** Release a worker-owned shape handle without delaying caller disposal. */
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

  /** Read and consume one confined worker artifact. */
  public async readArtifact(result: z.infer<typeof build123dArtifactSchema>): Promise<Uint8Array<ArrayBuffer>> {
    return this.session.readArtifact(build123dArtifactSchema.parse(result));
  }

  /**
   * Stage the bounded, already-prehydrated cache candidates for one Python build.
   * @param session - Operation-scoped compute session.
   * @returns Private preload artifact descriptor.
   */
  public async stageComputePreload(session: KernelComputeSession): Promise<Build123dComputePreload> {
    const artifactPath = resolve(this.options.artifactPath, `${randomUUID()}.compute-preload.json`);
    const payload = new TextEncoder().encode(
      JSON.stringify({
        schemaVersion: 1,
        entries: session.prepared().map((entry) => ({
          canonicalAction: entry.canonicalAction,
          actionDigest: entry.actionDigest,
          contentDigest: entry.contentDigest,
          bytes: Buffer.from(entry.bytes).toString('base64'),
        })),
      }),
    );
    await writeFile(artifactPath, payload, { flag: 'wx', mode: 0o600 });
    return { artifactPath, byteLength: payload.byteLength };
  }

  /**
   * Remove a preload artifact when a request fails before the worker consumes it.
   * @param preload - Private preload artifact descriptor.
   */
  public async removeComputePreload(preload: Build123dComputePreload): Promise<void> {
    if (dirname(resolve(preload.artifactPath)) !== resolve(this.options.artifactPath)) {
      throw new Error('Build123d compute preload escaped the private artifact directory.');
    }
    try {
      await unlink(preload.artifactPath);
    } catch {
      // The worker deletes a successfully consumed preload before executing user code.
    }
  }

  /**
   * Read, validate, and consume deterministic BRep publications from the worker.
   * @param artifact - Worker publication bundle descriptor.
   * @returns Validated semantic BRep publications.
   */
  public async readComputePublications(
    artifact: z.infer<typeof build123dArtifactSchema>,
  ): Promise<readonly Build123dComputePublication[]> {
    const bytes = await this.readArtifact(artifact);
    const parsed = build123dComputePublicationsSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.publications.map((publication) => ({
      action: publication.action as unknown as ComputeAction,
      bytes: new Uint8Array(Buffer.from(publication.bytes, 'base64')),
      mediaType: publication.mediaType,
    }));
  }

  /** Drain pending releases and terminate the native worker. */
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
