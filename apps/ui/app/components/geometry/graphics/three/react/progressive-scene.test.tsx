import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedSceneAsset, ResolvedSceneSnapshot, SceneNodeId } from '@taucad/runtime';
import { ProgressiveScene } from '#components/geometry/graphics/three/react/progressive-scene.js';

const mounts = new Map<string, number>();

vi.mock('#components/geometry/graphics/three/react/gltf-mesh.js', () => ({
  GltfMesh: ({ geometryHash }: { geometryHash: string }) => {
    useEffect(() => {
      mounts.set(geometryHash, (mounts.get(geometryHash) ?? 0) + 1);
    }, [geometryHash]);
    return <span data-testid={`mesh-${geometryHash}`} />;
  },
}));

const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const nodeId = (id: string): SceneNodeId => id as SceneNodeId;
const asset = (id: string): ResolvedSceneAsset => ({
  contentDigest: id as ResolvedSceneAsset['contentDigest'],
  mediaType: 'model/gltf-binary',
  byteLength: 1,
  geometry: { format: 'gltf', content: new Uint8Array([1]) },
});
const snapshot = (visible: boolean): ResolvedSceneSnapshot => {
  const unchanged = asset('unchanged-asset');
  const changed = asset('changed-asset');
  return {
    manifest: {
      schemaVersion: 1,
      rootNodeIds: [nodeId('unchanged'), nodeId('changed')],
      nodes: {
        unchanged: { id: nodeId('unchanged'), childIds: [], transform, visible: true, geometry: unchanged },
        changed: { id: nodeId('changed'), childIds: [], transform, visible, geometry: changed },
      },
      presentation: {},
    },
    assets: [unchanged, changed],
  };
};

describe('ProgressiveScene', () => {
  it('keeps SceneNodeId children mounted while a sibling changes', () => {
    mounts.clear();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = render(
      <ProgressiveScene snapshot={snapshot(true)} enableMatcap={false} enableSurfaces enableLines />,
    );
    rerender(<ProgressiveScene snapshot={snapshot(false)} enableMatcap={false} enableSurfaces enableLines />);

    expect(mounts.get('unchanged')).toBe(1);
    expect(mounts.get('changed')).toBe(1);
    consoleError.mockRestore();
  });
});
