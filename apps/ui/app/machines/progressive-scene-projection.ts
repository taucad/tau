import type {
  ProgressiveSceneUpdate,
  ResolvedSceneAsset,
  ResolvedSceneSnapshot,
  SceneNodeId,
  TauSceneManifest,
  TauSceneNode,
  TauSceneOperation,
} from '@taucad/runtime';
import { defaultSceneResidencyPolicy } from '#machines/scene-timeline.js';

type SceneDigest = Extract<ProgressiveSceneUpdate, { readonly type: 'reset' }>['sceneDigest'];

export type ProgressiveSceneFrame = {
  readonly renderId: string;
  readonly sequence: number;
  readonly revision: number;
  readonly sceneDigest: SceneDigest;
  readonly snapshot: ResolvedSceneSnapshot;
};

export type ProgressiveSceneProjection = {
  readonly renderId?: string;
  readonly frames: readonly ProgressiveSceneFrame[];
  readonly selectedSequence?: number;
  readonly status: 'idle' | 'ready' | 'recovering' | 'unavailable';
  readonly retainedBytes: number;
};

export type ProgressiveSceneProjectionLimits = {
  readonly maxFrames: number;
  readonly maxBytes: number;
};

export const defaultProgressiveSceneProjectionLimits: ProgressiveSceneProjectionLimits = {
  maxFrames: defaultSceneResidencyPolicy.maxMaterializedFrames,
  maxBytes: defaultSceneResidencyPolicy.maxBytes,
};

export const createProgressiveSceneProjection = (): ProgressiveSceneProjection => ({
  frames: [],
  status: 'idle',
  retainedBytes: 0,
});

const assetKey = (asset: ResolvedSceneAsset): string => asset.contentDigest;

const mergeAssets = (
  existing: readonly ResolvedSceneAsset[],
  additions: readonly ResolvedSceneAsset[],
): readonly ResolvedSceneAsset[] => {
  const assets = new Map(existing.map((asset) => [assetKey(asset), asset]));
  for (const asset of additions) {
    assets.set(assetKey(asset), asset);
  }
  return [...assets.values()];
};

const retainReferencedAssets = (
  manifest: TauSceneManifest,
  assets: readonly ResolvedSceneAsset[],
): readonly ResolvedSceneAsset[] => {
  const referenced = new Set(
    Object.values(manifest.nodes).flatMap((node) => (node.geometry ? [node.geometry.contentDigest] : [])),
  );
  return assets.filter((asset) => referenced.has(asset.contentDigest));
};

const removeNode = (
  nodes: Readonly<Record<string, TauSceneNode>>,
  nodeId: SceneNodeId,
): Readonly<Record<string, TauSceneNode>> => {
  const removedIds = new Set<string>();
  const visit = (id: string): void => {
    if (removedIds.has(id)) {
      return;
    }
    removedIds.add(id);
    for (const childId of nodes[id]?.childIds ?? []) {
      visit(childId);
    }
  };
  visit(nodeId);

  const nextNodes: Record<string, TauSceneNode> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (removedIds.has(id)) {
      continue;
    }
    const childIds = node.childIds.filter((childId) => !removedIds.has(childId));
    nextNodes[id] = childIds.length === node.childIds.length ? node : { ...node, childIds };
  }
  return nextNodes;
};

const applyOperation = (manifest: TauSceneManifest, operation: TauSceneOperation): TauSceneManifest => {
  switch (operation.type) {
    case 'upsert-node': {
      const wasRoot = manifest.rootNodeIds.includes(operation.node.id);
      const shouldBeRoot = operation.node.parentId === undefined;
      const rootNodeIds = shouldBeRoot
        ? wasRoot
          ? manifest.rootNodeIds
          : [...manifest.rootNodeIds, operation.node.id]
        : wasRoot
          ? manifest.rootNodeIds.filter((id) => id !== operation.node.id)
          : manifest.rootNodeIds;
      return {
        ...manifest,
        rootNodeIds,
        nodes: { ...manifest.nodes, [operation.node.id]: operation.node },
      };
    }
    case 'remove-node': {
      return {
        ...manifest,
        rootNodeIds: manifest.rootNodeIds.filter((id) => id !== operation.nodeId),
        nodes: removeNode(manifest.nodes, operation.nodeId),
      };
    }
    case 'clear-scene': {
      return { ...manifest, rootNodeIds: [], nodes: {} };
    }
    case 'set-presentation': {
      return { ...manifest, presentation: operation.presentation };
    }
  }
};

