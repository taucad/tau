import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { sceneViewSchema } from '#experiments/filesystem-scene/scene.schema.js';
import type { SceneView } from '#experiments/filesystem-scene/scene.schema.js';
import { projectPathSchema } from '@taucad/workbench';
import { z } from 'zod';

export const sceneLimits = {
  recordBytes: 64 * 1024,
  assetBytes: 16 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  assets: 64,
} as const;
export const digest = (bytes: Uint8Array<ArrayBuffer> | string): string =>
  createHash('sha256').update(bytes).digest('hex');

/** Immutable content-addressed asset metadata. */
export type SceneAsset = Readonly<{ path: string; digest: string; byteLength: number }>;
/** Validated presentation plus a separate geometry identity. */
export type SceneRevision = Readonly<{
  id: string;
  geometryId: string;
  view: SceneView;
  assets: readonly SceneAsset[];
}>;
/** Prepared candidate with copy-on-read immutable resource access. */
export type SceneCandidate = Readonly<{
  revision: SceneRevision;
  readAsset: (digest: string) => Uint8Array<ArrayBuffer>;
}>;
/** Bounded reads from the host-admitted filesystem. */
export type SceneSource = {
  // Supplied by the host's rooted filesystem admission. Every read is bounded.
  read: (path: string, maxBytes: number) => Promise<Uint8Array<ArrayBuffer>>;
  list: (directory: string) => Promise<readonly string[]>;
};
/** Renderer-owned preparation and atomic presentation handoff. */
export type SceneAdapter = {
  // Prepare never mutates the visible scene. Check signal in expensive work.
  prepare: (candidate: SceneCandidate, signal: AbortSignal) => Promise<{ commit: () => void; dispose: () => void }>;
  // Synchronous atomic presentation update. No geometry decode or evaluation.
  present: (revision: SceneRevision) => void;
};
/** Truthful reconciliation outcome including retained last-good state. */
export type SceneResult =
  | { status: 'applied' | 'unchanged'; revision: SceneRevision }
  | { status: 'superseded' }
  | { status: 'invalid-preserved'; message: string; revision: SceneRevision | undefined };

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
};

const glbResourcesSchema = z.object({
  asset: z.object({ version: z.literal('2.0') }),
  buffers: z
    .array(z.object({ byteLength: z.number().int().nonnegative() }))
    .max(1)
    .default([]),
  bufferViews: z
    .array(
      z.object({
        buffer: z.literal(0),
        byteOffset: z.number().int().nonnegative().default(0),
        byteLength: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  extensionsRequired: z.array(z.string()).max(0).optional(),
});

const assertClosedResources = (value: unknown, depth: number): void => {
  if (depth > 64) {
    throw new Error('GLB JSON nesting exceeds 64 levels.');
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === 'uri' || key === '__proto__') {
      throw new Error('GLB must be closed: URI resources and prototype keys are refused.');
    }
    assertClosedResources(child, depth + 1);
  }
};

// Validate the GLB envelope and resource closure before a renderer gets bytes.
// Full mesh/material semantics are validated by adapter.prepare before commit.
export const validateClosedGlb = (bytes: Uint8Array<ArrayBuffer>): void => {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    data.getUint32(0, true) !== 0x46_54_6c_67 ||
    data.getUint32(4, true) !== 2 ||
    data.getUint32(8, true) !== bytes.length
  ) {
    throw new Error('Expected a complete GLB 2.0 envelope.');
  }
  let offset = 12;
  let json: unknown;
  let binaryLength = 0;
  let chunks = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      throw new Error('Interrupted GLB chunk header.');
    }
    const length = data.getUint32(offset, true);
    const kind = data.getUint32(offset + 4, true);
    if (length % 4 !== 0 || offset + 8 + length > bytes.length) {
      throw new Error('Interrupted GLB chunk.');
    }
    if (chunks === 0 && kind === 0x4e_4f_53_4a) {
      json = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset + 8, offset + 8 + length)),
      ) as unknown;
    } else if (chunks === 1 && kind === 0x00_4e_49_42) {
      binaryLength = length;
    } else {
      throw new Error('Only the JSON and optional BIN chunks are supported.');
    }
    chunks++;
    offset += 8 + length;
  }
  assertClosedResources(json, 0);
  const value = glbResourcesSchema.parse(json);
  const declared = value.buffers[0]?.byteLength ?? 0;
  if (declared > binaryLength || binaryLength - declared > 3) {
    throw new Error('Embedded buffer length does not match BIN chunk.');
  }
  for (const view of value.bufferViews) {
    if (value.buffers.length === 0 || view.byteOffset + view.byteLength > declared) {
      throw new Error('Buffer view exceeds the embedded resource.');
    }
  }
};

