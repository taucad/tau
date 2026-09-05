import { mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { ContentDigest } from '@taucad/cache-core';
import { NativeProcessSession, NativeWorkerReportedError } from '@taucad/native-process-core';
import type { NativeProtocolResponse } from '@taucad/native-process-core';
import type { RuntimeLogger } from '@taucad/runtime/kernel';
import type { z } from 'zod';

import {
  picogkProtocolVersion,
  picogkIssueSchema,
  picogkReadySchema,
  picogkResponseSchema,
  picogkSceneEventSchema,
  picogkShutdownSchema,
} from '#picogk.protocol.js';
import type { PicogkIssue, PicogkPreparedCompute, PicogkSceneEvent } from '#picogk.protocol.js';

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
  readonly events?: { readonly onEvent: (event: PicogkSceneEvent) => void };
};

type ProgressArtifactRoot = {
  writerActive: boolean;
  readonly pendingArtifactPaths: Set<string>;
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
  private readonly artifactPath: string;
  private readonly progressArtifactRoots = new Map<string, ProgressArtifactRoot>();
  private readonly computeArtifactPaths = new Map<ContentDigest, string>();

  public constructor(options: PicogkSessionOptions) {
    this.artifactPath = options.artifactPath;
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
  public async request<Result>({ schema, events, ...request }: PicogkRequest<Result>): Promise<Result> {
    const requestProgressRoots = new Set<string>();
    try {
      const result = await this.session.request<Result, PicogkSceneEvent>({
        ...request,
        parseResult: (value) => schema.parse(value),
        ...(events
          ? {
              events: {
                parseEvent: (value: unknown) => picogkSceneEventSchema.parse(value),
                onEvent: (event) => {
                  if (event.artifact) {
                    const root = dirname(event.artifact.artifactPath);
                    if (dirname(root) === this.artifactPath && basename(root).startsWith('progress-')) {
                      const progress = this.progressArtifactRoots.get(root) ?? {
                        writerActive: true,
                        pendingArtifactPaths: new Set<string>(),
                      };
                      progress.pendingArtifactPaths.add(event.artifact.artifactPath);
                      this.progressArtifactRoots.set(root, progress);
                      requestProgressRoots.add(root);
                    }
                  }
                  events.onEvent(event);
                },
              },
            }
          : {}),
      });
      await this.finishProgressRequest(requestProgressRoots);
      return result;
    } catch (error) {
      await this.clearProgressArtifacts(requestProgressRoots);
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
    const artifact = await this.session.readArtifact(result);
    const root = dirname(result.artifactPath);
    const progress = this.progressArtifactRoots.get(root);
    if (progress) {
      progress.pendingArtifactPaths.delete(result.artifactPath);
      await this.removeProgressRootIfFinished(root, progress);
    }
    return artifact;
  }

  /**
   * Materialize each immutable cache blob once for all worker generations in this session.
   * @param entries - Verified runtime cache entries and their managed lookup identities.
   * @returns Confined artifact descriptors suitable for the worker request.
   */
  public async prehydrateCompute(
    entries: ReadonlyArray<{
      readonly identity: {
        readonly cacheKey: string;
        readonly kind: 'triangles';
        readonly positionCount: number;
        readonly indexCount: number;
      };
      readonly bytes: Uint8Array<ArrayBuffer>;
      readonly contentDigest: ContentDigest;
    }>,
  ): Promise<readonly PicogkPreparedCompute[]> {
    const root = join(this.artifactPath, 'compute-inputs');
    await mkdir(root, { recursive: true });
    const result: PicogkPreparedCompute[] = [];
    for (const entry of entries) {
      let path = this.computeArtifactPaths.get(entry.contentDigest);
      if (!path) {
        path = join(root, entry.contentDigest.slice('sha256:'.length));
        try {
          // oxlint-disable-next-line no-await-in-loop -- entries are a bounded deterministic prehydration set.
          await writeFile(path, entry.bytes, { flag: 'wx', mode: 0o600 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw error;
          }
          // oxlint-disable-next-line no-await-in-loop -- an existing staged blob must remain byte exact.
          const existing = await readFile(path);
          if (!existing.equals(Buffer.from(entry.bytes))) {
            throw new Error('PicoGK compute input changed unexpectedly.');
          }
        }
        this.computeArtifactPaths.set(entry.contentDigest, path);
      }
      result.push({
        ...entry.identity,
        artifactPath: path,
        byteLength: entry.bytes.byteLength,
        sha256: entry.contentDigest.slice('sha256:'.length),
      });
    }
    return result;
  }

  /** Replace the current worker generation after the active response settles. */
  public async recycle(): Promise<void> {
    await this.session.recycle();
  }

  /** Stop the worker and release its process resources. */
  public async cleanup(): Promise<void> {
    try {
      await this.session.cleanup();
    } finally {
      await this.clearProgressArtifacts();
      await rm(join(this.artifactPath, 'compute-inputs'), { recursive: true, force: true });
      this.computeArtifactPaths.clear();
    }
  }

  private async finishProgressRequest(roots: ReadonlySet<string>): Promise<void> {
    await Promise.all(
      [...roots].map(async (root) => {
        const progress = this.progressArtifactRoots.get(root)!;
        progress.writerActive = false;
        await this.removeProgressRootIfFinished(root, progress);
      }),
    );
  }

  private async removeProgressRootIfFinished(root: string, progress: ProgressArtifactRoot): Promise<void> {
    if (progress.writerActive || progress.pendingArtifactPaths.size > 0) {
      return;
    }
    try {
      await rmdir(root);
      this.progressArtifactRoots.delete(root);
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT') {
        this.progressArtifactRoots.delete(root);
      } else if (code !== 'ENOTEMPTY') {
        throw error;
      }
    }
  }

  private async clearProgressArtifacts(roots: Iterable<string> = this.progressArtifactRoots.keys()): Promise<void> {
    const paths = [...roots];
    await Promise.all(
      paths.map(async (path) => {
        await rm(path, { recursive: true, force: true });
      }),
    );
    for (const path of paths) {
      this.progressArtifactRoots.delete(path);
    }
  }
}
