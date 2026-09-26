import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderFrame } from '@taucad/spatial';
import { Controls } from '#components/geometry/graphics/three/controls.js';
import type * as TauCameraControlsModule from '#components/geometry/graphics/three/controls/tau-camera-controls.js';

const mocks = vi.hoisted(() => {
  const renderFrame: RenderFrame = {
    anchorFrameId: 'tau:root',
    originMeters: [10, 20, 30],
    metersPerRenderUnit: 0.001,
  };
  return {
    context: { isSectionViewActive: true },
    renderFrame,
    cameraControlProperties: undefined as Record<string, unknown> | undefined,
    handlesPicker: undefined as unknown,
    cubePicker: undefined as unknown,
  };
});

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => ({ actorRef: { getSnapshot: () => ({ context: { view: { target: [0, 0, 0] } } }) } }),
  useCameraSelector: () => 'perspective',
  useGraphicsSelector: (selector: (state: { context: typeof mocks.context }) => unknown) =>
    selector({ context: mocks.context }),
  useRenderFrame: () => mocks.renderFrame,
}));

vi.mock('#components/geometry/graphics/three/controls/tau-camera-controls.js', async (importOriginal) => ({
  ...(await importOriginal<typeof TauCameraControlsModule>()),
  TauCameraControls: (properties: Record<string, unknown>) => {
    mocks.cameraControlProperties = properties;
    return null;
  },
}));

vi.mock('#components/geometry/graphics/three/controls/viewport-gizmo-cube.js', async () => {
  const { useContext } = await import('react');
  const { SectionPlanePickerContext } =
    await import('#components/geometry/graphics/three/controls/viewport-gizmo-render-loop.js');
  return {
    ViewportGizmoCube: () => {
      mocks.cubePicker = useContext(SectionPlanePickerContext);
      return null;
    },
  };
});

vi.mock('#components/geometry/graphics/three/react/measure-tool.js', () => ({
  MeasureTool: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/section-handles.js', () => ({
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
  });

  /* `initialTarget` is a render-unit API that camera-controls writes into the live camera in its own
   * state initializer, two frames before `ActorBridge` exists. Handing it metres pointed the camera
   * at a target 1000x away for those frames, which is what a restored view was caught showing. */
  it('should hand the camera controls their initial target in render units', () => {
    renderControls();

    expect(mocks.cameraControlProperties?.['initialTarget']).toEqual([-10_000, -20_000, -30_000]);
  });

  it('should hand the section handles the view cube plane picker', () => {
    renderControls(true);

    expect(mocks.handlesPicker).toBeDefined();
    expect(mocks.cubePicker).toBe(mocks.handlesPicker);
  });

  it('should draw the plane picker beside the view cube only while Section is on', () => {
    mocks.context.isSectionViewActive = false;
    renderControls(true);

    expect(mocks.handlesPicker).toBeDefined();
    expect(mocks.cubePicker).toBeUndefined();
  });

  it('should give the section handles no plane picker without a view cube', () => {
    renderControls(false);

    expect(mocks.handlesPicker).toBeUndefined();
  });
});
