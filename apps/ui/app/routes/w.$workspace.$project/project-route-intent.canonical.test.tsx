// @vitest-environment jsdom
/**
 * The route sink hands the canonical URL correction the path the data router committed (I2, A5b review round 13), so
 * a correction never overwrites an address bar the person has moved on from.
 */
import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter, useParams } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { useRouterRouteSink } from '#routes/w.$workspace.$project/project-route-intent.js';

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({
    projects: [{ id: 'a', locator: { backend: 'opfs' }, slugs: { workspaceSlug: 'ws', projectSlug: 'a-canonical' } }],
    isLoading: false,
  }),
}));

function Probe(): React.JSX.Element {
  const { workspace = '', project = '' } = useParams();
  useRouterRouteSink({
    committed: { slugs: { workspaceSlug: workspace, projectSlug: project }, projectId: project, chatId: undefined },
    createdChatId: undefined,
    slugsMissing: false,
    cloudOpen: false,
  });
  return <output>{project}</output>;
}

afterEach(() => {
  globalThis.history.replaceState(null, '', '/');
});

it('should leave, under the data router, a bar that has moved past the commit untouched (I2)', async () => {
  /* The person moved on: the address bar shows another path than the commit this sink last saw. */
  globalThis.history.replaceState(null, '', '/w/ws/elsewhere');
  const router = createMemoryRouter([{ path: '/w/:workspace/:project', element: <Probe /> }], {
    initialEntries: ['/w/ws/a'],
  });
  render(<RouterProvider router={router} />);
  await vi.waitFor(() => {
    expect(router.state.navigation.state).toBe('idle');
  });
  await new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
  expect(globalThis.location.pathname).toBe('/w/ws/elsewhere');
});

it('should correct the bar while it shows the commit', async () => {
  globalThis.history.replaceState(null, '', '/w/ws/a');
  const router = createMemoryRouter([{ path: '/w/:workspace/:project', element: <Probe /> }], {
    initialEntries: ['/w/ws/a'],
  });
  render(<RouterProvider router={router} />);
  await vi.waitFor(() => {
    expect(globalThis.location.pathname).toBe('/w/ws/a-canonical');
  });
});
