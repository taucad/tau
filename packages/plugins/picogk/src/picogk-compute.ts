import { canonicalizeComputeAction, contentDigest, digestContent, encodeCacheValue } from '@taucad/cache-core';
import type { CacheValue, ComputeAction, ContentDigest } from '@taucad/cache-core';
import type { KernelRuntime } from '@taucad/runtime/kernel';

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
    environment: {
      architecture: process.arch,
      platform: process.platform,
      scalarEncoding: 'ieee754-little-endian',
      unit: 'millimeter',
    },
    codec,
  };
};

const identityFromCanonicalAction = (canonicalAction: string): ComponentIdentity | undefined => {
  try {
    const value = JSON.parse(canonicalAction) as Record<string, unknown>;
    if (value['namespace'] !== namespace || value['operation'] !== 'snapshot-geometry') {
      return undefined;
    }
    const candidate = value['arguments'] as Partial<ComponentIdentity> | undefined;
    if (
      candidate?.kind !== 'triangles' ||
      typeof candidate.cacheKey !== 'string' ||
      !Number.isSafeInteger(candidate.positionCount) ||
      !Number.isSafeInteger(candidate.indexCount) ||
      candidate.positionCount! <= 0 ||
      candidate.indexCount! <= 0
    ) {
      return undefined;
    }
    geometryIdentity(candidate.cacheKey);
    return {
      cacheKey: candidate.cacheKey,
      kind: candidate.kind,
      positionCount: candidate.positionCount!,
      indexCount: candidate.indexCount!,
    };
  } catch {
    return undefined;
  }
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
  const compute = await input.runtime.compute.openSession({
    namespace,
    scope: { producer },
    policy: 'best-effort',
  });
  const candidates: Array<{
    readonly identity: ComponentIdentity;
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly contentDigest: ContentDigest;
  }> = [];
  for (const prepared of compute.prepared()) {
    const identity = identityFromCanonicalAction(prepared.canonicalAction);
    if (!identity) {
      continue;
    }
    const action = actionFor({ identity, producer });
    if (prepared.canonicalAction !== canonicalizeComputeAction(action)) {
      continue;
    }
    const hit = compute.lookup({ action });
    if (hit.status === 'hit' && hit.source === 'cache') {
      candidates.push({ identity, bytes: hit.bytes, contentDigest: hit.contentDigest });
    }
  }
  const prepared = await input.session.prehydrateCompute(candidates);

  return {
    request: { modelDigest, prepared },
    async publish(publications) {
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
        compute.record({
          action,
          bytes,
          mediaType,
        });
      }
      await compute.flush();
    },
  };
};

export const picogkComputeNamespace = namespace;
