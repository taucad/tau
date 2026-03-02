/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Vector3 } from 'three';
import type { StageOptions } from '#react/stage.js';
import { defaultStageOptions } from '#react/stage.js';
import { useCameraFraming } from '#react/hooks/use-camera-framing.js';

// ── Controllable mocks ───────────────────────────────────────────────────────

/** Viewport size reported by `useThree()`. Mutate before render/rerender. */
const mockSize = { width: 800, height: 600 };

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ size: mockSize }),
}));

vi.mock('#react/stores/store-context.js', () => ({
  useViewerStore: (selector: (state: { fieldOfView: number }) => unknown) => selector({ fieldOfView: 50 }),
}));

/**
 * Spy returned by the mocked `useCameraReset`. When invoked, simulates the
 * real behaviour by committing the current geometry radius via `setSceneRadius`.
 */
const mockResetCamera = vi.fn();

/** Shape of the params that `useCameraFraming` forwards to `useCameraReset`. */
type CapturedResetParameters = {
  geometryRadius: number;
  geometryCenter: Vector3;
  setSceneRadius: (radius: number) => void;
  rotation: { side: number; vertical: number };
  perspective: {
    offsetRatio: number;
    zoomLevel: number;
    nearPlane: number;
    minimumFarPlane: number;
    farPlaneRadiusMultiplier: number;
  };
  cameraFovAngle: number;
};

/** Latest params forwarded to `useCameraReset` by the hook under test. */
let latestResetParameters: CapturedResetParameters;

