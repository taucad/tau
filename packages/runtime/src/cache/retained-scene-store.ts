import { z } from 'zod';
import { CacheCorruptionError, contentDigest, digestContent, digestScene } from '@taucad/cache-core';
import type { CacheValue, ContentDigest, SceneDigest } from '@taucad/cache-core';
import { randomUuid } from '@taucad/utils/id';
import { createProjectComputeStores } from '#cache/project-compute-store.js';
import type { KernelFileSystem } from '#types/runtime-kernel.types.js';
import type {
  ResolvedSceneAsset,
  ResolvedSceneSnapshot,
  SceneAssetReference,
  SceneBookmark,
  SceneNodeId,
  TauSceneManifest,
} from '#types/runtime-scene.types.js';

const referenceScope = 'scene-snapshot';
const publicationLeaseDuration = 60 * 60 * 1000;
const utf8 = new TextEncoder();
const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const digestPattern = /^sha256:[0-9a-f]{64}$/u;

const contentDigestSchema = z.custom<ContentDigest>((value) => typeof value === 'string' && digestPattern.test(value));
const sceneDigestSchema = z.custom<SceneDigest>((value) => typeof value === 'string' && digestPattern.test(value));
const sceneNodeIdSchema = z.custom<SceneNodeId>(
  (value) => typeof value === 'string' && value.length > 0 && value.isWellFormed(),
);
const sceneAssetReferenceSchema = z
  .object({
    contentDigest: contentDigestSchema,
    semanticDigest: contentDigestSchema.optional(),
    mediaType: z.enum(['model/gltf-binary', 'image/svg+xml']),
    byteLength: z.number().int().nonnegative(),
  })
  .strict();
const sceneTransformSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);
const scenePresentationSchema = z
  .object({
    background: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    fieldOfViewDegrees: z.number().optional(),
  })
  .strict();
const sceneNodeSchema = z
  .object({
    id: sceneNodeIdSchema,
    name: z.string().optional(),
    parentId: sceneNodeIdSchema.optional(),
    childIds: z.array(sceneNodeIdSchema).readonly(),
    geometry: sceneAssetReferenceSchema.optional(),
    transform: sceneTransformSchema,
    visible: z.boolean(),
  })
  .strict();
const sceneManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    rootNodeIds: z.array(sceneNodeIdSchema).readonly(),
    nodes: z.record(z.string(), sceneNodeSchema).readonly(),
    presentation: scenePresentationSchema,
  })
  .strict();
const retainedSceneEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    bookmarkId: z.string().min(1),
    sceneDigest: sceneDigestSchema,
    manifest: sceneManifestSchema,
    assets: z.array(sceneAssetReferenceSchema).readonly(),
  })
  .strict();

type RetainedSceneEnvelope = z.infer<typeof retainedSceneEnvelopeSchema>;

/** Project-backed storage for immutable progressive-scene bookmarks. @internal */
export type RetainedSceneStore = {
  readonly retain: (input: {
    readonly bookmark: SceneBookmark;
    readonly snapshot: ResolvedSceneSnapshot;
    readonly signal?: AbortSignal;
  }) => Promise<void>;
  readonly read: (input: {
    readonly bookmarkId: string;
    readonly signal?: AbortSignal;
  }) => Promise<ResolvedSceneSnapshot | undefined>;
};

/** Canonical cache-domain projection shared by live and retained scene digests. @internal */
export const toSceneCacheValue = (manifest: TauSceneManifest): CacheValue => ({
  schemaVersion: manifest.schemaVersion,
  rootNodeIds: [...manifest.rootNodeIds],
  nodes: Object.fromEntries(
    Object.entries(manifest.nodes).map(([id, node]) => [
      id,
      {
        id: node.id,
        ...(node.name === undefined ? {} : { name: node.name }),
        ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
        childIds: [...node.childIds],
        ...(node.geometry === undefined
          ? {}
          : {
              geometry: {
                semanticDigest: node.geometry.semanticDigest ?? node.geometry.contentDigest,
                mediaType: node.geometry.mediaType,
              },
            }),
        transform: [...node.transform],
        visible: node.visible,
      },
    ]),
  ),
  presentation: {
    ...(manifest.presentation.background === undefined ? {} : { background: [...manifest.presentation.background] }),
    ...(manifest.presentation.fieldOfViewDegrees === undefined
      ? {}
      : { fieldOfViewDegrees: manifest.presentation.fieldOfViewDegrees }),
  },
});

const geometryBytes = (asset: ResolvedSceneAsset): Uint8Array<ArrayBuffer> =>
  asset.geometry.format === 'gltf' ? new Uint8Array(asset.geometry.content) : utf8.encode(asset.geometry.content);

