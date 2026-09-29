import type { ExportFile } from '@taucad/types';
import { Topic } from '@taucad/events';
import type { HeadlessImageService } from '#services/headless-image.service.js';

/** A source primitive instance, including its glTF node occurrence. */
export type PartPrimitiveReference = Readonly<{
  nodeIndex: number;
  meshIndex: number;
  primitiveIndex: number;
}>;

/** One visible or near-visible part whose preview is needed, in priority order. */
export type PartThumbnailRequest = Readonly<{
  id: string;
  primitives: readonly PartPrimitiveReference[];
}>;

export type PartThumbnailSource = Readonly<{
  sourcePath: string;
  geometryHash: string;
  content: Uint8Array<ArrayBuffer>;
}>;

export type PartThumbnailState = Readonly<{
  status: 'pending' | 'ready' | 'failed';
  /** The last successfully rendered preview stays visible during refresh or failure. */
  bytes?: Uint8Array<ArrayBuffer>;
  error?: unknown;
}>;

const maxSourceBytes = 64 * 1024 * 1024;
const maxRequestedParts = 128;
const maxPreviewBytes = 8 * 1024 * 1024;
const batchSize = 4;

type Work = Readonly<{
  generation: number;
  source: PartThumbnailSource;
  parts: readonly PartThumbnailRequest[];
}>;

/**
 * App-owned visible-part preview scheduler. The shared image service remains
 * the only GPU queue; this service submits one bounded automatic batch at a
 * time and fences results from superseded geometry or visibility requests.
 */
export class PartThumbnailService {
  // oxlint-disable-next-line typescript/parameter-properties -- UI uses erasableSyntaxOnly.
  private readonly imageService: Pick<HeadlessImageService, 'export'>;
  private readonly states = new Map<string, PartThumbnailState>();
  private readonly identities = new Map<string, string>();
  private readonly changes = new Topic<void>({ name: 'PartThumbnailService.changes' });
  private generation = 0;
  private submission = 0;
  private current: Work | undefined;
  private activeAbort: AbortController | undefined;
  private running = false;
  private disposed = false;

  public constructor(imageService: Pick<HeadlessImageService, 'export'>) {
    this.imageService = imageService;
  }

  /** Subscribe to visible state changes. The caller owns the returned cleanup. */
  public subscribe(listener: () => void, options?: { signal?: AbortSignal }): () => void {
    return this.changes.subscribe(listener, options);
  }

  public get(id: string): PartThumbnailState | undefined {
    return this.states.get(id);
  }

  /** Replace the requested visible page; an active GPU export may still finish. */
  public request(source: PartThumbnailSource, parts: readonly PartThumbnailRequest[]): void {
    if (this.disposed) {
      throw new Error('PartThumbnailService is disposed');
    }
    const seen = this.validateRequest(source, parts);
    const sameVisualWork = this.isSameVisualWork(source, parts);
    const retrying = parts.some((part) => {
      const key = this.identity(source.geometryHash, part);
      return this.identities.get(part.id) === key && this.states.get(part.id)?.status === 'failed';
    });
    if (!sameVisualWork || retrying) {
      this.generation += 1;
      this.activeAbort?.abort(new DOMException('Part thumbnail request was superseded.', 'AbortError'));
    }
    const { generation } = this;
    const readyByIdentity = new Map<string, Uint8Array<ArrayBuffer>>();
    for (const [id, state] of this.states) {
      if (state.status === 'ready' && state.bytes) {
        readyByIdentity.set(this.identities.get(id)!, state.bytes);
      }
    }
    this.current = { generation, source, parts: [...parts] };
    for (const id of this.states.keys()) {
      if (!seen.has(id)) {
        this.states.delete(id);
        this.identities.delete(id);
      }
    }
    for (const part of parts) {
      const identity = this.identity(source.geometryHash, part);
      if (this.identities.get(part.id) === identity && this.states.get(part.id)?.status === 'ready') {
        continue;
      }
      this.identities.set(part.id, identity);
      const sharedBytes = readyByIdentity.get(identity);
      this.states.set(
        part.id,
        sharedBytes ? { status: 'ready', bytes: sharedBytes } : { status: 'pending', ...this.lastGood(part.id) },
      );
    }
    this.emit();
    void this.drain();
  }

