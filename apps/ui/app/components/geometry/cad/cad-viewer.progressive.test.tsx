import { useEffect } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResolvedSceneSnapshot, SceneNodeId } from '@taucad/runtime';
import type { Geometry } from '@taucad/types';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';

let providerMounts = 0;

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphicsSelector: (selector: (snapshot: { context: Record<string, unknown> }) => unknown) =>
    selector({
      context: {
        resolvedGraphicsBackend: 'webgl',
        webGpuAvailable: false,
        graphicsBackendPreference: 'webgl',
      },
    }),
}));

vi.mock('#components/geometry/graphics/three/three-context.js', () => ({
  ThreeProvider: ({ children }: { readonly children: React.ReactNode }) => {
    useEffect(() => {
      providerMounts += 1;
    }, []);
    return <div data-testid='three-provider'>{children}</div>;
  },
}));

vi.mock('#components/geometry/graphics/three/react/progressive-scene.js', () => ({
  ProgressiveScene: () => <div data-testid='progressive-scene' />,
}));

vi.mock('#components/geometry/graphics/three/react/gltf-mesh.js', () => ({
  GltfMesh: () => <div data-testid='final-scene' />,
}));

vi.mock('#components/geometry/cad/webgl-error-boundary.js', () => ({
  WebglErrorBoundary: ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
    <div>{children}</div>
  ),
}));

vi.mock('#components/geometry/cad/webgl-fallback.js', () => ({
  WebglErrorFallback: () => null,
}));

const transform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const snapshot = (visible: boolean): ResolvedSceneSnapshot => ({
  manifest: {
    schemaVersion: 1,
    rootNodeIds: ['root' as SceneNodeId],
    nodes: {
      root: { id: 'root' as SceneNodeId, childIds: [], transform, visible },
    },
    presentation: {},
  },
  assets: [],
});
const finalGeometry: Geometry = { format: 'gltf', hash: 'final', content: new Uint8Array([1]) };

describe('CadViewer progressive projection', () => {
  it('keeps the Three provider mounted across frames and final reconciliation', () => {
    providerMounts = 0;
    const { rerender } = render(<CadViewer progressiveSceneSnapshot={snapshot(true)} />);
    rerender(<CadViewer progressiveSceneSnapshot={snapshot(false)} />);
    rerender(<CadViewer geometry={finalGeometry} />);

    expect(providerMounts).toBe(1);
  });
});