const assertGraphIntegrity = (manifest: TauSceneManifest): void => {
  const { nodes } = manifest;
  const roots = new Set(manifest.rootNodeIds);
  if (roots.size !== manifest.rootNodeIds.length) {
    throw new CacheCorruptionError('Retained scene manifest contains duplicate roots.');
  }
  for (const root of roots) {
    if (!nodes[root] || nodes[root].parentId !== undefined) {
      throw new CacheCorruptionError('Retained scene manifest contains an invalid root.');
    }
  }
  for (const [id, node] of Object.entries(nodes)) {
    if (node.id !== id || new Set(node.childIds).size !== node.childIds.length) {
      throw new CacheCorruptionError('Retained scene manifest contains an invalid node identity.');
    }
    if (node.parentId !== undefined && !nodes[node.parentId]) {
      throw new CacheCorruptionError('Retained scene manifest contains a missing parent.');
    }
    for (const childId of node.childIds) {
      if (nodes[childId]?.parentId !== node.id) {
        throw new CacheCorruptionError('Retained scene manifest contains an inconsistent child relationship.');
      }
    }
  }
  const reachable = new Set<SceneNodeId>();
  const pending = [...manifest.rootNodeIds];
  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (nodeId === undefined || reachable.has(nodeId)) {
      continue;
    }
    reachable.add(nodeId);
    pending.push(...(nodes[nodeId]?.childIds ?? []));
  }
  if (reachable.size !== Object.keys(nodes).length) {
    throw new CacheCorruptionError('Retained scene manifest contains unreachable nodes.');
  }
};

const checkSnapshotIntegrity = async (input: {
  readonly sceneDigest: SceneDigest;
  readonly snapshot: ResolvedSceneSnapshot;
}): Promise<void> => {
  assertGraphIntegrity(input.snapshot.manifest);
  if ((await digestScene({ value: toSceneCacheValue(input.snapshot.manifest) })) !== input.sceneDigest) {
    throw new CacheCorruptionError('Retained scene manifest does not match its scene digest.');
  }
  const assets = new Map<ContentDigest, ResolvedSceneAsset>();
  for (const asset of input.snapshot.assets) {
    if (assets.has(asset.contentDigest)) {
      throw new CacheCorruptionError('Retained scene snapshot contains duplicate assets.');
    }
    const bytes = geometryBytes(asset);
    const expectedMediaType = asset.geometry.format === 'gltf' ? 'model/gltf-binary' : 'image/svg+xml';
    if (
      asset.mediaType !== expectedMediaType ||
      asset.byteLength !== bytes.byteLength ||
      // oxlint-disable-next-line eslint/no-await-in-loop -- integrity must settle before the asset enters the lookup map.
      (await digestContent({ bytes })) !== asset.contentDigest
    ) {
      throw new CacheCorruptionError('Retained scene asset metadata does not match its bytes.');
    }
    assets.set(asset.contentDigest, asset);
  }
  const referenced = new Set<ContentDigest>();
  for (const node of Object.values(input.snapshot.manifest.nodes)) {
    if (node.geometry === undefined) {
      continue;
    }
    const asset = assets.get(node.geometry.contentDigest);
    if (!asset || asset.mediaType !== node.geometry.mediaType || asset.byteLength !== node.geometry.byteLength) {
      throw new CacheCorruptionError('Retained scene node references a missing or incompatible asset.');
    }
    referenced.add(asset.contentDigest);
  }
  if (referenced.size !== assets.size) {
    throw new CacheCorruptionError('Retained scene snapshot contains unreachable assets.');
  }
};

const assertSnapshotIntegrity = async (input: {
  readonly sceneDigest: SceneDigest;
  readonly snapshot: ResolvedSceneSnapshot;
}): Promise<void> => {
  try {
    await checkSnapshotIntegrity(input);
  } catch (error) {
    if (error instanceof CacheCorruptionError) {
      throw error;
    }
    throw new CacheCorruptionError('Retained scene snapshot failed integrity validation.', { cause: error });
  }
};

const parseEnvelope = (bytes: Uint8Array<ArrayBuffer>): RetainedSceneEnvelope => {
  try {
    return retainedSceneEnvelopeSchema.parse(JSON.parse(strictUtf8.decode(bytes)));
  } catch (error) {
    throw new CacheCorruptionError('Retained scene snapshot metadata is malformed.', { cause: error });
  }
};

const resolvedAsset = (reference: SceneAssetReference, bytes: Uint8Array<ArrayBuffer>): ResolvedSceneAsset => {
  try {
    return {
      ...reference,
      geometry:
        reference.mediaType === 'model/gltf-binary'
          ? { format: 'gltf', content: new Uint8Array(bytes) }
          : { format: 'svg', content: strictUtf8.decode(bytes) },
    };
  } catch (error) {
    throw new CacheCorruptionError('Retained scene asset encoding is invalid.', { cause: error });
  }
};

