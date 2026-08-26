import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const hoistedMocks = vi.hoisted(() => {
  let revision = 0;
  const invalidate = vi.fn();
  const modelInteractionRef = {
    getSnapshot: vi.fn(() => ({ context: {} })),
  };

  return {
    getRevision: () => revision,
    invalidate,
    modelInteractionRef,
    setRevision: (nextRevision: number) => {
      revision = nextRevision;
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
  useModelInteractionRef: () => hoistedMocks.modelInteractionRef,
  useModelInteractionSelector: () => hoistedMocks.getRevision(),
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
    hoistedMocks.setRevision(0);
  });

  it('invalidates demand rendering when model interaction revision changes while enabled', async () => {
    const { SectionContourFills } = await import('#components/geometry/graphics/three/react/section-contour-fill.js');
    const { Plane, Vector3 } = await import('three');
    const innerRef = { current: null };
    const plane = new Plane(new Vector3(0, 0, 1), 0);

    const { rerender } = render(
      <SectionContourFills enabled innerRef={innerRef} plane={plane} stripeFrequency={2} stripeWidth={0.2} />,
    );

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(1);

    hoistedMocks.setRevision(1);
    rerender(<SectionContourFills enabled innerRef={innerRef} plane={plane} stripeFrequency={2} stripeWidth={0.2} />);

    expect(hoistedMocks.invalidate).toHaveBeenCalledTimes(2);
  });

  it('does not invalidate for model interaction revision changes while disabled', async () => {
    const { SectionContourFills } = await import('#components/geometry/graphics/three/react/section-contour-fill.js');
    const { Plane, Vector3 } = await import('three');
    const innerRef = { current: null };
    const plane = new Plane(new Vector3(0, 0, 1), 0);

    const { rerender } = render(
      <SectionContourFills enabled={false} innerRef={innerRef} plane={plane} stripeFrequency={2} stripeWidth={0.2} />,
    );

    expect(hoistedMocks.invalidate).not.toHaveBeenCalled();

    hoistedMocks.setRevision(1);
    rerender(
      <SectionContourFills enabled={false} innerRef={innerRef} plane={plane} stripeFrequency={2} stripeWidth={0.2} />,
    );

    expect(hoistedMocks.invalidate).not.toHaveBeenCalled();
  });
});