  public dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.activeAbort?.abort(new DOMException('Part thumbnail service was disposed.', 'AbortError'));
    this.current = undefined;
    this.states.clear();
    this.identities.clear();
    this.changes.dispose();
  }

  /** Fence in-flight work while retaining bounded last-good previews during refresh. */
  public invalidate(): void {
    if (this.disposed) {
      return;
    }
    this.generation += 1;
    this.activeAbort?.abort(new DOMException('Presented geometry changed.', 'AbortError'));
    this.current = undefined;
    for (const [id, state] of this.states) {
      if (state.bytes) {
        this.states.set(id, { status: 'ready', bytes: state.bytes });
      } else {
        this.states.delete(id);
        this.identities.delete(id);
      }
    }
    this.emit();
  }

  private lastGood(id: string): Pick<PartThumbnailState, 'bytes'> {
    const bytes = this.states.get(id)?.bytes;
    return bytes ? { bytes } : {};
  }

  private identity(hash: string, part: PartThumbnailRequest): string {
    // Whole-source hashing is conservative: unrelated part edits also invalidate.
    return `${hash}:${JSON.stringify(part.primitives)}:part-webp-256-v1`;
  }

  private validateRequest(source: PartThumbnailSource, parts: readonly PartThumbnailRequest[]): Set<string> {
    if (source.content.buffer.byteLength > maxSourceBytes || parts.length > maxRequestedParts) {
      throw new RangeError('Part thumbnail request exceeds 64 MiB of source data or 128 parts');
    }
    const seen = new Set<string>();
    for (const part of parts) {
      if (seen.has(part.id) || part.primitives.length === 0) {
        throw new TypeError('Part thumbnail IDs must be unique and each part must contain a primitive');
      }
      seen.add(part.id);
    }
    return seen;
  }

  private isSameVisualWork(source: PartThumbnailSource, parts: readonly PartThumbnailRequest[]): boolean {
    const { current } = this;
    if (current?.source.geometryHash !== source.geometryHash || current.source.sourcePath !== source.sourcePath) {
      return false;
    }
    const currentKeys = new Set(current.parts.map((part) => this.identity(source.geometryHash, part)));
    const requestedKeys = new Set(parts.map((part) => this.identity(source.geometryHash, part)));
    return currentKeys.size === requestedKeys.size && [...requestedKeys].every((key) => currentKeys.has(key));
  }

  private emit(): void {
    this.changes.emit();
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      /* oxlint-disable no-await-in-loop -- Thumbnail chunks must yield through the single GPU queue. */
      while (!this.disposed && this.current) {
        const work = this.current;
        const pendingKeys = new Set<string>();
        const missing = work.parts.filter((part) => {
          const key = this.identity(work.source.geometryHash, part);
          if (this.states.get(part.id)?.status !== 'pending' || pendingKeys.has(key)) {
            return false;
          }
          pendingKeys.add(key);
          return true;
        });
        if (missing.length === 0) {
          return;
        }
        const chunk = missing.slice(0, batchSize);
        const views = chunk.map(
          (part, index) =>
            ({
              id: `part-${index}`,
              visiblePrimitives: [...part.primitives],
              camera: {
                framing: 'fit',
                direction: [0.6123724357, -0.6123724357, 0.5] as const,
                up: [0, 0, 1] as const,
                margin: 0.1,
                projection: { kind: 'perspective', verticalFieldOfView: 45 },
              },
            }) as const,
        );
        const controller = new AbortController();
        this.activeAbort = controller;
        try {
          const files = await this.imageService.export({
            kind: 'automatic-thumbnail',
            identity: `${work.source.geometryHash}:parts:${chunk.map((part) => this.identity(work.source.geometryHash, part)).join('|')}:submission-${++this.submission}`,
            signal: controller.signal,
            sourceFormat: 'glb',
            sourcePath: work.source.sourcePath,
            geometryHash: work.source.geometryHash,
            content: work.source.content,
            format: 'webp',
            exportOptions: { mode: 'batch', width: 256, height: 256, quality: 0.9, views },
          });
          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- A caller may dispose during the await.
          if (this.disposed || this.generation !== work.generation) {
            continue;
          }
          this.accept(chunk, files);
        } catch (error) {
          // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- A caller may dispose during the await.
          if (this.disposed || this.generation !== work.generation) {
            continue;
          }
          this.failChunk(work.source.geometryHash, chunk, error);
        } finally {
          if (this.activeAbort === controller) {
            this.activeAbort = undefined;
          }
        }
        // A failed chunk is retryable on the next explicit request, not in a loop.
        if (chunk.some((part) => this.states.get(part.id)?.status === 'failed')) {
          return;
        }
      }
      /* oxlint-enable no-await-in-loop */
    } finally {
      this.running = false;
      const pending = this.current?.parts.some((part) => this.states.get(part.id)?.status === 'pending');
      if (!this.disposed && pending) {
        void this.drain();
      } else {
        // Completed owners retain only bounded encoded previews, not their source GLB.
        this.current = undefined;
      }
    }
  }

  private accept(parts: readonly PartThumbnailRequest[], files: readonly ExportFile[] | undefined): void {
    const byName = new Map(files?.map((file) => [file.name, file]));
    for (const [index, part] of parts.entries()) {
      const file = byName.get(`render-part-${index}.webp`);
      const identity = this.identity(this.current!.source.geometryHash, part);
      const recipients = this.current!.parts.filter(
        (candidate) => this.identity(this.current!.source.geometryHash, candidate) === identity,
      );
      if (file?.mimeType !== 'image/webp' || file.bytes.byteLength === 0 || file.bytes.byteLength > maxPreviewBytes) {
        for (const recipient of recipients) {
          this.states.set(recipient.id, {
            status: 'failed',
            ...this.lastGood(recipient.id),
            error: new Error(`Missing or oversized WebP preview for ${recipient.id}`),
          });
        }
        continue;
      }
      const bytes = new Uint8Array(file.bytes);
      for (const recipient of recipients) {
        this.states.set(recipient.id, { status: 'ready', bytes });
      }
    }
    this.limitStoredBytes();
    this.emit();
  }

  private failChunk(hash: string, chunk: readonly PartThumbnailRequest[], error: unknown): void {
    const failedKeys = new Set(chunk.map((part) => this.identity(hash, part)));
    for (const part of this.current!.parts) {
      if (failedKeys.has(this.identity(hash, part))) {
        this.states.set(part.id, { status: 'failed', ...this.lastGood(part.id), error });
      }
    }
    this.emit();
  }

  private limitStoredBytes(): void {
    const buffers = new Set([...this.states.values()].flatMap((state) => (state.bytes ? [state.bytes] : [])));
    let total = [...buffers].reduce((sum, bytes) => sum + bytes.byteLength, 0);
    for (const [, state] of this.states) {
      if (total <= maxPreviewBytes) {
        return;
      }
      if (state.bytes && buffers.has(state.bytes)) {
        total -= state.bytes.byteLength;
        buffers.delete(state.bytes);
        for (const [alias, candidate] of this.states) {
          if (candidate.bytes === state.bytes) {
            this.states.set(alias, { status: 'failed', error: new RangeError('Part preview memory budget exceeded') });
          }
        }
      }
    }
  }
}
