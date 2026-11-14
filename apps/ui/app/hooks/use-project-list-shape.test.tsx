// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { routeLoaderData } = vi.hoisted(() => ({
  routeLoaderData: vi.fn((_routeId: string): unknown => undefined),
}));
vi.mock('react-router', () => ({ useRouteLoaderData: routeLoaderData }));

const { useProjectListShape } = await import('#hooks/use-project-list-shape.js');
const { projectListShapeOf, projectListShapeStore } = await import('#lib/project-list-shape.lib.js');

afterEach(() => {
  globalThis.localStorage.clear();
  projectListShapeStore.reset();
  routeLoaderData.mockReset();
});

describe('useProjectListShape', () => {
  it('reads the remembered count from the root loader', () => {
    routeLoaderData.mockReturnValue({ projectListCount: 4 });

    renderHook(() => useProjectListShape());

    expect(routeLoaderData).toHaveBeenCalledWith('root');
  });

  /* The desktop (SPA) root has no loader; the shape is unknown until the client reads its own. */
  it('reports an unknown shape without root loader data or a remembered listing', () => {
    const { result } = renderHook(() => useProjectListShape());

    expect(result.current).toBeUndefined();
  });

  it('follows the client snapshot after a listing', () => {
    projectListShapeStore.remember(projectListShapeOf([{}]));

    const { result } = renderHook(() => useProjectListShape());

    expect(result.current).toEqual({ count: 1, projects: [] });
  });
});