const applyDelta = (
  snapshot: ResolvedSceneSnapshot,
  update: Extract<ProgressiveSceneUpdate, { readonly type: 'delta' }>,
): ResolvedSceneSnapshot => {
  let { manifest } = snapshot;
  for (const operation of update.operations) {
    manifest = applyOperation(manifest, operation);
  }
  return {
    manifest,
    assets: retainReferencedAssets(manifest, mergeAssets(snapshot.assets, update.assets)),
  };
};

const applyRefinement = (
  snapshot: ResolvedSceneSnapshot,
  update: Extract<ProgressiveSceneUpdate, { readonly type: 'refinement' }>,
): ResolvedSceneSnapshot => {
  let { nodes } = snapshot.manifest;
  const additions: ResolvedSceneAsset[] = [];
  for (const replacement of update.replacements) {
    const node = nodes[replacement.nodeId];
    if (!node || node.geometry?.contentDigest !== replacement.previous) {
      continue;
    }
    const { contentDigest, mediaType, byteLength } = replacement.replacement;
    nodes = {
      ...nodes,
      [replacement.nodeId]: {
        ...node,
        geometry: {
          contentDigest,
          semanticDigest: node.geometry.semanticDigest ?? node.geometry.contentDigest,
          mediaType,
          byteLength,
        },
      },
    };
    additions.push(replacement.replacement);
  }
  return {
    manifest: nodes === snapshot.manifest.nodes ? snapshot.manifest : { ...snapshot.manifest, nodes },
    assets: retainReferencedAssets(
      nodes === snapshot.manifest.nodes ? snapshot.manifest : { ...snapshot.manifest, nodes },
      mergeAssets(snapshot.assets, additions),
    ),
  };
};

const projectionBytes = (frames: readonly ProgressiveSceneFrame[]): number => {
  const assets = new Map<string, ResolvedSceneAsset>();
  for (const frame of frames) {
    for (const asset of frame.snapshot.assets) {
      assets.set(assetKey(asset), asset);
    }
  }
  return [...assets.values()].reduce((total, asset) => total + asset.byteLength, 0);
};

const boundFrames = (
  frames: readonly ProgressiveSceneFrame[],
  limits: ProgressiveSceneProjectionLimits,
  protectedSequence?: number,
): Pick<ProgressiveSceneProjection, 'frames' | 'retainedBytes'> => {
  const bounded = frames.slice(-Math.max(1, limits.maxFrames));
  const protectedFrame = frames.find((frame) => frame.sequence === protectedSequence);
  if (protectedFrame && !bounded.some((frame) => frame.sequence === protectedSequence)) {
    bounded.unshift(protectedFrame);
  }
  let retainedBytes = projectionBytes(bounded);
  while (bounded.length > 0 && retainedBytes > limits.maxBytes) {
    const latestSequence = frames.at(-1)?.sequence;
    const removableIndex = bounded.findIndex(
      (frame) => frame.sequence !== protectedSequence && frame.sequence !== latestSequence,
    );
    if (removableIndex === -1) {
      break;
    }
    bounded.splice(removableIndex, 1);
    retainedBytes = projectionBytes(bounded);
  }
  return { frames: bounded, retainedBytes };
};

const appendFrame = (
  projection: ProgressiveSceneProjection,
  frame: ProgressiveSceneFrame,
  limits: ProgressiveSceneProjectionLimits,
): ProgressiveSceneProjection => {
  const previousLatestSequence = projection.frames.at(-1)?.sequence;
  const protectedSequence =
    projection.selectedSequence === previousLatestSequence ? undefined : projection.selectedSequence;
  const bounded = boundFrames([...projection.frames, frame], limits, protectedSequence);
  return {
    ...projection,
    ...bounded,
    renderId: frame.renderId,
    selectedSequence: frame.sequence,
    status: bounded.frames.length === 0 ? 'unavailable' : 'ready',
  };
};

