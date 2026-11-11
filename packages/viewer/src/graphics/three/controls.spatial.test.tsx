import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderFrame } from '@taucad/spatial';
import { Controls } from '#graphics/three/controls.jsx';
import type * as TauCameraControlsModule from '#graphics/three/controls/tau-camera-controls.jsx';

const mocks = vi.hoisted(() => {
  const renderFrame: RenderFrame = {
    anchorFrameId: 'tau:root',
    originMeters: [10, 20, 30],
    metersPerRenderUnit: 0.001,
  };
  return {
    context: { isSectionViewActive: true, isMeasureActive: false, measurements: [] },
    renderFrame,
    cameraControlProperties: undefined as Record<string, unknown> | undefined,
    handlesPicker: undefined as unknown,
    cubePicker: undefined as unknown,
    frames: [] as Array<{ callback: (state: unknown, delta: number) => void; priority: number | undefined }>,
  };
});

vi.mock('@react-three/fiber', () => ({
  // The canvas's controls adapter has not attached yet: the root holds no controls.
  useThree: (selector: (state: { controls: null }) => unknown) => selector({ controls: null }),
  useFrame: (callback: (state: unknown, delta: number) => void, priority?: number) => {
    mocks.frames.push({ callback, priority });
  },
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useCameraRig: () => ({ actorRef: { getSnapshot: () => ({ context: { view: { target: [0, 0, 0] } } }) } }),
  useCameraSelector: () => 'perspective',
  useGraphicsSelector: (selector: (state: { context: typeof mocks.context }) => unknown) =>
    selector({ context: mocks.context }),
  useRenderFrame: () => mocks.renderFrame,
}));

vi.mock('#graphics/three/controls/tau-camera-controls.jsx', async (importOriginal) => ({
  ...(await importOriginal<typeof TauCameraControlsModule>()),
  TauCameraControls: (properties: Record<string, unknown>) => {
    mocks.cameraControlProperties = properties;
    return null;
  },
}));

vi.mock('#graphics/three/controls/viewport-gizmo-cube.jsx', async () => {
  const { useContext } = await import('react');
  const { SectionPlanePickerContext } = await import('#graphics/three/controls/viewport-gizmo-render-loop.jsx');
  return {
    ViewportGizmoCube: () => {
      mocks.cubePicker = useContext(SectionPlanePickerContext);
      return null;
    },
  };
});

vi.mock('#graphics/three/react/measure-tool.jsx', () => ({
  MeasureTool: () => null,
}));

vi.mock('#graphics/three/react/section-handles.jsx', () => ({
  SectionHandles: ({ planePicker }: { readonly planePicker?: unknown }) => {
    mocks.handlesPicker = planePicker;
    return null;
  },
}));

const renderControls = (enableGizmo = false): ReturnType<typeof render> =>
  render(<Controls enableGizmo={enableGizmo} enableDamping={false} enableZoom enablePan zoomSpeed={1} />);

describe('Controls', () => {
  beforeEach(() => {
    mocks.context.isSectionViewActive = true;
    mocks.cameraControlProperties = undefined;
    mocks.handlesPicker = undefined;
    mocks.cubePicker = undefined;
    mocks.frames.length = 0;
  });

  /* The controls adapter creates the controls and presents the camera on them before anything listens, so there is no
   * initial target to hand them; this component only gives the adapter's controls their feel and their frame update. */
  it('should update the controls before the scene draws and render nothing before the adapter attaches', () => {
    const view = renderControls();

    expect(mocks.frames.map(({ priority }) => priority)).toContain(-1);
    expect(() => {
      for (const { callback } of mocks.frames) {
        callback({}, 1 / 60);
      }
    }).not.toThrow();
    expect(view.container.querySelector('primitive')).toBeNull();
  });

  it('should hand the section handles the view cube plane picker', async () => {
    renderControls(true);

    await waitFor(() => {
      expect(mocks.handlesPicker).toBeDefined();
    });
    expect(mocks.cubePicker).toBe(mocks.handlesPicker);
  });

  it('should draw the plane picker beside the view cube only while Section is on', () => {
    mocks.context.isSectionViewActive = false;
    renderControls(true);

    expect(mocks.handlesPicker).toBeUndefined();
    expect(mocks.cubePicker).toBeUndefined();
  });

  it('should give the section handles no plane picker without a view cube', () => {
    renderControls(false);

    expect(mocks.handlesPicker).toBeUndefined();
  });
});
