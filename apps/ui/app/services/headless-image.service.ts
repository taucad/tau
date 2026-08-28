import type { FilesystemRuntimeSource } from '@taucad/runtime/client';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import type { ExportFile } from '@taucad/types';
import type { SvgPngOptions } from '@taucad/image/svg';
import { assertRootedPath } from '@taucad/utils/path';
import type { AppRuntimeClient, AppRuntimeExportFormat, AppRuntimeExportOptions } from '#types/runtime-client.alias.js';
import type { UiRuntimeConfigInput } from '#runtime/ui-runtime.config.js';
import type { runtime } from '#runtime/ui-runtime.definition.js';

/** Milliseconds. */
const defaultIdleTimeout = 60_000;

type ImageFormat = Extract<AppRuntimeExportFormat, 'jpeg' | 'png' | 'webp'>;

type HeadlessImageJobBase = {
  readonly kind: 'automatic-thumbnail' | 'manual-thumbnail' | 'capture';
  readonly identity: string;
  readonly projectId?: string;
};

type HeadlessGltfImageJobBase = HeadlessImageJobBase & {
  readonly sourceFormat: 'gltf';
  readonly fileSystem: RuntimeFileSystem;
  readonly source: FilesystemRuntimeSource;
  readonly parameters?: Record<string, unknown>;
  readonly includeEdges: boolean;
};

type HeadlessGltfImageJob = {
  [Format in ImageFormat]: HeadlessGltfImageJobBase & {
    readonly format: Format;
    readonly exportOptions?: AppRuntimeExportOptions<Format>['exportOptions'];
  };
}[ImageFormat];

type HeadlessSvgImageJob = HeadlessImageJobBase & {
  readonly sourceFormat: 'svg';
  readonly sourcePath: string;
  readonly content: string;
  readonly format: 'png';
  readonly exportOptions?: SvgPngOptions;
};

export type HeadlessImageJob = HeadlessGltfImageJob | HeadlessSvgImageJob;

export type HeadlessImageServiceDependencies = {
  readonly runtimeConfig: UiRuntimeConfigInput;
  /** Test seam for the standard runtime client; production uses the lazy web-worker path. */
  readonly createClient?: (fileSystem: RuntimeFileSystem) => Promise<AppRuntimeClient>;
  readonly isGpuAvailable?: () => boolean;
  /** Milliseconds before an idle headless client is terminated. */
  readonly idleTimeout?: number;
};

type QueuedJob = {
  readonly job: HeadlessImageJob;
  readonly resolve: (files: ExportFile[] | undefined) => void;
  readonly reject: (error: unknown) => void;
};

export type HeadlessImageFailureCode =
  | 'adapter-unavailable'
  | 'device-lost'
  | 'driver-unsupported'
  | 'gpu'
  | 'parse'
  | 'encode'
  | 'unknown';

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
  const details = issue?.details;
  if (details && typeof details === 'object' && 'type' in details && 'code' in details) {
    const { type, code } = details as { readonly type: unknown; readonly code: unknown };
    if (
      type === 'render' &&
      (code === 'adapter-unavailable' ||
        code === 'device-lost' ||
        code === 'driver-unsupported' ||
        code === 'gpu' ||
        code === 'parse' ||
        code === 'encode' ||
        code === 'unknown')
    ) {
      return new HeadlessImageError(code, issue.message);
    }
  }
  return new HeadlessImageError('unknown', issue?.message ?? 'Image render failed');
};

const svgIssueToError = (error: unknown): HeadlessImageError => {
  if (error && typeof error === 'object' && 'code' in error) {
    const { code } = error as { readonly code: unknown };
    if (code === 'parse' || code === 'encode') {
      return new HeadlessImageError(code, error instanceof Error ? error.message : 'SVG render failed');
    }
  }
  return new HeadlessImageError('unknown', error instanceof Error ? error.message : String(error));
};

const sourceLocator = (job: HeadlessImageJob): string =>
  job.sourceFormat === 'gltf' ? job.source.path : job.sourcePath;

/**
 * App-owned, lazy image export client shared by thumbnails and agent captures.
 * It serializes GPU work, coalesces queued automatic jobs by project, and
 * releases the worker after one minute of inactivity.
 */
export class HeadlessImageService {
  // oxlint-disable-next-line typescript/parameter-properties -- UI uses erasableSyntaxOnly, which forbids TypeScript parameter properties.
  private readonly dependencies: HeadlessImageServiceDependencies;
  private client: AppRuntimeClient | undefined;
  private fileSystem: RuntimeFileSystem | undefined;
  private queue: QueuedJob[] = [];
  private running = false;
  private activeJob: HeadlessImageJob | undefined;
  private preemptedAutomaticJob: HeadlessImageJob | undefined;
  private disposed = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly failedAutomaticIdentities = new Set<string>();
  private generation = 0;

