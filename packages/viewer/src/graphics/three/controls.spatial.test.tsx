import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderFrame } from '@taucad/spatial';
import { Controls } from '#graphics/three/controls.jsx';

const mocks = vi.hoisted(() => {
  const renderFrame: RenderFrame = {
    anchorFrameId: 'tau:root',
    originMeters: [10, 20, 30],
    metersPerRenderUnit: 0.001,
  };
  return {
    context: { isSectionViewActive: true, isMeasureActive: false, measurements: [] },
    renderFrame,
    handlesPicker: undefined as unknown,
    cubePicker: undefined as unknown,
    cubePickers: new Set<unknown>(),
    frames: [] as Array<{ callback: (state: unknown, delta: number) => void; priority: number | undefined }>,
  };
});

vi.mock('@react-three/fiber', () => ({
  // The canvas's controls adapter has not attached yet: the root holds no controls.
  useThree: (selector: (state: { controls: undefined }) => unknown) => selector({ controls: undefined }),
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

vi.mock('#graphics/three/controls/viewport-gizmo-cube.jsx', () => ({
  ViewportGizmoCube: ({ planePicker }: { readonly planePicker?: unknown }) => {
    mocks.cubePicker = planePicker;
    mocks.cubePickers.add(planePicker);
    return null;
  },
}));

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
    mocks.handlesPicker = undefined;
    mocks.cubePicker = undefined;
    mocks.cubePickers.clear();
    mocks.frames.length = 0;
  });

  /* The controls adapter creates the controls, presents the camera on them and steps them each frame; this component
   * only gives the adapter's controls their feel. */
  it('should step no controls from React and render nothing before the adapter attaches', () => {
    const view = renderControls();

    expect(mocks.frames).toEqual([]);
    expect(view.container.querySelector('primitive')).toBeNull();
  });

  it('should hand the section handles the view cube plane picker', async () => {
    renderControls(true);

    await waitFor(() => {
      expect(mocks.handlesPicker).toBeDefined();
    });
    expect(mocks.cubePicker).toBe(mocks.handlesPicker);
  });

  it('should keep one plane picker for the view cube across Section turning off and on', async () => {
    mocks.context.isSectionViewActive = false;
    const view = renderControls(true);
    await waitFor(() => {
      expect(mocks.cubePicker).toBeDefined();
    });
    expect(mocks.handlesPicker).toBeUndefined();

    // Section turns on: the handles pick from the picker the cube already draws, so the cube is not restarted.
    mocks.context.isSectionViewActive = true;
    // A new prop re-renders the memoised controls, as a graphics change does through its selector.
    view.rerender(<Controls enableGizmo enableDamping={false} enableZoom enablePan zoomSpeed={2} />);
    await waitFor(() => {
      expect(mocks.handlesPicker).toBe(mocks.cubePicker);
    });
    expect(mocks.cubePickers.size).toBe(1);
  });

  it('should give the section handles no plane picker without a view cube', () => {
    renderControls(false);

    expect(mocks.handlesPicker).toBeUndefined();
  });
});
