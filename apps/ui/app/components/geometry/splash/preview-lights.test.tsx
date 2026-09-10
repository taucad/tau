import { Children, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({
  Environment: ({ children, preset }: { readonly children: React.ReactNode; readonly preset?: string }) => (
    <group data-environment data-preset={preset}>
      {children}
    </group>
  ),
  Lightformer: () => <mesh data-lightformer />,
}));

describe('PreviewLights', () => {
  it('uses a bundled procedural environment instead of a remote preset', async () => {
    const { PreviewLights } = await import('#components/geometry/splash/preview-lights.js');
    // oxlint-disable-next-line new-cap -- invoking this pure component exposes its element contract without a canvas.
    const result = PreviewLights({}) as ReactElement<{ readonly children?: ReactNode }>;
    const environment = Children.toArray(result.props.children).find(
      (child) =>
        isValidElement<{ readonly preset?: string; readonly resolution?: number }>(child) && child.props.resolution,
    ) as ReactElement<{ readonly children?: React.ReactNode; readonly preset?: string }> | undefined;

    expect(environment).toBeDefined();
    expect(isValidElement(environment) ? environment.props.preset : undefined).toBeUndefined();
    expect(isValidElement(environment) ? Children.count(environment.props.children) : 0).toBe(2);
  });
});