const snapshot = async (source: SceneSource, viewPath: string, signal: AbortSignal): Promise<SceneCandidate> => {
  signal.throwIfAborted();
  const bytes = await source.read(viewPath, sceneLimits.recordBytes);
  if (bytes.byteLength > sceneLimits.recordBytes) {
    throw new Error('View exceeds 64 KiB.');
  }
  const value: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    (key: string, child: unknown) => {
      if (key === '__proto__') {
        throw new Error('Prototype keys are refused.');
      }
      return child;
    },
  );
  const view = sceneViewSchema.parse(value);
  const paths = [...(await source.list(view.assetDirectory))].sort();
  if (paths.length > sceneLimits.assets || new Set(paths).size !== paths.length) {
    throw new Error('Asset count exceeds limit or contains duplicate paths.');
  }
  const assets: SceneAsset[] = [];
  const content = new Map<string, Uint8Array<ArrayBuffer>>();
  let size = 0;
  for (const path of paths) {
    signal.throwIfAborted();
    projectPathSchema.parse(path);
    if (
      !path.startsWith(`${view.assetDirectory}/`) ||
      path.slice(view.assetDirectory.length + 1).includes('/') ||
      !path.endsWith('.glb')
    ) {
      throw new Error('Only direct .glb children of assetDirectory are accepted.');
    }
    // oxlint-disable-next-line no-await-in-loop -- Sequential bounded reads enforce the aggregate allocation budget.
    const data = await source.read(path, sceneLimits.assetBytes);
    size += data.byteLength;
    if (data.byteLength > sceneLimits.assetBytes || size > sceneLimits.totalBytes) {
      throw new Error('Asset byte budget exceeded.');
    }
    validateClosedGlb(data);
    const hash = digest(data);
    content.set(hash, new Uint8Array(data));
    assets.push({ path, digest: hash, byteLength: data.byteLength });
  }
  // EntryPath belongs to the canonical view, but this spike loads only staged
  // geometry: no CAD source evaluation, code imports, or inferred publication.
  if (view.entryPath !== null && !paths.includes(view.entryPath)) {
    throw new Error('entryPath must name a staged GLB, or be null.');
  }
  const geometryId = digest(JSON.stringify(assets));
  const revision = freeze({ id: digest(JSON.stringify({ view, geometryId })), geometryId, view, assets });
  return {
    revision,
    readAsset(hash) {
      const data = content.get(hash);
      if (!data) {
        throw new Error('Digest is not in this revision.');
      }
      return new Uint8Array(data);
    },
  };
};

export const createSceneController = (options: {
  source: SceneSource;
  viewPath: string;
  adapter: SceneAdapter;
  settleMilliseconds?: number;
}): {
  readonly current: SceneRevision | undefined;
  invalidate: () => void;
  reconcile: () => Promise<SceneResult>;
  dispose: () => void;
} => {
  let generation = 0;
  let stopped = false;
  let active: AbortController | undefined;
  let current: SceneRevision | undefined;
  let release: (() => void) | undefined;
  return {
    get current(): SceneRevision | undefined {
      return current;
    },
    invalidate(): void {
      generation++;
      active?.abort();
    },
    async reconcile(): Promise<SceneResult> {
      if (stopped) {
        return { status: 'superseded' };
      }
      const ownGeneration = ++generation;
      active?.abort();
      const cancellation = new AbortController();
      active = cancellation;
      let prepared: Awaited<ReturnType<SceneAdapter['prepare']>> | undefined;
      try {
        const first = await snapshot(options.source, options.viewPath, cancellation.signal);
        await delay(options.settleMilliseconds ?? 75, undefined, { signal: cancellation.signal });
        const candidate = await snapshot(options.source, options.viewPath, cancellation.signal);
        if (first.revision.id !== candidate.revision.id) {
          throw new Error('Files changed during validation; awaiting a stable revision.');
        }
        if (ownGeneration !== generation) {
          return { status: 'superseded' };
        }
        if (candidate.revision.id === current?.id) {
          return { status: 'unchanged', revision: current };
        }
        if (candidate.revision.geometryId === current?.geometryId) {
          options.adapter.present(candidate.revision);
          current = candidate.revision;
        } else {
          prepared = await options.adapter.prepare(candidate, cancellation.signal);
          if (ownGeneration !== generation) {
            prepared.dispose();
            prepared = undefined;
            return { status: 'superseded' };
          }
          prepared.commit();
          const previousRelease = release;
          release = prepared.dispose;
          prepared = undefined;
          current = candidate.revision; // Atomic validated revision pointer.
          previousRelease?.();
        }
        return { status: 'applied', revision: current };
      } catch (error) {
        prepared?.dispose();
        if (ownGeneration !== generation) {
          return { status: 'superseded' };
        }
        return {
          status: 'invalid-preserved',
          message: error instanceof Error ? error.message : String(error),
          revision: current,
        };
      }
    },
    dispose(): void {
      stopped = true;
      generation++;
      active?.abort();
      release?.();
      release = undefined;
    },
  };
};
