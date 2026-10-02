import type { ExportFile } from '@taucad/types';
import { Topic } from '@taucad/events';
import type { HeadlessImageJob, HeadlessImageService } from '#services/headless-image.service.js';

type BatchPreviewOptions = Extract<
  Extract<HeadlessImageJob, { sourceFormat: 'glb'; format: 'webp' }>['exportOptions'],
  { mode: 'batch' }
>;

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
  /** Canonical appearance identity; occurrence pose is omitted only when proven rigid. */
  visualKey?: string;
}>;

export type PartThumbnailSource = Readonly<{
  sourcePath: string;
  geometryHash: string;
  content: Uint8Array<ArrayBuffer>;
  /** Optional preview-only normalization, evaluated only when an image is missing. */
  renderContent?: () => Uint8Array<ArrayBuffer>;
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
  manualPartId: string | undefined;
}>;
type OwnerDemand = Readonly<{
  source?: PartThumbnailSource;
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
  private snapshotValue: ReadonlyMap<string, PartThumbnailState> = new Map();
  private readonly identities = new Map<string, string>();
  private readonly decodedById = new Map<string, Uint8Array<ArrayBuffer>>();
  private readonly ownerDemands = new Map<string, OwnerDemand>();
  private readonly changes = new Topic<void>({ name: 'PartThumbnailService.changes' });
  private generation = 0;
  private submission = 0;
  private current: Work | undefined;
  private activeAbort: AbortController | undefined;
  private running = false;
  private disposed = false;
  private presentedSourceKey: string | undefined;

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

  /** Stable between emissions for React's external-store subscription. */
  public snapshot(): ReadonlyMap<string, PartThumbnailState> {
    return this.snapshotValue;
  }

  /** Fence old exports as soon as the viewport announces a different source, before async preparation. */
  public announcePresentedSource(key: string | undefined): void {
    if (this.disposed || this.presentedSourceKey === key) {
      return;
    }
    this.presentedSourceKey = key;
    for (const [owner, demand] of this.ownerDemands) {
      this.ownerDemands.set(owner, { parts: demand.parts });
    }
    this.invalidate();
  }

  /** Replace the requested visible page; an active GPU export may still finish. */
  public request(
    source: PartThumbnailSource,
    parts: readonly PartThumbnailRequest[],
    options?: { readonly manualPartId?: string },
  ): void {
    this.requestForOwner('default', source, parts, options);
  }

  /** Combine simultaneous callers for the same presented unit without replacing each other's demand. */
  /* oxlint-disable eslint/max-params -- Owner, source, visible parts, and optional retry target are independent admission inputs. */
  // eslint-disable-next-line max-params-no-constructor/max-params-no-constructor -- Owner, source, requested parts, and one optional retry target are independent admission inputs.
  public requestForOwner(
    owner: string,
    source: PartThumbnailSource,
    parts: readonly PartThumbnailRequest[],
    options?: { readonly manualPartId?: string },
  ): void {
    this.validateRequest(source, parts);
    this.ownerDemands.set(owner, { source, parts: [...parts] });
    this.replaceRequest(source, this.partsFor(source), options);
  }
  /* oxlint-enable eslint/max-params */

  /** Drop only this caller's rows; the other caller and its last-good previews remain. */
  public releaseOwner(owner: string): void {
    if (!this.ownerDemands.delete(owner) || this.disposed) {
      return;
    }
    const retainedDemands = [...this.ownerDemands.values()];
    const source = retainedDemands.find((demand) => demand.source)?.source;
    if (source) {
      this.replaceRequest(source, this.partsFor(source));
      return;
    }
    const retainedIds = new Set(retainedDemands.flatMap((demand) => demand.parts.map((part) => part.id)));
    for (const id of this.states.keys()) {
      if (!retainedIds.has(id)) {
        this.states.delete(id);
        this.identities.delete(id);
        this.decodedById.delete(id);
      }
    }
    this.generation += 1;
    this.activeAbort?.abort(new DOMException('Part thumbnail owners closed.', 'AbortError'));
    this.current = undefined;
    this.emit();
  }

  public dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.activeAbort?.abort(new DOMException('Part thumbnail service was disposed.', 'AbortError'));
    this.current = undefined;
    this.states.clear();
    this.ownerDemands.clear();
    this.decodedById.clear();
    this.snapshotValue = new Map();
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
        this.decodedById.delete(id);
      }
    }
    this.emit();
  }

  /** Surface source preparation errors through the same per-part retry state. */
  public failPreparation(parts: readonly PartThumbnailRequest[], error: unknown): void {
    if (this.disposed) {
      return;
    }
    this.generation += 1;
    this.activeAbort?.abort(new DOMException('Part thumbnail preparation failed.', 'AbortError'));
    this.current = undefined;
    for (const part of parts) {
      this.states.set(part.id, { status: 'failed', ...this.lastGood(part.id), error });
    }
    this.emit();
  }

  /** Fail one consumer's preparation without cancelling the other consumer's work. */
  public failPreparationForOwner(owner: string, parts: readonly PartThumbnailRequest[], error: unknown): void {
    if (this.disposed) {
      return;
    }
    const lastGood = new Map(parts.map((part) => [part.id, this.lastGood(part.id)]));
    this.releaseOwner(owner);
    const failedParts = parts.filter(
      (part) =>
        ![...this.ownerDemands.values()].some((demand) => demand.parts.some((candidate) => candidate.id === part.id)),
    );
    this.ownerDemands.set(owner, { parts: failedParts });
    for (const part of failedParts) {
      this.states.set(part.id, { status: 'failed', ...lastGood.get(part.id), error });
    }
    this.emit();
  }

  /** Reject an encoded image that the browser cannot decode, without hiding the part name. */
  public failDecode(id: string, bytes: Uint8Array<ArrayBuffer>): void {
    const state = this.states.get(id);
    if (this.disposed || state?.bytes !== bytes) {
      return;
    }
    const lastGood = this.decodedById.get(id);
    this.states.set(id, {
      status: 'failed',
      ...(lastGood && lastGood !== bytes ? { bytes: lastGood } : {}),
      error: new Error(`Part preview for ${id} could not be decoded`),
    });
    this.emit();
  }

  /** Admit a browser-decoded preview as last-good only for the current image. */
  public markDecoded(id: string, bytes: Uint8Array<ArrayBuffer>): void {
    if (!this.disposed && this.states.get(id)?.bytes === bytes) {
      this.decodedById.set(id, bytes);
      this.limitStoredBytes();
      this.emit();
    }
  }

  private replaceRequest(
    source: PartThumbnailSource,
    parts: readonly PartThumbnailRequest[],
    options?: { readonly manualPartId?: string },
  ): void {
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
    this.current = { generation, source, parts: [...parts], manualPartId: options?.manualPartId };
    for (const id of this.states.keys()) {
      if (
        !seen.has(id) &&
        ![...this.ownerDemands.values()].some((demand) => !demand.source && demand.parts.some((part) => part.id === id))
      ) {
        this.states.delete(id);
        this.identities.delete(id);
        this.decodedById.delete(id);
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

  private partsFor(source: PartThumbnailSource): PartThumbnailRequest[] {
    const compatible = [...this.ownerDemands]
      .filter(
        ([, demand]) =>
          demand.source?.sourcePath === source.sourcePath && demand.source.geometryHash === source.geometryHash,
      )
      .sort(([left], [right]) => Number(right === 'viewer') - Number(left === 'viewer'))
      .map(([, demand]) => demand);
    const seen = new Set<string>();
    return compatible
      .flatMap((demand) => demand.parts)
      .filter((part) => {
        if (seen.has(part.id)) {
          return false;
        }
        seen.add(part.id);
        return true;
      })
      .slice(0, maxRequestedParts);
  }

  private lastGood(id: string): Pick<PartThumbnailState, 'bytes'> {
    const bytes = this.states.get(id)?.bytes;
    return bytes ? { bytes } : {};
  }

  private identity(hash: string, part: PartThumbnailRequest): string {
    return `${part.visualKey ?? hash}:${JSON.stringify(part.primitives)}:part-webp-256-v1`;
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
    this.snapshotValue = new Map(this.states);
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
        const manualPart = missing.find((part) => part.id === work.manualPartId);
        const chunk = manualPart ? [manualPart] : missing.slice(0, batchSize);
        const views = chunk.map((part, index): NonNullable<BatchPreviewOptions['views']>[number] => ({
          id: `part-${index}`,
          visiblePrimitives: part.primitives.map((primitive) => ({ ...primitive })),
          camera: {
            framing: 'fit',
            direction: [0.6123724357, -0.6123724357, 0.5] satisfies [number, number, number],
            up: [0, 0, 1] satisfies [number, number, number],
            margin: 0.1,
            projection: { kind: 'perspective', verticalFieldOfView: 45 },
          },
        }));
        const controller = new AbortController();
        this.activeAbort = controller;
        try {
          const content = work.source.renderContent?.() ?? work.source.content;
          if (content.buffer.byteLength > maxSourceBytes) {
            throw new RangeError('Part thumbnail render source exceeds 64 MiB');
          }
          const files = await this.imageService.export({
            kind: manualPart ? 'manual-thumbnail' : 'automatic-thumbnail',
            identity: `${work.source.geometryHash}:parts:${chunk.map((part) => this.identity(work.source.geometryHash, part)).join('|')}:submission-${++this.submission}`,
            signal: controller.signal,
            sourceFormat: 'glb',
            sourcePath: work.source.sourcePath,
            geometryHash: work.source.geometryHash,
            content,
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
        // Completed work releases its queue reference; active owners retain the presented source
        // reference so an evicted visible row can be restored when another owner closes.
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
    const buffers = new Set([
      ...[...this.states.values()].flatMap((state) => (state.bytes ? [state.bytes] : [])),
      ...this.decodedById.values(),
    ]);
    let total = [...buffers].reduce((sum, bytes) => sum + bytes.byteLength, 0);
    for (const [id, bytes] of this.decodedById) {
      if (total <= maxPreviewBytes) {
        break;
      }
      this.decodedById.delete(id);
      if (
        ![...this.states.values()].some((state) => state.bytes === bytes) &&
        ![...this.decodedById.values()].includes(bytes)
      ) {
        total -= bytes.byteLength;
        buffers.delete(bytes);
      }
    }
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
            this.decodedById.delete(alias);
          }
        }
      }
    }
  }
}
