// @vitest-environment jsdom
/**
 * The canonical URL correction (D8) under the route's `from` guard (I2, A5b): it follows every external rename of the
 * open project, and leaves alone an address bar the person has moved on from.
 */
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCanonicalProjectUrlCorrection } from '#hooks/use-project-slug-route.js';

const listing = vi.hoisted(() => ({ projectSlug: 'p', secondSlug: 'two' }));

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({
    projects: [
      { id: 'proj_1', slugs: { workspaceSlug: 'home', projectSlug: listing.projectSlug } },
      { id: 'proj_2', slugs: { workspaceSlug: 'home', projectSlug: listing.secondSlug } },
    ],
    isLoading: false,
  }),
}));

const showPath = (path: string): void => {
  globalThis.history.replaceState(null, '', path);
};

afterEach(() => {
  listing.projectSlug = 'p';
  listing.secondSlug = 'two';
  showPath('/');
});

describe('useCanonicalProjectUrlCorrection with the route path it resolved from', () => {
  it('should follow a second external rename after correcting the address bar (D8)', () => {
    showPath('/w/home/p');
    /* The router never sees `replaceState`: its path stays the one it resolved from. */
    const { rerender } = renderHook(() => useCanonicalProjectUrlCorrection('proj_1', '', '/w/home/p'));
    expect(globalThis.location.pathname).toBe('/w/home/p');

    listing.projectSlug = 'q';
    rerender();
    expect(globalThis.location.pathname).toBe('/w/home/q');

    listing.projectSlug = 'r';
    rerender();
    expect(globalThis.location.pathname).toBe('/w/home/r');
  });

  it('should leave the address bar alone once the person has navigated past the path it resolved from (I2)', () => {
    /* The person clicked another project before this one's slugs resolved. */
    showPath('/w/home/other');
    listing.projectSlug = 'q';
    renderHook(() => useCanonicalProjectUrlCorrection('proj_1', '', '/w/home/p'));

    expect(globalThis.location.pathname).toBe('/w/home/other');
  });

  it("should not take a bar showing another project's corrected address for this project's own write (round 6)", () => {
    showPath('/w/home/p');
    listing.projectSlug = 'q';
    const { rerender } = renderHook(({ id, from }) => useCanonicalProjectUrlCorrection(id, '', from), {
      initialProps: { id: 'proj_1', from: '/w/home/p' },
    });
    expect(globalThis.location.pathname).toBe('/w/home/q');
    /* The route moves to project 2 at its current path. */
    showPath('/w/home/two');
    rerender({ id: 'proj_2', from: '/w/home/two' });
    expect(globalThis.location.pathname).toBe('/w/home/two');
    /* The person goes Back to project 1's corrected entry; before the route commits it, project 2 is renamed. */
    showPath('/w/home/q');
    listing.secondSlug = 'two-renamed';
    rerender({ id: 'proj_2', from: '/w/home/two' });

    expect(globalThis.location.pathname).toBe('/w/home/q');
  });
});