  public constructor(dependencies: HeadlessImageServiceDependencies) {
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
    if (job.kind !== 'automatic-thumbnail' && this.activeJob?.kind === 'automatic-thumbnail') {
      this.preemptedAutomaticJob = this.activeJob;
      this.terminateClient();
    }

    return new Promise((resolve, reject) => {
      const queued = { job, resolve, reject };
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
    this.clearIdleTimer();
    this.terminateClient();
    for (const queued of this.queue.splice(0)) {
      queued.reject(new Error('HeadlessImageService was disposed'));
    }
  }

  private async drain(): Promise<void> {
    if (this.running || this.disposed) {
      return;
    }
    this.running = true;
    this.clearIdleTimer();
    try {
      /* oxlint-disable no-await-in-loop -- A single GPU queue must execute image exports serially. */
      while (this.queue.length > 0) {
        const queued = this.queue.shift()!;
        this.activeJob = queued.job;
        try {
          const files = await this.execute(queued.job);
          this.failedAutomaticIdentities.delete(queued.job.identity);
          queued.resolve(files);
        } catch (error) {
          if (this.preemptedAutomaticJob === queued.job) {
            queued.resolve(undefined);
            continue;
          }
          console.warn('Headless image job failed', {
            message: error instanceof Error ? error.message : String(error),
            kind: queued.job.kind,
            ...(queued.job.projectId ? { projectId: queued.job.projectId } : {}),
            identity: queued.job.identity,
            sourceLocator: sourceLocator(queued.job),
            code: error instanceof HeadlessImageError ? error.code : 'unknown',
          });
          if (error instanceof HeadlessImageError && error.isGpuFault) {
            this.terminateClient();
          }
          if (queued.job.kind === 'automatic-thumbnail') {
            this.failedAutomaticIdentities.add(queued.job.identity);
          }
          queued.reject(error);
        } finally {
          if (this.preemptedAutomaticJob === queued.job) {
            this.preemptedAutomaticJob = undefined;
          }
          this.activeJob = undefined;
        }
      }
      /* oxlint-enable no-await-in-loop */
    } finally {
      this.running = false;
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while execute() awaits.
      if (!this.disposed && this.queue.length > 0) {
        void this.drain();
        // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- dispose() can run while execute() awaits.
      } else if (!this.disposed) {
        this.idleTimer = setTimeout(() => {
          this.terminateClient();
        }, this.dependencies.idleTimeout ?? defaultIdleTimeout);
      }
    }
  }

  private async execute(job: HeadlessImageJob): Promise<ExportFile[]> {
    if (job.sourceFormat === 'svg') {
      const { generation } = this;
      try {
        const { renderSvgPng } = await import('@taucad/image/svg');
        const file = await renderSvgPng(job.content, job.exportOptions);
        if (this.disposed || generation !== this.generation) {
          throw new Error('Headless image result arrived after its service was disposed');
        }
        return [file];
      } catch (error) {
        throw svgIssueToError(error);
      }
    }

    const client = await this.getClient(job.fileSystem);
    const { generation } = this;
    const result =
      job.format === 'webp'
        ? await client.export('webp', {
            source: job.source,
            parameters: job.parameters,
            content: { includeEdges: job.includeEdges },
            exportOptions: job.exportOptions,
          })
        : job.format === 'png'
          ? await client.export('png', {
              source: job.source,
              parameters: job.parameters,
              content: { includeEdges: job.includeEdges },
              exportOptions: job.exportOptions,
            })
          : await client.export('jpeg', {
              source: job.source,
              parameters: job.parameters,
              content: { includeEdges: job.includeEdges },
              exportOptions: job.exportOptions,
            });
    if (this.disposed || generation !== this.generation) {
      throw new Error('Headless image result arrived after its client was disposed');
    }
    if (!result.success) {
      throw issueToError(result.issues[0]);
    }
    return result.data;
  }

  private async getClient(fileSystem: RuntimeFileSystem): Promise<AppRuntimeClient> {
    if (this.client && this.fileSystem === fileSystem) {
      return this.client;
    }
    if (this.client) {
      this.terminateClient();
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
    if (this.dependencies.createClient) {
      const client = await this.dependencies.createClient(fileSystem);
      if (this.disposed || generation !== this.generation) {
        client.terminate();
        throw new Error('Headless image client creation was superseded');
      }
      this.client = client;
      this.fileSystem = fileSystem;
      return this.client;
    }

    const [{ createRuntimeClient }, { webWorkerTransport }] = await Promise.all([
      import('@taucad/runtime/client'),
      import('@taucad/runtime/transport/web'),
    ]);
    if (this.disposed || generation !== this.generation) {
      throw new Error('Headless image client creation was superseded');
    }
    const client = createRuntimeClient<typeof runtime>({
      config: this.dependencies.runtimeConfig,
      transport: webWorkerTransport({
        createWorker: () =>
          new Worker(new URL('../runtime/runtime.worker.ts', import.meta.url), {
            name: 'tau-headless-image-runtime-worker',
            type: 'module',
          }),
        fileSystem,
      }),
    });
    this.client = client;
    this.fileSystem = fileSystem;
    return client;
  }

  private terminateClient(): void {
    this.generation += 1;
    this.client?.terminate();
    this.client = undefined;
    this.fileSystem = undefined;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = undefined;
    }
  }
}
