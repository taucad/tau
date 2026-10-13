import { Scene } from 'three';
import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveSectionPieces } from '#graphics/section-cuts.js';
import type { SectionCut } from '#graphics/section-cuts.js';
import { createSectionViewSafeSnapshotStore } from '#graphics/three/utils/section-view-safe-snapshot.js';
import type { SectionCutSet } from '#graphics/three/utils/section-view-safe-snapshot.js';

const cutSetAt = (offset: number): SectionCutSet => {
  const cuts: SectionCut[] = [{ id: 'cut-a', kind: 'plane', plane: 'xy', offset, isFlipped: true }];
  return { cuts, pieces: resolveSectionPieces(cuts) };
};

const onCertify = (): void => undefined;

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
    useThree: () => ({ scene: new Scene(), invalidate: hoistedMocks.invalidate, size: { width: 1024, height: 768 } }),
  };
});

vi.mock('#graphics/three/three-graphics-backend-context.jsx', () => ({
  useThreeGraphicsBackend: () => 'webgl',
}));

vi.mock('#hooks/use-graphics.jsx', () => ({
  useGraphicsSelector: () => 'unit:main',
  useModelInteractionRef: () => hoistedMocks.modelInteractionRef,
  useModelInteractionSelector: () => hoistedMocks.getUnitState(),
}));

describe('SectionContourFills reactivity', () => {
  beforeEach(() => {
    hoistedMocks.invalidate.mockClear();
    hoistedMocks.setUnitState([]);
  });

  it('invalidates demand rendering when the active unit interaction changes while enabled', async () => {
    const { SectionContourFills } = await import('#graphics/three/react/section-contour-fill.jsx');
    const innerRef = { current: null };
    const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
    const cutSet = cutSetAt(0);

    const { rerender } = render(
      <SectionContourFills
        enabled
        innerRef={innerRef}
        cutSet={cutSet}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
        onCertify={onCertify}
      />,
    );

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(1);

    hoistedMocks.setUnitState(['component:a']);
    rerender(
      <SectionContourFills
        enabled
        innerRef={innerRef}
        cutSet={cutSet}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
        onCertify={onCertify}
      />,
    );

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate for active unit interaction changes while disabled', async () => {
    const { SectionContourFills } = await import('#graphics/three/react/section-contour-fill.jsx');
    const innerRef = { current: null };
    const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
    const cutSet = cutSetAt(0);

    const { rerender } = render(
      <SectionContourFills
        enabled={false}
        innerRef={innerRef}
        cutSet={cutSet}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
        onCertify={onCertify}
      />,
    );

    expect(hoistedMocks.invalidate).not.toHaveBeenCalled();

    hoistedMocks.setUnitState(['component:a']);
    rerender(
      <SectionContourFills
        enabled={false}
        innerRef={innerRef}
        cutSet={cutSet}
        snapshotRef={snapshotRef}
        stripeFrequency={2}
        stripeWidth={0.2}
        onCertify={onCertify}
      />,
    );

    expect(hoistedMocks.invalidate).not.toHaveBeenCalled();
  });

  it('invalidates demand rendering when re-enabled with unchanged inputs', async () => {
    const { SectionContourFills } = await import('#graphics/three/react/section-contour-fill.jsx');
    const innerRef = { current: null };
    const snapshotRef = { current: createSectionViewSafeSnapshotStore() };
    const cutSet = cutSetAt(0);
    const properties = {
      innerRef,
      cutSet,
      snapshotRef,
      stripeFrequency: 2,
      stripeWidth: 0.2,
      onCertify,
    };

    const { rerender } = render(<SectionContourFills enabled {...properties} />);
    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(1);

    rerender(<SectionContourFills enabled={false} {...properties} />);
    rerender(<SectionContourFills enabled {...properties} />);

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(2);
  });

  it('should invalidate demand rendering when a cut changes, and not when the same cut set renders again', async () => {
    const { SectionContourFills } = await import('#graphics/three/react/section-contour-fill.jsx');
    const properties = {
      innerRef: { current: null },
      snapshotRef: { current: createSectionViewSafeSnapshotStore() },
      stripeFrequency: 2,
      stripeWidth: 0.2,
      onCertify,
    };
    const cutSet = cutSetAt(0);

    const { rerender } = render(<SectionContourFills enabled cutSet={cutSet} {...properties} />);
    rerender(<SectionContourFills enabled cutSet={cutSet} {...properties} />);
    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(1);

    rerender(<SectionContourFills enabled cutSet={cutSetAt(0.25)} {...properties} />);
    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(2);
  });
});
