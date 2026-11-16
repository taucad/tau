import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { isProjectPath, useWorkspaceFrameState } from '#components/layout/use-workspace-frame-state.js';

/*
 * F11 (A15b2): the shell draws the workspace frame from the router's own state, so a click on a project draws it
 * before React Router's transition commits the route. `pending` is that gap: the router is at (or loading) a project
 * while the committed route is still the page being left.
 */

function Probe(): React.JSX.Element {
  const { drawn, pending } = useWorkspaceFrameState();
  return <output data-testid='frame-state'>{`${String(drawn)} ${String(pending)}`}</output>;
}

const readState = (): string | null => screen.getByTestId('frame-state').textContent;

describe('isProjectPath', () => {
  it('matches the project route and nothing else under /w/', () => {
    expect(isProjectPath('/w/home/gearbox')).toBe(true);
    expect(isProjectPath('/w/home/gearbox/')).toBe(true);
    expect(isProjectPath('/')).toBe(false);
    expect(isProjectPath('/w/home/gearbox/preview')).toBe(false);
    expect(isProjectPath('/w/home/gearbox.data')).toBe(false);
    expect(isProjectPath('/w/home')).toBe(false);
  });
});

describe('useWorkspaceFrameState', () => {
  it('draws the frame on a committed project route, not ahead of it', () => {
    render(
      <MemoryRouter initialEntries={['/w/home/gearbox']}>
        <Probe />
      </MemoryRouter>,
    );

    expect(readState()).toBe('true false');
  });

  it('draws nothing off a project route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Probe />
      </MemoryRouter>,
    );

    expect(readState()).toBe('false false');
  });

  it('draws the frame ahead of the route while the router loads a project, and settles once it commits', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<null>((resolve) => {
      release = () => {
        resolve(null);
      };
    });
    const router = createMemoryRouter(
      [
        { path: '/', element: <Probe /> },
        { path: '/w/:workspace/:project', element: <Probe />, loader: async () => held },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(readState()).toBe('false false');

    await act(async () => {
      void router.navigate('/w/home/gearbox');
      await Promise.resolve();
    });
    expect(router.state.navigation.state).toBe('loading');
    expect(readState()).toBe('true true');

    await act(async () => {
      release();
      await held;
    });
    expect(router.state.location.pathname).toBe('/w/home/gearbox');
    expect(readState()).toBe('true false');
  });

  it('keeps the frame drawn while leaving a project, until the next route commits', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<null>((resolve) => {
      release = () => {
        resolve(null);
      };
    });
    const router = createMemoryRouter(
      [
        { path: '/', element: <Probe />, loader: async () => held },
        { path: '/w/:workspace/:project', element: <Probe /> },
      ],
      { initialEntries: ['/w/home/gearbox'], hydrationData: { loaderData: {} } },
    );
    render(<RouterProvider router={router} />);
    expect(readState()).toBe('true false');

    await act(async () => {
      void router.navigate('/');
      await Promise.resolve();
    });
    expect(readState()).toBe('true false');

    await act(async () => {
      release();
      await held;
    });
    expect(readState()).toBe('false false');
  });
});
