import type { RuntimeClient, RuntimeExportOptions } from '@taucad/runtime/client';
import type { TelemetryEntry } from '@taucad/runtime';
import type { ExportFile } from '@taucad/types';
import type { SvgPngOptions, SvgWebpOptions } from '@taucad/image/svg';
import { canonicalJson } from '@taucad/utils/hash';
import { assertRootedPath } from '@taucad/utils/path';
import { z } from 'zod';
import type { RuntimeKernels, RuntimeMiddleware, RuntimeTranscoders } from '@taucad/runtime/worker';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';
import { headlessImageBackend } from '#services/headless-image-backend.js';
import type { AppRuntimeClient } from '#types/runtime-client.alias.js';

type ImageFormat = Extract<Parameters<RuntimeClient<typeof imageRuntime>['export']>[0], 'jpeg' | 'png' | 'webp'>;
type ImageExportOptions<Format extends ImageFormat> = RuntimeExportOptions<
  RuntimeKernels<typeof imageRuntime>,
  RuntimeMiddleware<typeof imageRuntime>,
  RuntimeTranscoders<typeof imageRuntime>,
  Format
>;

type HeadlessImageJobBase = {
  readonly kind: 'automatic-thumbnail' | 'manual-thumbnail' | 'capture';
  readonly identity: string;
  readonly projectId?: string;
  /** Ephemeral caller cancellation; never serialized or included in cache identity. */
  readonly signal?: AbortSignal;
};

type HeadlessGlbImageJob = {
  [Format in ImageFormat]: HeadlessImageJobBase & {
    readonly sourceFormat: 'glb';
    readonly sourcePath: string;
    readonly geometryHash: string;
    readonly content: Uint8Array<ArrayBuffer>;
    readonly format: Format;
    readonly exportOptions: NonNullable<ImageExportOptions<Format>['exportOptions']>;
  };
}[ImageFormat];

type HeadlessSvgImageJob = {
  [Format in 'png' | 'webp']: HeadlessImageJobBase & {
    readonly sourceFormat: 'svg';
    readonly sourcePath: string;
    readonly content: string;
    readonly format: Format;
    readonly exportOptions?: Format extends 'png' ? SvgPngOptions : SvgWebpOptions;
  };
}['png' | 'webp'];

export type HeadlessImageJob = HeadlessGlbImageJob | HeadlessSvgImageJob;

/** Host-selected execution, separate from the shared image queue and lifecycle. */
export type HeadlessImageBackend = {
  readonly createImageClient: () => Promise<AppRuntimeClient>;
  readonly isGpuAvailable?: () => boolean | Promise<boolean>;
  readonly renderSvg?: (
    content: string,
    format: 'png' | 'webp',
    options?: SvgPngOptions | SvgWebpOptions,
  ) => Promise<ExportFile>;
};

export type HeadlessImageServiceDependencies = Partial<HeadlessImageBackend> & {
  readonly debug?: boolean;
};

type QueuedJob = {
  readonly job: HeadlessImageJob;
  readonly resolve: (files: ExportFile[] | undefined) => void;
  readonly reject: (error: unknown) => void;
  readonly enqueuedAt: number;
  readonly queueDepth: number;
  active: boolean;
  settled: boolean;
  readonly cleanupAbort: () => void;
};

export const headlessImageFailureCodeSchema = z.enum([
  'adapter-unavailable',
  'device-lost',
  'driver-unsupported',
  'gpu',
  'parse',
  'encode',
  'unknown',
]);
export type HeadlessImageFailureCode = z.infer<typeof headlessImageFailureCodeSchema>;

const renderIssueDetailsSchema = z.object({ type: z.literal('render'), code: headlessImageFailureCodeSchema });
const svgIssueSchema = z.object({ code: z.enum(['parse', 'encode']) });

/** Stable image-render failure preserved from the runtime issue details. */
export class HeadlessImageError extends Error {
  public readonly code: HeadlessImageFailureCode;
  public get type(): 'render' {
    return 'render';
  }

  public constructor(code: HeadlessImageFailureCode, message: string) {
    super(message);
    this.name = 'HeadlessImageError';
    this.code = code;
  }

  public get isGpuFault(): boolean {
    return this.code === 'adapter-unavailable' || this.code === 'device-lost' || this.code === 'gpu';
  }
}

