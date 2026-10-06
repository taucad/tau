import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { StrictMode } from 'react';
import { InfiniteGrid } from '#components/geometry/graphics/three/react/infinite-grid.js';

const mocks = vi.hoisted(() => ({
  state: undefined as unknown,
  cameraRig: undefined as unknown,
  material: undefined as THREE.Material | undefined,
}));

vi.mock('@react-three/fiber', () => ({ useThree: () => mocks.state }));
vi.mock('#hooks/use-graphics.js', () => ({ useCameraRig: () => mocks.cameraRig }));
vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));
vi.mock('#components/geometry/graphics/three/materials/infinite-grid-material.js', async () => {
  const { MeshBasicMaterial } = await import('three');
  return {
    infiniteGridMaterialForBackend: () => {
      const material = new MeshBasicMaterial();
      mocks.material = material;
      return { material, applyVisualOverrides: vi.fn() };
    },
  };
});
vi.mock('@react-three/drei', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  const { Mesh } = await import('three');
  return {
    Plane: forwardRef<THREE.Mesh, { material: THREE.Material }>(({ material }, ref) => {
      useImperativeHandle(ref, () => {
        mocks.material = material;
        return new Mesh(undefined, material);
      }, [material]);
      return null;
    }),
  };
});

describe('InfiniteGrid compile lifetime', () => {
  beforeEach(() => {
    mocks.material = undefined;
    mocks.cameraRig = {
      perspectiveCamera: new THREE.PerspectiveCamera(),
      orthographicCamera: new THREE.OrthographicCamera(),
    };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should defer disposal until both endpoints settle after rejection and unmount', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const error = new Error('endpoint compile failed');
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invalidate = vi.fn();
    const compileAsync = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    mocks.state = { gl: { compileAsync }, invalidate };
    const view = render(<InfiniteGrid axes='xyz' />);
    if (!mocks.material) {
      throw new Error('Grid material was not allocated');
    }
    const dispose = vi.spyOn(mocks.material, 'dispose');
    try {
      expect(compileAsync).toHaveBeenCalledTimes(2);
      invalidate.mockClear();
      first.reject(error);
      await act(async () => {
        await Promise.allSettled([first.promise]);
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      view.unmount();
      expect(dispose).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
      second.resolve();
      await vi.waitFor(() => {
        expect(dispose).toHaveBeenCalledOnce();
        expect(report).toHaveBeenCalledExactlyOnceWith('Infinite-grid pipeline warm-up failed', error);
      });
      expect(invalidate).not.toHaveBeenCalled();
    } finally {
      second.resolve();
      view.unmount();
      await Promise.allSettled([first.promise, second.promise]);
    }
  });

  it('should dispose once after StrictMode replay and same-turn unmount without a compiler', async () => {
    mocks.state = { gl: {}, invalidate: vi.fn() };
    const view = render(
      <StrictMode>
        <InfiniteGrid axes='xyz' />
      </StrictMode>,
    );
    if (!mocks.material) {
      throw new Error('Grid material was not allocated');
    }
    const dispose = vi.spyOn(mocks.material, 'dispose');
    try {
      expect(dispose).not.toHaveBeenCalled();
      view.unmount();
      await act(async () => {
        await Promise.resolve();
      });
      expect(dispose).toHaveBeenCalledOnce();
    } finally {
      view.unmount();
    }
  });

  it('should retain the memoized material across effect restarts while either batch is pending', async () => {
    const firstBatch = Promise.withResolvers<void>();
    const secondBatch = Promise.withResolvers<void>();
    const invalidate = vi.fn();
    const compileAsync = vi
      .fn()
      .mockReturnValueOnce(firstBatch.promise)
      .mockReturnValueOnce(firstBatch.promise)
      .mockReturnValueOnce(secondBatch.promise)
      .mockReturnValueOnce(secondBatch.promise);
    mocks.state = { gl: { compileAsync }, invalidate };
    const view = render(<InfiniteGrid axes='xyz' />);
    const { material } = mocks;
    if (!material) {
      throw new Error('Grid material was not allocated');
    }
    const dispose = vi.spyOn(material, 'dispose');
    try {
      mocks.cameraRig = {
        perspectiveCamera: new THREE.PerspectiveCamera(),
        orthographicCamera: new THREE.OrthographicCamera(),
      };
      view.rerender(<InfiniteGrid axes='xyz' />);
      expect(mocks.material).toBe(material);
      expect(compileAsync).toHaveBeenCalledTimes(4);
      expect(dispose).not.toHaveBeenCalled();
      firstBatch.resolve();
      await act(async () => {
        await firstBatch.promise;
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      });
      expect(dispose).not.toHaveBeenCalled();
      view.unmount();
      expect(dispose).not.toHaveBeenCalled();
      secondBatch.resolve();
      await vi.waitFor(() => {
        expect(dispose).toHaveBeenCalledOnce();
      });
    } finally {
      firstBatch.resolve();
      secondBatch.resolve();
      view.unmount();
      await Promise.allSettled([firstBatch.promise, secondBatch.promise]);
    }
  });
});