vi.mock('#react/use-camera-reset.js', () => ({
  useCameraReset: vi.fn((parameters: CapturedResetParameters) => {
    latestResetParameters = parameters;
    mockResetCamera.mockImplementation(() => {
      latestResetParameters.setSceneRadius(latestResetParameters.geometryRadius);
    });
    return mockResetCamera;
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const origin = new Vector3(0, 0, 0);

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockResetCamera.mockClear();
  mockSize.width = 800;
  mockSize.height = 600;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useCameraFraming', () => {
  // ── Initial reset behavior ──────────────────────────────────────────────

  describe('initial reset behavior', () => {
    it('calls resetCamera on first render with geometryRadius > 0', () => {
      renderHook(() => useCameraFraming(10, origin));

      expect(mockResetCamera).toHaveBeenCalledTimes(1);
      // Initial reset uses configured angles (called with no arguments)
      expect(mockResetCamera).toHaveBeenCalledWith();
    });

    it('calls resetCamera when geometryRadius is 0 but does not mark initial reset done', () => {
      renderHook(() => useCameraFraming(0, origin));

      // Still called because sceneRadius starts as undefined (always significant)
      expect(mockResetCamera).toHaveBeenCalledTimes(1);
      expect(mockResetCamera).toHaveBeenCalledWith();
    });

    it('uses initial reset (configured angles) when transitioning from zero to positive radius', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 0 },
      });

      mockResetCamera.mockClear();

      rerender({ radius: 10 });

      expect(mockResetCamera).toHaveBeenCalled();
      // All calls should use the initial-reset pattern (no { enableConfiguredAngles: false })
      const hasSubsequentPattern = mockResetCamera.mock.calls.some(
        (call: unknown[]) =>
          (call[0] as { enableConfiguredAngles?: boolean } | undefined)?.enableConfiguredAngles === false,
      );
      expect(hasSubsequentPattern).toBe(false);
    });
  });

  // ── Significant geometry change detection ───────────────────────────────

  describe('significant geometry change detection', () => {
    it('triggers direction-preserving reset when radius changes by more than 10%', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 10 },
      });

      mockResetCamera.mockClear();

      rerender({ radius: 12 }); // 20% change

      expect(mockResetCamera).toHaveBeenCalledWith({ enableConfiguredAngles: false });
    });

    it('does not reset when radius changes by less than 10%', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 10 },
      });

      mockResetCamera.mockClear();

      rerender({ radius: 10.5 }); // 5% change

      expect(mockResetCamera).not.toHaveBeenCalled();
    });

    it('does not reset at the exact 10% boundary (strict > comparison)', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 10 },
      });

      mockResetCamera.mockClear();

      rerender({ radius: 11 }); // Exactly 10%

      expect(mockResetCamera).not.toHaveBeenCalled();
    });

    it('resets just above the 10% threshold', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 10 },
      });

      mockResetCamera.mockClear();

      rerender({ radius: 11.01 }); // 10.1% change

      expect(mockResetCamera).toHaveBeenCalledWith({ enableConfiguredAngles: false });
    });

    it('handles multiple successive significant changes', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 10 },
      });

      mockResetCamera.mockClear();

      rerender({ radius: 15 }); // 50% change from 10
      expect(mockResetCamera).toHaveBeenCalledTimes(1);

      mockResetCamera.mockClear();

      rerender({ radius: 20 }); // 33% change from 15
      expect(mockResetCamera).toHaveBeenCalledTimes(1);
      expect(mockResetCamera).toHaveBeenCalledWith({ enableConfiguredAngles: false });
    });
  });

  // ── Aspect ratio change detection ───────────────────────────────────────

  describe('aspect ratio change detection', () => {
    it('triggers reset when viewport aspect changes by more than 10%', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 10 },
      });

      mockResetCamera.mockClear();

      mockSize.width = 400; // 400/600 = 0.667 vs 800/600 = 1.333 → 50% change
      rerender({ radius: 10 });

      expect(mockResetCamera).toHaveBeenCalledWith({ enableConfiguredAngles: false });
    });

    it('does not reset for small aspect changes', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 10 },
      });

      mockResetCamera.mockClear();

      mockSize.width = 790; // 790/600 ≈ 1.317 vs 1.333 → ~1.2% change
      rerender({ radius: 10 });

      expect(mockResetCamera).not.toHaveBeenCalled();
    });

    it('ignores aspect changes before initial geometry reset is complete', () => {
      const { rerender } = renderHook(({ radius }) => useCameraFraming(radius, origin), {
        initialProps: { radius: 0 },
      });

      mockResetCamera.mockClear();

      mockSize.width = 400; // Significant aspect change
      rerender({ radius: 0 });

      // Aspect effect returns early when isInitialResetDoneRef is false or radius <= 0
      expect(mockResetCamera).not.toHaveBeenCalled();
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns the resetCamera function for manual use', () => {
      const { result } = renderHook(() => useCameraFraming(10, origin));

      expect(result.current).toBe(mockResetCamera);
    });

    it('uses defaultStageOptions when none provided', () => {
      renderHook(() => useCameraFraming(10, origin));

      expect(latestResetParameters.perspective.offsetRatio).toBe(defaultStageOptions.offsetRatio);
      expect(latestResetParameters.perspective.nearPlane).toBe(defaultStageOptions.nearPlane);
      expect(latestResetParameters.perspective.minimumFarPlane).toBe(defaultStageOptions.minimumFarPlane);
      expect(latestResetParameters.perspective.farPlaneRadiusMultiplier).toBe(
        defaultStageOptions.farPlaneRadiusMultiplier,
      );
      expect(latestResetParameters.perspective.zoomLevel).toBe(defaultStageOptions.zoomLevel);
      expect(latestResetParameters.rotation.side).toBe(defaultStageOptions.rotation.side);
      expect(latestResetParameters.rotation.vertical).toBe(defaultStageOptions.rotation.vertical);
    });

    it('merges custom StageOptions with defaults', () => {
      const customOptions: StageOptions = {
        zoomLevel: 2,
        rotation: { side: 0 },
      };

      renderHook(() => useCameraFraming(10, origin, customOptions));

      // Custom values applied
      expect(latestResetParameters.perspective.zoomLevel).toBe(2);
      expect(latestResetParameters.rotation.side).toBe(0);
      // Defaults preserved for unset fields
      expect(latestResetParameters.perspective.offsetRatio).toBe(defaultStageOptions.offsetRatio);
      expect(latestResetParameters.rotation.vertical).toBe(defaultStageOptions.rotation.vertical);
    });

    it('forwards cameraFovAngle from graphics context', () => {
      renderHook(() => useCameraFraming(10, origin));

      expect(latestResetParameters.cameraFovAngle).toBe(50);
    });

    it('forwards geometryCenter to useCameraReset', () => {
      const center = new Vector3(1, 2, 3);

      renderHook(() => useCameraFraming(10, center));

      expect(latestResetParameters.geometryCenter).toBe(center);
    });
  });
});
