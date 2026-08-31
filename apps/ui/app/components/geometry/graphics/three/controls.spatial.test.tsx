import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderFrame } from '@taucad/spatial';
import { Controls } from '#components/geometry/graphics/three/controls.js';

type MockGraphicsContext = {
  isSectionViewActive: boolean;
  selectedSectionViewId: 'xy';
  sectionViewRotation: [number, number, number];
  sectionViewPivot: [number, number, number];
  availableSectionViews: Array<{ id: 'xy'; normal: [number, number, number]; constant: number }>;
  planeName: 'face';
  hoveredSectionViewId: undefined;
  upDirection: 'z';
};

const mocks = vi.hoisted(() => {
  const context: MockGraphicsContext = {
    isSectionViewActive: true,
    selectedSectionViewId: 'xy',
    sectionViewRotation: [0, 0, 0],
    sectionViewPivot: [10.016, 20, 30],
    availableSectionViews: [{ id: 'xy', normal: [0, 0, 1], constant: 0 }],
    planeName: 'face',
    hoveredSectionViewId: undefined,
    upDirection: 'z',
  };
  const renderFrame: RenderFrame = {
    anchorFrameId: 'tau:root',
    originMeters: [10, 20, 30],
    metersPerRenderUnit: 0.001,
  };
  return {
    context,
    renderFrame,
    send: vi.fn(),
    sectionProperties: undefined as Record<string, unknown> | undefined,
  };
});

vi.mock('#hooks/use-graphics.js', () => ({
  useCameraRig: () => ({ actorRef: { getSnapshot: () => ({ context: { view: { target: [0, 0, 0] } } }) } }),
  useCameraSelector: () => ({ kind: 'perspective' }),
  useGraphics: () => ({ send: mocks.send }),
  useGraphicsSelector: (selector: (state: { context: typeof mocks.context }) => unknown) =>
    selector({ context: mocks.context }),
  useRenderFrame: () => mocks.renderFrame,
}));

vi.mock('#components/geometry/graphics/three/controls/tau-camera-controls.js', () => ({
  TauCameraControls: () => null,
}));

vi.mock('#components/geometry/graphics/three/controls/viewport-gizmo-cube.js', () => ({
  ViewportGizmoCube: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/measure-tool.js', () => ({
  MeasureTool: () => null,
}));

vi.mock('#components/geometry/graphics/three/react/section-view-controls.js', () => ({
  SectionViewControls: (properties: Record<string, unknown>) => {
    mocks.sectionProperties = properties;
    return null;
  },
}));

const renderControls = (): ReturnType<typeof render> =>
  render(<Controls enableGizmo={false} enableDamping={false} enableZoom enablePan zoomSpeed={1} />);

const getSectionProperty = <T,>(key: string): T => {
  const value = mocks.sectionProperties?.[key];
  if (value === undefined) {
    throw new Error(`SectionViewControls property '${key}' was not captured.`);
  }
  return value as T;
};

describe('Controls spatial section boundary', () => {
  beforeEach(() => {
    mocks.send.mockReset();
    mocks.sectionProperties = undefined;
    mocks.context.sectionViewPivot = [10.016, 20, 30];
    mocks.renderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [10, 20, 30],
      metersPerRenderUnit: 0.001,
    };
  });

  it('maps the physical section pivot into render-local coordinates and inverts drag output', () => {
    renderControls();

    const renderPivot = getSectionProperty<[number, number, number]>('renderPivot');
    expect(renderPivot[0]).toBeCloseTo(16, 12);
    expect(renderPivot.slice(1)).toEqual([0, 0]);

    act(() => {
      getSectionProperty<(value: [number, number, number]) => void>('onSetRenderPivot')([17, 0, 0]);
    });

    const pivotEvent = mocks.send.mock.calls.at(-1)?.[0] as unknown as {
      readonly type: string;
      readonly payload: [number, number, number];
    };
    expect(pivotEvent.type).toBe('setSectionViewPivot');
    expect(pivotEvent.payload[0]).toBeCloseTo(10.017, 12);
    expect(pivotEvent.payload.slice(1)).toEqual([20, 30]);
  });

  it('retargets native placement when the RenderFrame changes without changing physical state', () => {
    const view = renderControls();
    expect(getSectionProperty<[number, number, number]>('renderPivot')[0]).toBeCloseTo(16, 12);

    mocks.renderFrame = {
      anchorFrameId: 'tau:root',
      originMeters: [10.01, 20, 30],
      metersPerRenderUnit: 0.000_001,
    };
    view.rerender(<Controls enableGizmo={false} enableDamping={false} enableZoom enablePan zoomSpeed={2} />);

    expect(mocks.context.sectionViewPivot).toEqual([10.016, 20, 30]);
    const retargetedPivot = getSectionProperty<[number, number, number]>('renderPivot');
    expect(retargetedPivot[0]).toBeCloseTo(6000, 8);
    expect(retargetedPivot.slice(1)).toEqual([0, 0]);
  });
});
