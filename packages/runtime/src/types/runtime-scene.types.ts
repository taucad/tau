import type { ContentDigest, SceneDigest } from '@taucad/cache-core';
import type { GeometryGltf, GeometrySvg } from '@taucad/types';

declare const sceneNodeIdBrand: unique symbol;

/** Opaque, render-scoped identity for one logical scene node. @public */
export type SceneNodeId = string & { readonly [sceneNodeIdBrand]: true };

/** Geometry formats that can be retained as immutable progressive-scene assets. @public */
export type SceneAssetGeometry = GeometryGltf | GeometrySvg;

/** Progressive output support advertised by one kernel render route. @public */
export type ProgressiveSceneCapability =
  | { readonly type: 'unsupported'; readonly reason: string }
  | {
      readonly type: 'supported';
      readonly deliveries: ReadonlyArray<'reset' | 'delta' | 'refinement'>;
      readonly bookmarks: ReadonlyArray<'explicit' | 'viewer-update' | 'viewer-operation'>;
      readonly replay: ReadonlyArray<'live' | 'retained'>;
    };

/** Immutable content-addressed asset referenced by a scene manifest. @public */
export type SceneAssetReference = {
  readonly contentDigest: ContentDigest;
  /** Stable semantic geometry identity preserved when only representation fidelity changes. */
  readonly semanticDigest?: ContentDigest;
  readonly mediaType: 'model/gltf-binary' | 'image/svg+xml';
  readonly byteLength: number;
};

/** A retained scene asset whose bytes have already been materialised for the consumer. @public */
export type ResolvedSceneAsset = SceneAssetReference & {
  readonly geometry: SceneAssetGeometry;
};

/** A column-major 4×4 transform. @public */
export type SceneTransform = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Kernel-neutral presentation state retained with a scene revision. @public */
export type TauScenePresentation = {
  readonly background?: readonly [number, number, number, number];
  readonly fieldOfViewDegrees?: number;
};

/** Complete state for one node; deltas upsert whole nodes rather than patching fields. @public */
export type TauSceneNode = {
  readonly id: SceneNodeId;
  readonly name?: string;
  readonly parentId?: SceneNodeId;
  readonly childIds: readonly SceneNodeId[];
  readonly geometry?: SceneAssetReference;
  readonly transform: SceneTransform;
  readonly visible: boolean;
};

/** Canonical logical scene whose digest excludes timeline labels and sequence numbers. @public */
export type TauSceneManifest = {
  readonly schemaVersion: 1;
  readonly rootNodeIds: readonly SceneNodeId[];
  readonly nodes: Readonly<Record<string, TauSceneNode>>;
  readonly presentation: TauScenePresentation;
};

/** Independently reconstructible scene revision. @public */
export type ResolvedSceneSnapshot = {
  readonly manifest: TauSceneManifest;
  readonly assets: readonly ResolvedSceneAsset[];
};

/** Small, deterministic scene mutation vocabulary. @public */
export type TauSceneOperation =
  | { readonly type: 'upsert-node'; readonly node: TauSceneNode }
  | { readonly type: 'remove-node'; readonly nodeId: SceneNodeId }
  | { readonly type: 'clear-scene' }
  | { readonly type: 'set-presentation'; readonly presentation: TauScenePresentation };

/** Replacement of an existing asset by a higher-fidelity representation. @public */
export type SceneAssetReplacement = {
  readonly nodeId: SceneNodeId;
  readonly previous: ContentDigest;
  readonly replacement: ResolvedSceneAsset;
};

/** Durable timeline marker over a reconstructible scene revision. @public */
export type SceneBookmark = {
  readonly id: string;
  readonly label?: string;
  readonly source: 'explicit' | 'viewer-update' | 'viewer-operation';
  readonly sceneDigest: SceneDigest;
  readonly retained: true;
};

