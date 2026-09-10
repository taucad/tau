import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { NativeProcessSession, NativeWorkerReportedError } from '@taucad/native-process-core';
import type { NativeProtocolResponse } from '@taucad/native-process-core';
import type { ResidentCacheBinding, ResidentExportEntry, RuntimeLogger } from '@taucad/runtime/kernel';
import { actionDigest } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import type { z } from 'zod';

import {
  build123dArtifactSchema,
  build123dComputeClearSchema,
  build123dComputeDescriptorLimit,
  build123dComputeExportSchema,
  build123dComputeImportSchema,
  build123dComputeStatsSchema,
  build123dEmptySchema,
  build123dIssueSchema,
  build123dProtocolVersion,
  build123dReadySchema,
  build123dResponseSchema,
  build123dShutdownSchema,
} from '#build123d.protocol.js';
import type { Build123dIssue } from '#build123d.protocol.js';

const brepMediaType = 'application/vnd.opencascade.brep';

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
  /** Ask the worker to stop at its own operation boundary instead of recycling it. */
  readonly cancelMethod?: string;
};

/**
 * The worker's lineage cache as the runtime sees it.
 *
 * `contains` mirrors what the worker reported; the view is eventually consistent
 * and conservative, so an omission is a miss and never a false hit.
 */
export type Build123dResidentBinding = ResidentCacheBinding & {
  /** Record identities the worker admitted during a build. */
  readonly track: (digests: readonly ActionDigest[]) => void;
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
  private residentBytes = 0;

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
      // A cooperatively cancelled request settles as the caller's abort, not as a worker fault.
      request.signal.throwIfAborted();
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
   * Bind the worker's lineage cache as the kernel-owned resident cache.
   * @returns The resident binding one compute scope is opened against.
   */
  public createResidentBinding(): Build123dResidentBinding {
    const mirror = new Set<ActionDigest>();
    let evictions = 0;
    let omissions = 0;
    const control = new AbortController();
    return {
      contains: ({ digest }) => mirror.has(digest),
      track: (digests) => {
        for (const digest of digests) {
          mirror.add(digest);
        }
      },
      importEntries: async ({ entries, signal }) => {
        const admitted = entries.slice(0, build123dComputeDescriptorLimit);
        if (admitted.length === 0) {
          return { imported: [], omitted: [] };
        }
        const bundle = await this.writeBundle(admitted.map(({ bytes }) => bytes));
        const result = await this.request({
          method: 'compute.import',
          params: {
            descriptors: admitted.map((entry) => ({
              action: entry.action,
              actionDigest: entry.actionDigest,
              contentDigest: entry.contentDigest,
              byteLength: entry.bytes.byteLength,
            })),
            bundle,
          },
          schema: build123dComputeImportSchema,
          signal,
        }).finally(async () => unlink(bundle.artifactPath).catch(() => undefined));
        for (const digest of result.imported) {
          mirror.add(actionDigest({ value: digest }));
        }
        omissions += result.omitted.length + (entries.length - admitted.length);
        return {
          imported: result.imported.map((digest) => actionDigest({ value: digest })),
          omitted: [
            ...result.omitted.map((digest) => actionDigest({ value: digest })),
            ...entries.slice(build123dComputeDescriptorLimit).map((entry) => entry.actionDigest),
          ],
        };
      },
      exportEntries: async ({ digests, signal }) => {
        const admitted = digests.slice(0, build123dComputeDescriptorLimit);
        if (admitted.length === 0) {
          return { entries: [], omitted: [] };
        }
        const result = await this.request({
          method: 'compute.export',
          params: { digests: admitted },
          schema: build123dComputeExportSchema,
          signal,
        });
        const omitted: ActionDigest[] = [
          ...result.omitted.map((digest) => actionDigest({ value: digest })),
          ...digests.slice(build123dComputeDescriptorLimit),
        ];
        if (!result.bundle) {
          return { entries: [], omitted };
        }
        const payload = await this.readArtifact(result.bundle);
        const entries: ResidentExportEntry[] = [];
        let offset = 0;
        for (const descriptor of result.descriptors) {
          const bytes = payload.slice(offset, offset + descriptor.byteLength);
          offset += descriptor.byteLength;
          if (bytes.byteLength !== descriptor.byteLength) {
            omitted.push(actionDigest({ value: descriptor.actionDigest }));
            continue;
          }
          entries.push({
            action: descriptor.action as unknown as ComputeAction,
            bytes: new Uint8Array(bytes),
            mediaType: brepMediaType,
            determinism: 'byte-exact',
          });
        }
        return { entries, omitted };
      },
      stats: () => ({
        entries: mirror.size,
        logicalBytes: this.residentBytes,
        encodedBytes: { status: 'unsupported' },
        evictions,
        omissions,
      }),
      clear: ({ generation }) => {
        // Fences the mirror synchronously; the worker clears at its next safe boundary.
        evictions += mirror.size;
        mirror.clear();
        this.backgroundRelease = this.ignoreFailure(
          this.request({
            method: 'compute.clear',
            params: { generation },
            schema: build123dComputeClearSchema,
            signal: control.signal,
          }),
        );
      },
    };
  }

  /** Read the worker's own resident accounting. */
  public async readComputeStats(signal: AbortSignal): Promise<z.infer<typeof build123dComputeStatsSchema>> {
    return this.request({ method: 'compute.stats', params: {}, schema: build123dComputeStatsSchema, signal });
  }

  /** Record the worker-reported logical residency for the binding's statistics. */
  public observeResidentBytes(bytes: number): void {
    this.residentBytes = bytes;
  }

  /** Drain pending releases and terminate the native worker. */
  public async cleanup(): Promise<void> {
    await this.backgroundRelease;
    await this.session.cleanup();
  }

  private async writeBundle(payloads: ReadonlyArray<Uint8Array<ArrayBuffer>>): Promise<{
    readonly artifactPath: string;
    readonly byteLength: number;
  }> {
    const artifactPath = resolve(this.options.artifactPath, `${randomUUID()}.compute-bundle.bin`);
    const payload = Buffer.concat(payloads.map((bytes) => Buffer.from(bytes)));
    await writeFile(artifactPath, payload, { flag: 'wx', mode: 0o600 });
    return { artifactPath, byteLength: payload.byteLength };
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
