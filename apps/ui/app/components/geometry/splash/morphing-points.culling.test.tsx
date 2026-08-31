import { act } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createRoot, extend, useThree } from '@react-three/fiber';
import type { RootState } from '@react-three/fiber';
import { ThreeGraphicsBackendProvider } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import { MorphingPoints } from '#components/geometry/splash/morphing-points.js';
import { SplitMorphingPoints } from '#components/geometry/splash/split-morphing-points.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';

const sampledPoints = (offset: number): SampledPoints => ({
  normals: new Float32Array(12),
  positions: new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0, offset, 0, 1]),
  randomOffsets: new Float32Array(4),
});

const mount = async (
  content: React.ReactNode,
  backend: 'webgl' | 'webgpu',
): Promise<{ meshes: THREE.Mesh[]; unmount: () => void }> => {
  const canvas = document.createElement('canvas');
  const root = createRoot(canvas);
  let state: RootState | undefined;
  const Capture = () => {
    state = useThree();
    return null;
  };
  const renderer = {
    dispose: vi.fn(),
    domElement: canvas,
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
  } as unknown as THREE.WebGLRenderer;

  await act(async () => {
    await root.configure({ gl: renderer, size: { height: 600, left: 0, top: 0, width: 800 } });
    root.render(
      <ThreeGraphicsBackendProvider value={backend}>
        <Capture />
        {content}
      </ThreeGraphicsBackendProvider>,
    );
  });

  const meshes: THREE.Mesh[] = [];
  state?.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      meshes.push(object as unknown as THREE.Mesh);
    }
  });
  return {
    meshes,
    unmount: () => {
      act(() => {
        root.unmount();
      });
    },
  };
};

describe('shader-displaced splash point culling', () => {
  beforeAll(() => {
    extend(THREE as unknown as Parameters<typeof extend>[0]);
  });

  it.each(['webgl', 'webgpu'] as const)(
    'keeps the morph cloud renderable outside source-only geometry bounds on %s',
    async (backend) => {
      const mounted = await mount(
        <MorphingPoints sourcePoints={sampledPoints(0)} targetPoints={sampledPoints(1000)} targetProgress={1} />,
        backend,
      );

      expect(mounted.meshes).toHaveLength(1);
      expect(mounted.meshes[0]!.frustumCulled).toBe(false);
      mounted.unmount();
    },
  );

  it.each(['webgl', 'webgpu'] as const)(
    'keeps both split morph clouds renderable outside source-only geometry bounds on %s',
    async (backend) => {
      const mounted = await mount(
        <SplitMorphingPoints
          sourcePoints={sampledPoints(0)}
          targetPointsA={sampledPoints(1000)}
          targetPointsB={sampledPoints(-1000)}
          targetProgress={1}
        />,
        backend,
      );

      expect(mounted.meshes).toHaveLength(2);
      expect(mounted.meshes.every(({ frustumCulled }) => !frustumCulled)).toBe(true);
      mounted.unmount();
    },
  );
});
