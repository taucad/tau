import { describe, expect, it, vi } from 'vitest';
import { Children, isValidElement, useDeferredValue } from 'react';
import { Theme } from 'remix-themes';

const mockUseTheme = vi.fn(() => ({ theme: Theme.LIGHT }));

vi.mock('react', async (importOriginal) => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-imports -- vi.mock importOriginal requires inline typeof import()
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useDeferredValue: vi.fn(actual.useDeferredValue),
  };
});

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({
    camera: {},
    scene: { userData: {}, environmentRotation: { set: vi.fn() } },
  }),
  useFrame: vi.fn(),
}));

vi.mock('@react-three/drei', () => ({
  Environment: ({ children }: { readonly children: React.ReactNode }) => <group>{children}</group>,
  Lightformer: () => <mesh />,
}));

vi.mock('#hooks/use-theme.js', () => ({
  Theme,
  useTheme: () => mockUseTheme(),
}));

vi.mock('#components/geometry/graphics/three/utils/lights.utils.js', () => ({
  applyLightingForCamera: vi.fn(),
  ambientBaseIntensity: 0.5,
  headlampBaseIntensity: 0.3,
  environmentBaseIntensity: 1,
  defaultHeadlampConfig: {},
  lightingUserDataKeys: { config: 'lightConfig', ambient: 'ambient', headlamp: 'headlamp' },
  darkModeIntensityScale: 0.5,
  darkModeAmbientBoost: 1.15,
}));

type TestElementProperties = {
  readonly args?: unknown;
  readonly children?: React.ReactNode;
  readonly intensity?: unknown;
  readonly position?: unknown;
};

const collectElements = (node: React.ReactNode): Array<React.ReactElement<TestElementProperties>> => {
  const elements: Array<React.ReactElement<TestElementProperties>> = [];

  Children.forEach(node, (child) => {
    if (!isValidElement(child)) {
      return;
    }

    const element = child as React.ReactElement<TestElementProperties>;
    elements.push(element);
    elements.push(...collectElements(element.props.children));
  });

  return elements;
};

describe('Lights', () => {
  it('should defer Environment rendering via useDeferredValue', async () => {
    const { Lights } = await import('#components/geometry/graphics/three/react/lights.js');
    const { renderHook } = await import('@testing-library/react');

    // oxlint-disable-next-line new-cap -- invoking component as function for hook testing
    renderHook(() => Lights({ environmentPreset: 'studio' }));

    expect(useDeferredValue).toHaveBeenCalled();
  });

  it('should pass dark-mode intensity factors when theme is dark', async () => {
    mockUseTheme.mockReturnValue({ theme: Theme.DARK });

    const { Lights } = await import('#components/geometry/graphics/three/react/lights.js');
    const { useFrame } = await import('@react-three/fiber');
    const { renderHook } = await import('@testing-library/react');
    const { applyLightingForCamera } = await import('#components/geometry/graphics/three/utils/lights.utils.js');

    // oxlint-disable-next-line new-cap -- invoking component as function for hook testing
    renderHook(() => Lights({ environmentPreset: 'studio' }));

    // Execute the useFrame callback that was registered
    const frameCallback = vi.mocked(useFrame).mock.calls.at(-1)?.[0];
    expect(frameCallback).toBeDefined();
    if (typeof frameCallback === 'function') {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- test-only mock
      frameCallback({} as any, 0, {} as any);
    }

    expect(applyLightingForCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining is untyped
        config: expect.objectContaining({
          themeIntensityScale: 0.5,
          themeAmbientBoost: 1.15,
        }),
      }),
    );

    mockUseTheme.mockReturnValue({ theme: Theme.LIGHT });
  });

  it('should pass scale 1.0 when theme is light', async () => {
    mockUseTheme.mockReturnValue({ theme: Theme.LIGHT });

    const { Lights } = await import('#components/geometry/graphics/three/react/lights.js');
    const { useFrame } = await import('@react-three/fiber');
    const { renderHook } = await import('@testing-library/react');
    const { applyLightingForCamera } = await import('#components/geometry/graphics/three/utils/lights.utils.js');

    vi.mocked(applyLightingForCamera).mockClear();

    // oxlint-disable-next-line new-cap -- invoking component as function for hook testing
    renderHook(() => Lights({ environmentPreset: 'studio' }));

    const frameCallback = vi.mocked(useFrame).mock.calls.at(-1)?.[0];
    if (typeof frameCallback === 'function') {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any -- test-only mock
      frameCallback({} as any, 0, {} as any);
    }

    expect(applyLightingForCamera).toHaveBeenCalledWith(
      expect.objectContaining({
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.objectContaining is untyped
        config: expect.objectContaining({
          themeIntensityScale: 1,
          themeAmbientBoost: 1,
        }),
      }),
    );
  });

  it('should use same-count fixed performance key and lower fill lights', async () => {
    mockUseTheme.mockReturnValue({ theme: Theme.LIGHT });

    const { Lights } = await import('#components/geometry/graphics/three/react/lights.js');
    const { renderHook } = await import('@testing-library/react');

    // oxlint-disable-next-line new-cap -- invoking component as function for hook testing
    const { result } = renderHook(() => Lights({ environmentPreset: 'performance', upDirection: 'x' }));
    const elements = collectElements(result.current);
    const hemisphere = elements.find((element) => element.type === 'hemisphereLight');

    // oxlint-disable-next-line tau-lint/no-hardcoded-color -- asserting Three.js performance light colors
    expect(hemisphere?.props.args).toEqual(['#ffffff', '#777777', 1]);
    expect(hemisphere?.props.position).toEqual([1, 0, 0]);

    const directionalLights = elements.filter((element) => element.type === 'directionalLight');
    expect(directionalLights).toHaveLength(3);

    const performanceLights = directionalLights.slice(1);
    expect(performanceLights.map((element) => element.props.position)).toEqual([
      [5, -1, -3],
      [-5, 1, 3],
    ]);
    expect(performanceLights.map((element) => element.props.intensity)).toEqual([2, 1.5]);
  });
});
