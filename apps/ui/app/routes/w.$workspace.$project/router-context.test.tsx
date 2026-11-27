import { render } from '@testing-library/react';
import { useContext } from 'react';
import type { ReactElement } from 'react';
// oxlint-disable-next-line no-restricted-imports -- this test pins the one private context Tau reads (RD9 amendment).
import { createMemoryRouter, RouterProvider, UNSAFE_DataRouterContext } from 'react-router';
import { describe, expect, it } from 'vitest';

/*
 * `project-route-intent.tsx` (ProjectFocus I2) and `use-workspace-frame-state.ts` (A15b2, F11) read the router's live
 * state through `UNSAFE_DataRouterContext`.
 * React Router changes its private contexts in minor releases, so this fails the bump that stops the context carrying
 * the router, before the route sink silently loses its deferral.
 */
describe('UNSAFE_DataRouterContext', () => {
  it('should carry the data router, whose live state names the navigation', () => {
    let seen: unknown;
    const Probe = (): ReactElement => {
      seen = useContext(UNSAFE_DataRouterContext)?.router;
      return <span />;
    };
    const router = createMemoryRouter([{ path: '/', element: <Probe /> }]);

    render(<RouterProvider router={router} />);

    expect(seen).toBe(router);
    expect(router.state.navigation.state).toBe('idle');
    expect(router.state.location.pathname).toBe('/');
  });
});