/** Ordered, render-scoped progressive scene event delivered to runtime consumers. @public */
export type ProgressiveSceneUpdate =
  | {
      readonly type: 'reset';
      readonly renderId: string;
      readonly sequence: number;
      readonly revision: number;
      readonly sceneDigest: SceneDigest;
      readonly snapshot: ResolvedSceneSnapshot;
      readonly skippedBefore: number;
    }
  | {
      readonly type: 'delta';
      readonly renderId: string;
      readonly sequence: number;
      readonly baseRevision: number;
      readonly revision: number;
      readonly baseSceneDigest: SceneDigest;
      readonly sceneDigest: SceneDigest;
      readonly operations: readonly TauSceneOperation[];
      readonly assets: readonly ResolvedSceneAsset[];
    }
  | {
      readonly type: 'refinement';
      readonly renderId: string;
      readonly sequence: number;
      readonly revision: number;
      readonly sceneDigest: SceneDigest;
      readonly replacements: readonly SceneAssetReplacement[];
    }
  | {
      readonly type: 'bookmark';
      readonly renderId: string;
      readonly sequence: number;
      readonly revision: number;
      readonly bookmark: SceneBookmark;
    };

/** Full-scene publication accepted from a kernel adapter. @public */
export type PublishSceneUpdateInput = {
  readonly geometry: SceneAssetGeometry;
  readonly label?: string;
  readonly presentation?: TauScenePresentation;
};

/** One independently addressable component supplied by a kernel scene adapter. @public */
export type PublishSceneComponentInput = {
  readonly id: string;
  readonly name?: string;
  readonly geometry: SceneAssetGeometry;
};

/** Higher-fidelity geometry for one unchanged semantic scene component. @public */
export type PublishSceneComponentRefinementInput = {
  readonly id: string;
  readonly geometry: SceneAssetGeometry;
};

/** Stable-component reset or delta supplied by a kernel scene adapter. @public */
export type PublishSceneGraphUpdateInput =
  | {
      readonly operation: 'reset';
      readonly baseSceneGeneration?: never;
      readonly sceneGeneration: number;
      readonly upserts: readonly PublishSceneComponentInput[];
      readonly removedComponentIds: readonly string[];
      readonly presentation?: TauScenePresentation;
    }
  | {
      readonly operation: 'delta';
      readonly baseSceneGeneration: number;
      readonly sceneGeneration: number;
      readonly upserts: readonly PublishSceneComponentInput[];
      readonly removedComponentIds: readonly string[];
      readonly presentation?: TauScenePresentation;
    }
  | {
      readonly operation: 'refinement';
      readonly sceneGeneration: number;
      readonly replacements: readonly PublishSceneComponentRefinementInput[];
    };

/** Result of attempting to publish one progressive scene revision. @public */
export type PublishSceneUpdateOutcome =
  | { readonly type: 'not-requested' }
  | {
      readonly type: 'published';
      readonly sequence: number;
      readonly revision: number;
      readonly sceneDigest: SceneDigest;
    };

/** Explicit timeline bookmark requested by a kernel adapter. @public */
export type PublishSceneBookmarkInput = {
  readonly label?: string;
  readonly source: SceneBookmark['source'];
};

/** Receipt for a retained bookmark. @public */
export type SceneBookmarkReceipt =
  | { readonly type: 'not-requested' }
  | { readonly type: 'published'; readonly bookmark: SceneBookmark };

/** Always-present progressive scene service exposed to executing kernels. @public */
export type KernelSceneRuntime = {
  readonly requested: boolean;
  publish(input: PublishSceneUpdateInput): Promise<PublishSceneUpdateOutcome>;
  publishUpdate(input: PublishSceneGraphUpdateInput): Promise<PublishSceneUpdateOutcome>;
  bookmark(input: PublishSceneBookmarkInput): Promise<SceneBookmarkReceipt>;
  flush(): Promise<void>;
};

/** Opaque lookup of one retained snapshot. @public */
export type ReadSceneSnapshotInput = {
  readonly bookmarkId: string;
};

/** Opaque lookup of retained bookmarks for one render. @public */
export type ListSceneBookmarksInput = {
  readonly renderId: string;
};

/** Consumer request for one retained scene snapshot. @public */
export type RuntimeReadSceneSnapshotInput = ReadSceneSnapshotInput & {
  readonly signal?: AbortSignal;
};

/** Consumer request for retained bookmarks from one render. @public */
export type RuntimeListSceneBookmarksInput = ListSceneBookmarksInput & {
  readonly signal?: AbortSignal;
};

/** Result of resolving an opaque retained scene snapshot. @public */
export type ReadSceneSnapshotResult =
  | { readonly type: 'found'; readonly snapshot: ResolvedSceneSnapshot }
  | { readonly type: 'missing' };
