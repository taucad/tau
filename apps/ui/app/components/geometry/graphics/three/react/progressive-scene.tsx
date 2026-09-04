import { memo, useMemo } from 'react';
import { Matrix4 } from 'three';
import type { ResolvedSceneAsset, ResolvedSceneSnapshot, SceneNodeId, TauSceneNode } from '@taucad/runtime';
import { GltfMesh } from '#components/geometry/graphics/three/react/gltf-mesh.js';
import type { ModelComponentSecondaryPointerTarget } from '#components/geometry/graphics/three/react/gltf-mesh.js';

type ProgressiveSceneProperties = {
  readonly snapshot: ResolvedSceneSnapshot;
  readonly enableMatcap: boolean;
  readonly enableSurfaces: boolean;
  readonly enableLines: boolean;
  readonly onModelComponentSecondaryPointerCandidate?: (
    target: ModelComponentSecondaryPointerTarget | undefined,
  ) => void;
};

type ProgressiveSceneNodeProperties = Omit<ProgressiveSceneProperties, 'snapshot'> & {
  readonly node: TauSceneNode;
  readonly nodes: Readonly<Record<string, TauSceneNode>>;
  readonly assetsByDigest: ReadonlyMap<string, ResolvedSceneAsset>;
};

const ProgressiveSceneNode = memo(
  ({
    node,
    nodes,
    assetsByDigest,
    enableMatcap,
    enableSurfaces,
    enableLines,
    onModelComponentSecondaryPointerCandidate,
  }: ProgressiveSceneNodeProperties): React.JSX.Element => {
    const matrix = useMemo(() => new Matrix4().fromArray(node.transform), [node.transform]);
    const asset = node.geometry ? assetsByDigest.get(node.geometry.contentDigest) : undefined;

    return (
      <group matrix={matrix} matrixAutoUpdate={false} visible={node.visible} name={node.name}>
        {asset?.geometry.format === 'gltf' ? (
          <GltfMesh
            gltfFile={asset.geometry.content}
            geometryHash={node.id}
            enableMatcap={enableMatcap}
            enableSurfaces={enableSurfaces}
            enableLines={enableLines}
            onModelComponentSecondaryPointerCandidate={onModelComponentSecondaryPointerCandidate}
          />
        ) : null}
        {node.childIds.map((childId: SceneNodeId) => {
          const child = nodes[childId];
          return child ? (
            <ProgressiveSceneNode
              key={child.id}
              node={child}
              nodes={nodes}
              assetsByDigest={assetsByDigest}
              enableMatcap={enableMatcap}
              enableSurfaces={enableSurfaces}
              enableLines={enableLines}
              onModelComponentSecondaryPointerCandidate={onModelComponentSecondaryPointerCandidate}
            />
          ) : null;
        })}
      </group>
    );
  },
);

export const ProgressiveScene = memo(
  ({
    snapshot,
    enableMatcap,
    enableSurfaces,
    enableLines,
    onModelComponentSecondaryPointerCandidate,
  }: ProgressiveSceneProperties): React.JSX.Element => {
    const assetsByDigest = useMemo(
      () => new Map(snapshot.assets.map((asset) => [asset.contentDigest, asset])),
      [snapshot.assets],
    );

    return (
      <group name='progressive-scene'>
        {snapshot.manifest.rootNodeIds.map((rootId) => {
          const node = snapshot.manifest.nodes[rootId];
          return node ? (
            <ProgressiveSceneNode
              key={node.id}
              node={node}
              nodes={snapshot.manifest.nodes}
              assetsByDigest={assetsByDigest}
              enableMatcap={enableMatcap}
              enableSurfaces={enableSurfaces}
              enableLines={enableLines}
              onModelComponentSecondaryPointerCandidate={onModelComponentSecondaryPointerCandidate}
            />
          ) : null;
        })}
      </group>
    );
  },
);
