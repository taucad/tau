import { contentDigest, digestAction, digestContent, encodeCacheValue } from '@taucad/cache-core';
import type { ActionDigest, CacheValue, ComputeAction, ContentDigest } from '@taucad/cache-core';
import type {
  ComputeAnnouncement,
  KernelRuntime,
  ResidentCacheBinding,
  ResidentExportEntry,
} from '@taucad/runtime/kernel';

import type { PicogkComputePublication, PicogkPreparedCompute } from '#picogk.protocol.js';
import type { PicogkSession } from '#picogk-session.js';

const namespace = 'picogk.component-materialization.v2';
const codec = { id: 'picogk.raw-snapshot', version: '1' } as const;
const mediaType = 'application/vnd.taucad.picogk-snapshot';

type ComponentIdentity = {
  readonly cacheKey: string;
  readonly kind: 'triangles';
  readonly positionCount: number;
  readonly indexCount: number;
};

/** Operation-scoped bridge between async runtime storage and the synchronous managed viewer host. */
export type PicogkComputeBridge = {
  readonly request: { readonly modelDigest: string; readonly prepared: readonly PicogkPreparedCompute[] };
  readonly publish: (publications: readonly PicogkComputePublication[]) => Promise<void>;
};

const environment = {
  architecture: process.arch,
  platform: process.platform,
  scalarEncoding: 'ieee754-little-endian',
  unit: 'millimeter',
} as const satisfies CacheValue;

const geometryIdentity = (
  cacheKey: string,
): { readonly geometryKind: 'voxels' | 'mesh'; readonly digest: ContentDigest } => {
  const separator = cacheKey.indexOf(':');
  const geometryKind = cacheKey.slice(0, separator);
  if (geometryKind !== 'voxels' && geometryKind !== 'mesh') {
    throw new TypeError('PicoGK component cache keys require a voxel or mesh content digest.');
  }
  return { geometryKind, digest: contentDigest({ value: cacheKey.slice(separator + 1) }) };
};

const actionFor = (input: {
  readonly identity: ComponentIdentity;
  readonly producer: ComputeAction['producer'];
}): ComputeAction => {
  const geometry = geometryIdentity(input.identity.cacheKey);
  return {
    schemaVersion: 1,
    namespace,
    producer: input.producer,
    operation: 'snapshot-geometry',
    inputs: [{ kind: 'content', role: 'geometry', digest: geometry.digest }],
    arguments: { ...input.identity, geometryKind: geometry.geometryKind },
    environment,
    codec,
  };
};

const modelIdentity = async (input: {
  readonly entryPath: string;
  readonly parameters: unknown;
  readonly paths: readonly string[];
  readonly runtime: KernelRuntime;
}): Promise<ContentDigest> => {
  const paths = [...input.paths].sort();
  const files = await input.runtime.filesystem.readFiles(paths);
  const entries = await Promise.all(
    paths.map(async (path) => ({ path, digest: await digestContent({ bytes: files[path]! }) })),
  );
  const value = {
    entryPath: input.entryPath,
    files: entries,
    parameters: input.parameters as CacheValue,
  } as const satisfies CacheValue;
  return digestContent({ bytes: encodeCacheValue({ value }) });
};

/**
 * Prepare the synchronous managed PicoGK materialization bridge for one exact build.
 * @param input - Exact model inputs, runtime authority, native session, and implementation digests.
 * @returns A prehydrated request payload and success-only publication callback.
 */
export const preparePicogkCompute = async (input: {
  readonly entryPath: string;
  readonly parameters: unknown;
  readonly paths: readonly string[];
  readonly runtime: KernelRuntime;
  readonly session: PicogkSession;
  readonly workerSha256: string;
  readonly resourceSha256: readonly string[];
}): Promise<PicogkComputeBridge> => {
  const modelDigest = await modelIdentity(input);
  const producer: ComputeAction['producer'] = {
    id: '@taucad/picogk',
    version: 'picogk@2.3.0|host@2|materialization@2',
    implementationAssets: [input.workerSha256, ...input.resourceSha256].map((value) =>
      contentDigest({ value: `sha256:${value.toLowerCase()}` }),
    ),
  };
  const resident = new Map<ActionDigest, ResidentExportEntry>();
  const binding: ResidentCacheBinding = {
    contains: ({ digest }) => resident.has(digest),
    // Ponytail: the new contract warms by exact identity, and PicoGK component identities are
    // derived by the build itself, so nothing can be adopted before the worker request is built.
    // W4's demand-driven warm restores imports through `PicogkSession.prehydrateCompute`.
    importEntries: async ({ entries }) => ({ imported: [], omitted: entries.map((entry) => entry.actionDigest) }),
    exportEntries: async ({ digests }) => {
      const entries: ResidentExportEntry[] = [];
      const omitted: ActionDigest[] = [];
      for (const digest of digests) {
        const entry = resident.get(digest);
        if (entry) {
          entries.push(entry);
        } else {
          omitted.push(digest);
        }
      }
      return { entries, omitted };
    },
    stats: () => {
      const logicalBytes = [...resident.values()].reduce((total, entry) => total + entry.bytes.byteLength, 0);
      return {
        entries: resident.size,
        logicalBytes,
        encodedBytes: { status: 'known', bytes: logicalBytes },
        evictions: 0,
        omissions: 0,
      };
    },
    clear: () => {
      resident.clear();
    },
  };
  const capability = input.runtime.compute;
  const scope =
    capability.status === 'on'
      ? capability.openScope({
          namespace,
          producer,
          environment,
          resident: binding,
          // Ponytail: the worker reports no per-component duration; every snapshot it returns is a
          // completed materialization. Raise the floor once the build protocol carries that cost.
          admissionFloor: 0,
        })
      : undefined;

  return {
    request: { modelDigest, prepared: [] },
    async publish(publications) {
      if (!scope) {
        return;
      }
      const announcements: ComputeAnnouncement[] = [];
      for (const publication of publications) {
        const identity: ComponentIdentity = {
          cacheKey: publication.cacheKey,
          kind: publication.kind,
          positionCount: publication.positionCount,
          indexCount: publication.indexCount,
        };
        const action = actionFor({ identity, producer });
        // oxlint-disable-next-line no-await-in-loop -- worker artifacts are consumed in bounded response order.
        const bytes = await input.session.readArtifact(publication);
        // oxlint-disable-next-line no-await-in-loop -- each worker publication carries independent integrity evidence.
        const digest = await digestContent({ bytes });
        if (digest !== contentDigest({ value: `sha256:${publication.sha256}` })) {
          throw new Error('PicoGK component cache publication failed its SHA-256 integrity check.');
        }
        // oxlint-disable-next-line no-await-in-loop -- each publication carries its own action identity.
        const key = await digestAction({ action });
        resident.set(key, { action, bytes, mediaType, determinism: 'byte-exact' });
        announcements.push({
          kind: 'action',
          action,
          digest: key,
          computeDuration: 0,
          estimatedBytes: bytes.byteLength,
        });
      }
      scope.announce({ entries: announcements });
      scope.close({ outcome: 'delivered' });
    },
  };
};

export const picogkComputeNamespace = namespace;