/**
 * Create durable scene retention over the shared project compute CAS.
 * @internal
 * @param filesystem - Rooted project filesystem authority.
 * @returns Durable retained-scene store.
 */
export const createRetainedSceneStore = (filesystem: KernelFileSystem): RetainedSceneStore => {
  const stores = createProjectComputeStores(filesystem);
  return {
    retain: async ({ bookmark, snapshot, signal }) => {
      signal?.throwIfAborted();
      await assertSnapshotIntegrity({ sceneDigest: bookmark.sceneDigest, snapshot });
      const envelope: RetainedSceneEnvelope = {
        schemaVersion: 1,
        bookmarkId: bookmark.id,
        sceneDigest: bookmark.sceneDigest,
        manifest: sceneManifestSchema.parse(snapshot.manifest),
        assets: snapshot.assets.map(({ geometry: _geometry, ...reference }) => reference),
      };
      const metadataBytes = utf8.encode(JSON.stringify(retainedSceneEnvelopeSchema.parse(envelope)));
      const metadataDigest = await digestContent({ bytes: metadataBytes });
      const contentDigests = [metadataDigest, ...snapshot.assets.map(({ contentDigest: digest }) => digest)];
      const leaseId = randomUuid();
      await stores.lifecycle.renewLease({
        sessionId: leaseId,
        actionDigests: [],
        contentDigests,
        expiresAt: Date.now() + publicationLeaseDuration,
        signal,
      });
      try {
        for (const asset of snapshot.assets) {
          // oxlint-disable-next-line no-await-in-loop -- referenced blobs must precede the metadata ref publication.
          const result = await stores.contentStore.write({
            digest: asset.contentDigest,
            bytes: geometryBytes(asset),
            signal,
          });
          if (result.status === 'rejected') {
            throw new Error('Project cache rejected a retained scene asset.');
          }
        }
        const metadataResult = await stores.contentStore.write({
          digest: metadataDigest,
          bytes: metadataBytes,
          signal,
        });
        if (metadataResult.status === 'rejected') {
          throw new Error('Project cache rejected retained scene metadata.');
        }
        await stores.lifecycle.writeRef({
          scope: referenceScope,
          name: bookmark.id,
          actionDigests: [],
          contentDigests,
          signal,
        });
      } catch (error) {
        await stores.lifecycle.releaseLease({ sessionId: leaseId }).catch(() => undefined);
        throw error;
      }
      await stores.lifecycle.releaseLease({ sessionId: leaseId }).catch(() => undefined);
    },
    read: async ({ bookmarkId, signal }) => {
      try {
        signal?.throwIfAborted();
        const reference = await stores.lifecycle.readRef({ scope: referenceScope, name: bookmarkId, signal });
        if (!reference || reference.actionDigests.length > 0 || reference.contentDigests.length === 0) {
          return undefined;
        }
        const [metadataDigest, ...rootedAssets] = reference.contentDigests;
        if (metadataDigest === undefined) {
          return undefined;
        }
        const metadata = await stores.contentStore.read({ digest: contentDigest({ value: metadataDigest }), signal });
        if (metadata.status === 'miss') {
          return undefined;
        }
        const envelope = parseEnvelope(metadata.bytes);
        if (envelope.bookmarkId !== bookmarkId) {
          throw new CacheCorruptionError('Retained scene metadata has the wrong bookmark identity.');
        }
        const expectedRoots = envelope.assets.map(({ contentDigest: digest }) => digest);
        if (
          expectedRoots.length !== rootedAssets.length ||
          expectedRoots.some((digest, index) => digest !== rootedAssets[index])
        ) {
          throw new CacheCorruptionError('Retained scene ref does not match its asset closure.');
        }
        const assets: ResolvedSceneAsset[] = [];
        for (const assetReference of envelope.assets) {
          // oxlint-disable-next-line no-await-in-loop -- each validated reference must resolve before reconstruction.
          const content = await stores.contentStore.read({ digest: assetReference.contentDigest, signal });
          if (content.status === 'miss' || content.bytes.byteLength !== assetReference.byteLength) {
            throw new CacheCorruptionError('Retained scene asset is missing or truncated.');
          }
          assets.push(resolvedAsset(assetReference, content.bytes));
        }
        const snapshot: ResolvedSceneSnapshot = { manifest: envelope.manifest, assets };
        await assertSnapshotIntegrity({ sceneDigest: envelope.sceneDigest, snapshot });
        return snapshot;
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof CacheCorruptionError) {
          return undefined;
        }
        throw error;
      }
    },
  };
};
