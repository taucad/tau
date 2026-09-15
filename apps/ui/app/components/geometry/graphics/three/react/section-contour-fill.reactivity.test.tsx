import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createSectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

const hoistedMocks = vi.hoisted(() => {
  let unitState = { selectedComponentIds: [] as readonly string[] };
  const invalidate = vi.fn();
  const modelInteractionRef = {
    getSnapshot: vi.fn(() => ({ context: {} })),
  };

  return {
    getUnitState: () => unitState,
    invalidate,
    modelInteractionRef,
    setUnitState: (selectedComponentIds: readonly string[]) => {
      unitState = { selectedComponentIds };
    },
  };
});

vi.mock('@react-three/fiber', async (importOriginal) => {
  const fiberFacadeUnknown: unknown = await importOriginal();
  const fiberFacade =
    fiberFacadeUnknown !== null && typeof fiberFacadeUnknown === 'object'
      ? (fiberFacadeUnknown as Record<string, unknown>)
      : {};

  return {
    ...fiberFacade,
    useFrame: vi.fn(),
    useThree: () => ({ invalidate: hoistedMocks.invalidate, size: { width: 1024, height: 768 } }),
  };
});

vi.mock('#components/geometry/graphics/three/three-graphics-backend-context.js', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphicsSelector: () => 'unit:main',
  useModelInteractionRef: () => hoistedMocks.modelInteractionRef,
  useModelInteractionSelector: () => hoistedMocks.getUnitState(),
}));

vi.mock('#hooks/use-theme.js', () => ({
  Theme: Object.fromEntries([
    ['DARK', 'dark'],
    ['LIGHT', 'light'],
  ]),
  useTheme: () => ({ theme: 'light' }),
}));

describe('SectionContourFills reactivity', () => {
  beforeEach(() => {
    hoistedMocks.invalidate.mockClear();
    hoistedMocks.setUnitState([]);
  });

  it('invalidates demand rendering when the active unit interaction changes while enabled', async () => {
    const { SectionContourFills } = await import('#components/geometry/graphics/three/react/section-contour-fill.js');
    const { Plane, Vector3 } = await import('three');
    const innerRef = { current: null };
    const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
    const plane = new Plane(new Vector3(0, 0, 1), 0);

    const { rerender } = render(
      <SectionContourFills
        enabled
        innerRef={innerRef}
        plane={plane}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
      />,
    );

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(1);

    hoistedMocks.setUnitState(['component:a']);
    rerender(
      <SectionContourFills
        enabled
        innerRef={innerRef}
        plane={plane}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
      />,
    );

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate for active unit interaction changes while disabled', async () => {
    const { SectionContourFills } = await import('#components/geometry/graphics/three/react/section-contour-fill.js');
    const { Plane, Vector3 } = await import('three');
    const innerRef = { current: null };
    const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
    const plane = new Plane(new Vector3(0, 0, 1), 0);

    const { rerender } = render(
      <SectionContourFills
        enabled={false}
        innerRef={innerRef}
        plane={plane}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
      />,
    );

    expect(hoistedMocks.invalidate).not.toHaveBeenCalled();

    hoistedMocks.setUnitState(['component:a']);
    rerender(
      <SectionContourFills
        enabled={false}
        innerRef={innerRef}
        plane={plane}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
      />,
    );

    expect(hoistedMocks.invalidate).not.toHaveBeenCalled();
  });

  it('invalidates demand rendering when re-enabled with unchanged inputs', async () => {
    const { SectionContourFills } = await import('#components/geometry/graphics/three/react/section-contour-fill.js');
    const { Plane, Vector3 } = await import('three');
    const innerRef = { current: null };
    const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
    const plane = new Plane(new Vector3(0, 0, 1), 0);
    const properties = {
      innerRef,
      plane,
      snapshotRef,
      stripeFrequency: 2,
      stripeWidth: 0.2,
    };

    const { rerender } = render(<SectionContourFills enabled {...properties} />);
    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(1);

    rerender(<SectionContourFills enabled={false} {...properties} />);
    rerender(<SectionContourFills enabled {...properties} />);

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(2);
  });
});