export const applyProgressiveSceneUpdate = (
  projection: ProgressiveSceneProjection,
  update: ProgressiveSceneUpdate,
  limits: ProgressiveSceneProjectionLimits = defaultProgressiveSceneProjectionLimits,
): ProgressiveSceneProjection => {
  if (update.type === 'bookmark') {
    return projection;
  }

  if (
    projection.renderId === update.renderId &&
    projection.frames.some((frame) => frame.sequence === update.sequence)
  ) {
    return projection;
  }

  if (update.type === 'reset') {
    const sameRenderFrames = projection.renderId === update.renderId ? projection.frames : [];
    const latestSequence = sameRenderFrames.at(-1)?.sequence;
    if (latestSequence !== undefined && update.sequence < latestSequence) {
      return rehydrateProgressiveSceneFrame(
        projection,
        {
          renderId: update.renderId,
          sequence: update.sequence,
          revision: update.revision,
          sceneDigest: update.sceneDigest,
          snapshot: update.snapshot,
        },
        limits,
      );
    }
    return appendFrame(
      { ...projection, frames: sameRenderFrames },
      {
        renderId: update.renderId,
        sequence: update.sequence,
        revision: update.revision,
        sceneDigest: update.sceneDigest,
        snapshot: update.snapshot,
      },
      limits,
    );
  }

  const previous = projection.frames.at(-1);
  if (!previous || previous.renderId !== update.renderId) {
    return { ...projection, status: 'recovering' };
  }
  if (projection.status === 'recovering') {
    return projection;
  }

  if (update.type === 'delta') {
    if (update.baseRevision !== previous.revision || update.baseSceneDigest !== previous.sceneDigest) {
      return { ...projection, status: 'recovering' };
    }
    return appendFrame(
      projection,
      {
        renderId: update.renderId,
        sequence: update.sequence,
        revision: update.revision,
        sceneDigest: update.sceneDigest,
        snapshot: applyDelta(previous.snapshot, update),
      },
      limits,
    );
  }

  if (update.revision !== previous.revision || update.sceneDigest !== previous.sceneDigest) {
    return { ...projection, status: 'recovering' };
  }
  return appendFrame(
    projection,
    {
      renderId: update.renderId,
      sequence: update.sequence,
      revision: update.revision,
      sceneDigest: update.sceneDigest,
      snapshot: applyRefinement(previous.snapshot, update),
    },
    limits,
  );
};

export const selectProgressiveSceneFrame = (
  projection: ProgressiveSceneProjection,
  sequence: number | undefined = projection.selectedSequence,
): ProgressiveSceneFrame | undefined => projection.frames.find((frame) => frame.sequence === sequence);

export const selectProgressiveSceneSequence = (
  projection: ProgressiveSceneProjection,
  sequence: number,
  limits: ProgressiveSceneProjectionLimits = defaultProgressiveSceneProjectionLimits,
): ProgressiveSceneProjection => {
  const bounded = boundFrames(projection.frames, limits, sequence);
  return bounded.frames.some((frame) => frame.sequence === sequence)
    ? { ...projection, ...bounded, selectedSequence: sequence, status: 'ready' }
    : { ...projection, ...bounded, selectedSequence: sequence, status: 'unavailable' };
};

export const clearProgressiveSceneProjection = (): ProgressiveSceneProjection => createProgressiveSceneProjection();

export const rehydrateProgressiveSceneFrame = (
  projection: ProgressiveSceneProjection,
  frame: ProgressiveSceneFrame,
  limits: ProgressiveSceneProjectionLimits = defaultProgressiveSceneProjectionLimits,
): ProgressiveSceneProjection => {
  const frames = [...projection.frames.filter((candidate) => candidate.sequence !== frame.sequence), frame].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const bounded = boundFrames(frames, limits, frame.sequence);
  return {
    ...projection,
    ...bounded,
    selectedSequence: frame.sequence,
    status: bounded.frames.some((candidate) => candidate.sequence === frame.sequence) ? 'ready' : 'unavailable',
  };
};
