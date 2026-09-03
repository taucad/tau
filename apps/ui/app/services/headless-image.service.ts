import type { RuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import type { TelemetryEntry } from '@taucad/runtime';
import type { ExportFile } from '@taucad/types';
import { renderSvgPng } from '@taucad/image/svg';
import type { SvgPngOptions } from '@taucad/image/svg';
import { canonicalJson } from '@taucad/utils/hash';
import { assertRootedPath } from '@taucad/utils/path';
import { z } from 'zod';
import type { AppRuntimeExportFormat, AppRuntimeExportOptions } from '#types/runtime-client.alias.js';
import type { imageRuntime } from '#runtime/image-runtime.definition.js';
import { recordHeadlessImageTiming } from '#services/headless-image-debug.js';

type ImageTranscodeInput = Parameters<RuntimeClient<typeof imageRuntime>['transcode']>[0];
type ImageFormat = Extract<AppRuntimeExportFormat, 'jpeg' | 'png' | 'webp'>;

type HeadlessImageJobBase = {
  readonly kind: 'automatic-thumbnail' | 'manual-thumbnail' | 'capture';
  readonly identity: string;
  readonly projectId?: string;
};

type HeadlessGlbImageJob = {
  [Format in ImageFormat]: HeadlessImageJobBase & {
    readonly sourceFormat: 'glb';
    readonly sourcePath: string;
    readonly geometryHash: string;
    readonly content: Uint8Array<ArrayBuffer>;
    readonly format: Format;
    readonly exportOptions: NonNullable<AppRuntimeExportOptions<Format>['exportOptions']>;
  };
}[ImageFormat];

type HeadlessSvgImageJob = HeadlessImageJobBase & {
  readonly sourceFormat: 'svg';
  readonly sourcePath: string;
  readonly content: string;
  readonly format: 'png';
  readonly exportOptions?: SvgPngOptions;
};

export type HeadlessImageJob = HeadlessGlbImageJob | HeadlessSvgImageJob;

export type HeadlessImageServiceDependencies = {
  /** Test seam for the image-only runtime client. */
  readonly createImageClient?: () => Promise<RuntimeClient<typeof imageRuntime>>;
  readonly isGpuAvailable?: () => boolean;
  readonly debug?: boolean;
};

type QueuedJob = {
  readonly job: HeadlessImageJob;
  readonly resolve: (files: ExportFile[] | undefined) => void;
  readonly reject: (error: unknown) => void;
  readonly enqueuedAt: number;
  readonly queueDepth: number;
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

/**
 * App-owned, lazy image export client shared by thumbnails and agent captures.
 * It serializes GPU work, coalesces queued automatic jobs by project, and
 * retains its owner-scoped image worker until disposal.
 */
export class HeadlessImageService {
  // oxlint-disable-next-line typescript/parameter-properties -- UI uses erasableSyntaxOnly, which forbids TypeScript parameter properties.
  private readonly dependencies: HeadlessImageServiceDependencies;
  private imageClient: RuntimeClient<typeof imageRuntime> | undefined;
  private queue: QueuedJob[] = [];
  private running = false;
  private disposed = false;
  private readonly failedAutomaticIdentities = new Set<string>();
  private activeTelemetry: TelemetryEntry[] | undefined;
  private unsubscribeTelemetry: (() => void) | undefined;
  private generation = 0;
  private lastSuccessfulCapture: { readonly key: string; readonly files: ExportFile[] } | undefined;

  public constructor(dependencies: HeadlessImageServiceDependencies = {}) {
    this.dependencies = dependencies;
  }

  public async export(job: HeadlessImageJob): Promise<ExportFile[] | undefined> {
    assertRootedPath(job.sourcePath);
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
      const queued = {
        job,
        resolve,
        reject,
        enqueuedAt: performance.now(),
        queueDepth: this.queue.length + (this.running ? 1 : 0),
      };
      if (job.kind === 'automatic-thumbnail' && job.projectId) {
        const existingIndex = this.queue.findIndex(
          (entry) => entry.job.kind === 'automatic-thumbnail' && entry.job.projectId === job.projectId,
        );
        if (existingIndex === -1) {
          this.queue.push(queued);
        } else {
          this.queue[existingIndex]!.resolve(undefined);
          this.queue[existingIndex] = queued;
        }
      } else {
        const automaticIndex = this.queue.findIndex(({ job: queuedJob }) => queuedJob.kind === 'automatic-thumbnail');
        if (automaticIndex === -1) {
          this.queue.push(queued);
        } else {
          this.queue.splice(automaticIndex, 0, queued);
        }
      }
      void this.drain();
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.lastSuccessfulCapture = undefined;
    this.terminateClients();
    for (const queued of this.queue.splice(0)) {
      queued.reject(new Error('HeadlessImageService was disposed'));
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
        const startedAt = performance.now();
        this.activeTelemetry = this.dependencies.debug ? [] : undefined;
        recordHeadlessImageTiming('queue.wait', queued.enqueuedAt, {
          kind: queued.job.kind,
          identity: queued.job.identity,
          queueDepth: queued.queueDepth,
        });
        try {
          const files = await this.execute(queued.job);
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
          queued.resolve(files);
        } catch (error) {
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
          }
          recordHeadlessImageTiming('job.complete', startedAt, {
            kind: queued.job.kind,
            identity: queued.job.identity,
            success: false,
            errorCode: error instanceof HeadlessImageError ? error.code : 'unknown',
          });
          queued.reject(error);
        } finally {
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
    if (job.sourceFormat === 'svg') {
      const { generation } = this;
      try {
        const file = await renderSvgPng(job.content, job.exportOptions);
        if (this.disposed || generation !== this.generation) {
          throw new Error('Headless image result arrived after its service was disposed');
        }
        return [file];
      } catch (error) {
        throw svgIssueToError(error);
      }
    }

    const client = await this.getImageClient();
    const { generation } = this;
    const transcodeStartedAt = performance.now();
    const result = await client.transcode({
      from: 'glb',
      to: job.format,
      files: [{ name: 'render.glb', bytes: job.content, mimeType: 'model/gltf-binary' }],
      options: job.exportOptions,
    } as ImageTranscodeInput);
    recordHeadlessImageTiming('runtime.transcode', transcodeStartedAt, {
      kind: job.kind,
      identity: job.identity,
      geometryHash: job.geometryHash,
      inputBytes: job.content.byteLength,
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

  private async getImageClient(): Promise<RuntimeClient<typeof imageRuntime>> {
    if (this.imageClient) {
      recordHeadlessImageTiming('worker.ready', performance.now(), { cold: false });
      return this.imageClient;
    }
    const gpuAvailable =
      this.dependencies.isGpuAvailable?.() ?? (typeof navigator !== 'undefined' && 'gpu' in navigator);
    if (!gpuAvailable) {
      throw new HeadlessImageError(
        'adapter-unavailable',
        'WebGPU is unavailable; update your browser or use the Tau CLI for image exports.',
      );
    }
    const { generation } = this;
    const startedAt = performance.now();
    const client = this.dependencies.createImageClient
      ? await this.dependencies.createImageClient()
      : await (async () => {
          const [{ createRuntimeClient }, { webWorkerTransport }] = await Promise.all([
            import('@taucad/runtime/client'),
            import('@taucad/runtime/transport/web'),
          ]);
          return createRuntimeClient<typeof imageRuntime>({
            transport: webWorkerTransport({
              createWorker: () =>
                new Worker(new URL('../runtime/image-runtime.worker.ts', import.meta.url), {
                  name: 'tau-headless-image-transcoder-worker',
                  type: 'module',
                }),
              fileSystem: fromMemoryFs(),
            }),
          });
        })();
    if (this.disposed || generation !== this.generation) {
      client.terminate();
      throw new Error('Headless image client creation was superseded');
    }
    if (this.dependencies.debug) {
      this.unsubscribeTelemetry = client.on('telemetry', (entries) => this.activeTelemetry?.push(...entries));
    }
    await client.connect();
    // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while connect() awaits.
    if (this.disposed || generation !== this.generation) {
      client.terminate();
      throw new Error('Headless image client connection was superseded');
    }
    this.imageClient = client;
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
