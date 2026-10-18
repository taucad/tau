// @vitest-environment jsdom
/**
 * The app's viewer environment follows the router location: a client-side navigation that adds or changes
 * `?graphicsBackend=` switches the backend the viewer requests, as the thumbnail-generation e2e route relies on.
 */

import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useViewerEnvironment } from '@taucad/viewer/environment/viewer-environment';

import { AppViewerEnvironment } from '#components/geometry/app-viewer-environment.js';

vi.mock('#hooks/use-theme.js', () => ({
  useTheme: () => ({ theme: 'light', isHighContrast: false }),
}));

vi.mock('#hooks/use-color.js', () => ({
  useColor: () => ({ serialized: { hex: 'accent' } }),
}));

function BackendProbe(): React.JSX.Element {
  return <output aria-label='graphics backend'>{useViewerEnvironment().graphicsBackend}</output>;
}

const mountAt = (path: string): ReturnType<typeof createMemoryRouter> => {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AppViewerEnvironment>
            <BackendProbe />
          </AppViewerEnvironment>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
};

describe('AppViewerEnvironment', () => {
  it('switches the backend when a client-side navigation adds the override', async () => {
    const router = mountAt('/__e2e/user-project-thumbnail-generation');
    expect(screen.getByLabelText('graphics backend')).toMatchTextContent('webgl');

    await act(async () => router.navigate('/w/workspace/project?graphicsBackend=webgpu'));

    expect(screen.getByLabelText('graphics backend')).toMatchTextContent('webgpu');
  });

  it('falls back to the flag when a navigation removes the override', async () => {
    const router = mountAt('/w/workspace/project?graphicsBackend=webgpu');
    expect(screen.getByLabelText('graphics backend')).toMatchTextContent('webgpu');

    await act(async () => router.navigate('/w/workspace/project'));

    expect(screen.getByLabelText('graphics backend')).toMatchTextContent('webgl');
  });
});