const issueToError = (
  issue: { readonly message: string; readonly details?: unknown } | undefined,
): HeadlessImageError => {
  const details = renderIssueDetailsSchema.safeParse(issue?.details);
  if (details.success) {
    return new HeadlessImageError(details.data.code, issue?.message ?? 'Image render failed');
  }
  return new HeadlessImageError('unknown', issue?.message ?? 'Image render failed');
};

const svgIssueToError = (error: unknown): HeadlessImageError => {
  const issue = svgIssueSchema.safeParse(error);
  if (issue.success) {
    return new HeadlessImageError(issue.data.code, error instanceof Error ? error.message : 'SVG render failed');
  }
  return new HeadlessImageError('unknown', error instanceof Error ? error.message : String(error));
};

const sourceLocator = (job: HeadlessImageJob): string => job.sourcePath;

const cloneFiles = (files: readonly ExportFile[]): ExportFile[] =>
  files.map((file) => ({ ...file, bytes: new Uint8Array(file.bytes) }));

const captureCacheKey = (job: HeadlessImageJob): string | undefined =>
  job.kind === 'capture' && job.sourceFormat === 'glb'
    ? `${job.geometryHash}\0${job.format}\0${canonicalJson(job.exportOptions)}`
    : undefined;

const failedAutomaticIdentityLimit = 100;

/**
 * App-owned, lazy image export client shared by thumbnails and agent captures.
 * It serializes GPU work, coalesces queued automatic jobs by project, and
 * retains its owner-scoped image worker until disposal.
 */
export class HeadlessImageService {
  // oxlint-disable-next-line typescript/parameter-properties -- UI uses erasableSyntaxOnly, which forbids TypeScript parameter properties.
  private readonly dependencies: HeadlessImageServiceDependencies;
  private readonly backend: HeadlessImageBackend;
  private imageClient: AppRuntimeClient | undefined;
  private queue: QueuedJob[] = [];
  private activeJob: QueuedJob | undefined;
  private running = false;
  private disposed = false;
  private readonly failedAutomaticIdentities = new Set<string>();
  private activeTelemetry: TelemetryEntry[] | undefined;
  private unsubscribeTelemetry: (() => void) | undefined;
  private generation = 0;
  private lastSuccessfulCapture: { readonly key: string; readonly files: ExportFile[] } | undefined;

  public constructor(dependencies: HeadlessImageServiceDependencies = {}) {
    this.dependencies = dependencies;
    this.backend = {
      createImageClient: dependencies.createImageClient ?? headlessImageBackend.createImageClient,
      isGpuAvailable:
        'isGpuAvailable' in dependencies ? dependencies.isGpuAvailable : headlessImageBackend.isGpuAvailable,
      renderSvg: 'renderSvg' in dependencies ? dependencies.renderSvg : headlessImageBackend.renderSvg,
    };
  }

  public async export(job: HeadlessImageJob): Promise<ExportFile[] | undefined> {
    assertRootedPath(job.sourcePath);
    job.signal?.throwIfAborted();
    if (this.disposed) {
      throw new Error('HeadlessImageService is disposed');
    }
    if (job.kind === 'automatic-thumbnail' && this.failedAutomaticIdentities.has(job.identity)) {
      return undefined;
    }
    const cacheKey = captureCacheKey(job);
    if (cacheKey && this.lastSuccessfulCapture?.key === cacheKey) {
      const files = cloneFiles(this.lastSuccessfulCapture.files);
      recordHeadlessImageTiming('cache.hit', performance.now(), {
        identity: job.identity,
        geometryHash: job.sourceFormat === 'glb' ? job.geometryHash : job.identity,
        outputCount: files.length,
        outputBytes: files.reduce((total, file) => total + file.bytes.byteLength, 0),
      });
      return files;
    }
    return new Promise((resolve, reject) => {
      const settleResolve = (queued: QueuedJob, files: ExportFile[] | undefined): void => {
        if (!queued.settled) {
          queued.settled = true;
          queued.cleanupAbort();
          queued.resolve(files);
        }
      };
      const settleReject = (queued: QueuedJob, error: unknown): void => {
        if (!queued.settled) {
          queued.settled = true;
          queued.cleanupAbort();
          queued.reject(error);
        }
      };
      const abort = (): void => {
        const index = this.queue.indexOf(queued);
        if (index !== -1 && !queued.active) {
          this.queue.splice(index, 1);
        }
        settleReject(queued, job.signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError'));
      };
      const cleanupAbort = (): void => job.signal?.removeEventListener('abort', abort);
      const queued: QueuedJob = {
        job,
        resolve,
        reject,
        enqueuedAt: performance.now(),
        queueDepth: this.queue.length + (this.running ? 1 : 0),
        active: false,
        settled: false,
        cleanupAbort,
      };
      job.signal?.addEventListener('abort', abort, { once: true });
      if (job.signal?.aborted === true) {
        abort();
        return;
      }
      if (job.kind === 'automatic-thumbnail' && job.projectId) {
        const existingIndex = this.queue.findIndex(
          (entry) => entry.job.kind === 'automatic-thumbnail' && entry.job.projectId === job.projectId,
        );
        if (existingIndex === -1) {
          this.queue.push(queued);
        } else {
          settleResolve(this.queue[existingIndex]!, undefined);
          this.queue[existingIndex] = queued;
        }
      } else {
        this.queue.push(queued);
      }
      this.queue.sort(
        (left, right) =>
          Number(left.job.kind === 'automatic-thumbnail') - Number(right.job.kind === 'automatic-thumbnail'),
      );
      void this.drain();
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.lastSuccessfulCapture = undefined;
    this.terminateClients();
    if (this.activeJob && !this.activeJob.settled) {
      this.activeJob.settled = true;
      this.activeJob.reject(new Error('HeadlessImageService was disposed'));
    }
    this.activeJob?.cleanupAbort();
    for (const queued of this.queue.splice(0)) {
      queued.cleanupAbort();
      if (!queued.settled) {
        queued.settled = true;
        queued.reject(new Error('HeadlessImageService was disposed'));
      }
    }
  }

  private async drain(): Promise<void> {
    if (this.running || this.disposed) {
      return;
    }
    this.running = true;
    try {
      /* oxlint-disable no-await-in-loop -- A single GPU queue must execute image exports serially. */
      while (this.queue.length > 0) {
        const queued = this.queue.shift()!;
        queued.active = true;
        this.activeJob = queued;
        const startedAt = performance.now();
        /* Every statement that touches a dequeued job lives inside this
         * try/catch: anything raised out here would reject `drain()` — whose
         * only caller discards it — and leave `export()` pending forever. */
        try {
          this.activeTelemetry = this.dependencies.debug ? [] : undefined;
          recordHeadlessImageTiming('queue.wait', queued.enqueuedAt, {
            kind: queued.job.kind,
            identity: queued.job.identity,
            queueDepth: queued.queueDepth,
          });
          const files = await this.execute(queued.job);
          if (queued.settled) {
            continue;
          }
          const cacheKey = captureCacheKey(queued.job);
          if (cacheKey) {
            this.lastSuccessfulCapture = { key: cacheKey, files: cloneFiles(files) };
          }
          this.failedAutomaticIdentities.delete(queued.job.identity);
          recordHeadlessImageTiming('job.complete', startedAt, {
            kind: queued.job.kind,
            identity: queued.job.identity,
            geometryHash: queued.job.sourceFormat === 'glb' ? queued.job.geometryHash : queued.job.identity,
            outputCount: files.length,
            outputBytes: files.reduce((total, file) => total + file.bytes.byteLength, 0),
            success: true,
          });
          queued.settled = true;
          queued.cleanupAbort();
          queued.resolve(files);
        } catch (error) {
          if (queued.settled) {
            continue;
          }
          // Settle first: the bookkeeping below must not be able to strand the caller.
          queued.settled = true;
          queued.cleanupAbort();
          queued.reject(error);
          console.warn('Headless image job failed', {
            message: error instanceof Error ? error.message : String(error),
            kind: queued.job.kind,
            ...(queued.job.projectId ? { projectId: queued.job.projectId } : {}),
            identity: queued.job.identity,
            sourceLocator: sourceLocator(queued.job),
            code: error instanceof HeadlessImageError ? error.code : 'unknown',
          });
          if (error instanceof HeadlessImageError && error.isGpuFault) {
            this.terminateClients();
          }
          if (queued.job.kind === 'automatic-thumbnail') {
            this.failedAutomaticIdentities.add(queued.job.identity);
            if (this.failedAutomaticIdentities.size > failedAutomaticIdentityLimit) {
              this.failedAutomaticIdentities.delete(this.failedAutomaticIdentities.values().next().value!);
            }
          }
          recordHeadlessImageTiming('job.complete', startedAt, {
            kind: queued.job.kind,
            identity: queued.job.identity,
            success: false,
            errorCode: error instanceof HeadlessImageError ? error.code : 'unknown',
          });
        } finally {
          queued.cleanupAbort();
          if (this.activeJob === queued) {
            this.activeJob = undefined;
          }
          this.activeTelemetry = undefined;
        }
      }
      /* oxlint-enable no-await-in-loop */
    } finally {
      this.running = false;
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while execute() awaits.
      if (!this.disposed && this.queue.length > 0) {
        void this.drain();
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while execute() awaits.
      }
    }
  }

  private async execute(job: HeadlessImageJob): Promise<ExportFile[]> {
    job.signal?.throwIfAborted();
    if (job.sourceFormat === 'svg' && this.backend.renderSvg) {
      const { generation } = this;
      try {
        const file = await this.backend.renderSvg(job.content, job.format, job.exportOptions);
        if (this.disposed || generation !== this.generation) {
          throw new Error('Headless image result arrived after its service was disposed');
        }
        return [file];
      } catch (error) {
        throw svgIssueToError(error);
      }
    }

    const client = await this.getImageClient();
    job.signal?.throwIfAborted();
    const { generation } = this;
    const transcodeStartedAt = performance.now();
    const source: ExportFile =
      job.sourceFormat === 'svg'
        ? { name: 'render.svg', bytes: new TextEncoder().encode(job.content), mimeType: 'image/svg+xml' }
        : { name: 'render.glb', bytes: job.content, mimeType: 'model/gltf-binary' };
    const inputBytes = source.bytes.byteLength;
    const result = await client.transcode({
      from: job.sourceFormat,
      to: job.format,
      files: [source],
      options: job.exportOptions ?? {},
      ...(job.signal === undefined ? {} : { signal: job.signal }),
    });
    recordHeadlessImageTiming('runtime.transcode', transcodeStartedAt, {
      kind: job.kind,
      identity: job.identity,
      geometryHash: job.sourceFormat === 'glb' ? job.geometryHash : job.identity,
      inputBytes,
      telemetry: this.activeTelemetry ?? [],
    });
    if (this.disposed || generation !== this.generation) {
      throw new Error('Headless image result arrived after its client was disposed');
    }
    if (!result.success) {
      throw issueToError(result.issues[0]);
    }
    return result.data;
  }

  private async getImageClient(): Promise<AppRuntimeClient> {
    if (this.imageClient) {
      recordHeadlessImageTiming('worker.ready', performance.now(), { cold: false });
      return this.imageClient;
    }
    if (this.backend.isGpuAvailable && !(await this.backend.isGpuAvailable())) {
      throw new HeadlessImageError(
        'adapter-unavailable',
        'WebGPU is unavailable; update your browser or use the Tau CLI for image exports.',
      );
    }
    const { generation } = this;
    const startedAt = performance.now();
    const client = await this.backend.createImageClient();
    if (this.disposed || generation !== this.generation) {
      client.terminate();
      throw new Error('Headless image client creation was superseded');
    }
    this.imageClient = client;
    if (this.dependencies.debug) {
      this.unsubscribeTelemetry = client.on('telemetry', (entries) => this.activeTelemetry?.push(...entries));
    }
    try {
      await client.connect();
    } catch (error) {
      if (this.imageClient === client) {
        this.terminateClients();
      }
      throw error;
    }
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while connect() awaits.
    if (this.disposed || generation !== this.generation) {
      if (this.imageClient === client) {
        this.terminateClients();
      }
      throw new Error('Headless image client connection was superseded');
    }
    recordHeadlessImageTiming('worker.ready', startedAt, { cold: true });
    return client;
  }

  private terminateClients(): void {
    this.generation += 1;
    this.unsubscribeTelemetry?.();
    this.unsubscribeTelemetry = undefined;
    this.imageClient?.terminate();
    this.imageClient = undefined;
  }
}
