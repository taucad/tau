// @vitest-environment jsdom
/**
 * The route sink under the app's data router (I2, A5b review round 2): focus's `chatShown` for the project the route
 * is on waits while a navigation the person started is in flight, and is checked again once it commits. A replace
 * sent during the move would cancel it and land the person back on the project they left.
 */
import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { RouterProvider, createMemoryRouter, useParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FocusRouteCommand } from '#machines/focus.machine.js';
import { useRouterRouteSink } from '#routes/w.$workspace.$project/project-route-intent.js';

vi.mock('#hooks/use-project-slug-route.js', () => ({
  useCanonicalProjectUrlCorrection: () => undefined,
  useProjectIdBySlugs: () => undefined,
}));

/** The sink the project page's probe exposes, over the route's own project. */
const sinks: Array<(command: FocusRouteCommand) => void> = [];

function Probe(): React.JSX.Element {
  const { workspace = '', project = '' } = useParams();
  const sink = useRouterRouteSink({
    committed: { slugs: { workspaceSlug: workspace, projectSlug: project }, projectId: project, chatId: undefined },
    createdChatId: undefined,
    slugsMissing: false,
    cloudOpen: false,
  });
  const [registered] = useState(() => {
    sinks.push(sink);
    return true;
  });
  return <output>{registered ? project : ''}</output>;
}

afterEach(() => {
  sinks.length = 0;
});

const deferred = () => {
  let settle: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return {
    promise,
    resolve: () => {
      settle();
    },
  };
};

describe('useRouterRouteSink under a data router (I2)', () => {
  it("should not cancel the person's navigation to another project with the left project's chat correction", async () => {
    const loading = deferred();
    const router = createMemoryRouter(
      [
        {
          path: '/w/:workspace/:project',
          element: <Probe />,
          /* The move to A is in flight while A's data loads. */
          loader: async ({ params }) => {
            if (params['project'] === 'a') {
              await loading.promise;
            }
            return null;
          },
        },
      ],
      { initialEntries: ['/w/ws/b'] },
    );
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => {
      expect(router.state.navigation.state).toBe('idle');
      expect(sinks).toHaveLength(1);
    });

    act(() => {
      void router.navigate('/w/ws/a');
    });
    expect(router.state.navigation.state).toBe('loading');
    /* B's editor resolves its chat now, and focus, still on B, answers with B's correction. */
    act(() => {
      sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-b' });
    });
    await act(async () => {
      loading.resolve();
      await loading.promise;
    });

    await vi.waitFor(() => {
      expect(router.state.navigation.state).toBe('idle');
    });
    expect(router.state.location.pathname).toBe('/w/ws/a');
    expect(router.state.location.search).toBe('');
  });

  it('should apply a correction it held once the move ends on the same project', async () => {
    const loading = deferred();
    const router = createMemoryRouter(
      [
        {
          path: '/w/:workspace/:project',
          element: <Probe />,
          loader: async ({ request }) => {
            if (new URL(request.url).searchParams.has('panel')) {
              await loading.promise;
            }
            return null;
          },
        },
      ],
      { initialEntries: ['/w/ws/b'] },
    );
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => {
      expect(sinks).toHaveLength(1);
    });

    act(() => {
      void router.navigate('/w/ws/b?panel=files');
    });
    act(() => {
      sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-b' });
    });
    expect(router.state.location.search).toBe('');
    await act(async () => {
      loading.resolve();
      await loading.promise;
    });

    await vi.waitFor(() => {
      expect(router.state.location.search).toBe('?panel=files&chat=chat-b');
    });
    expect(router.state.location.pathname).toBe('/w/ws/b');
  });

  it('should drop a held correction when the move it waited for asked for another chat (I18)', async () => {
    const loading = deferred();
    const router = createMemoryRouter(
      [
        {
          path: '/w/:workspace/:project',
          element: <Probe />,
          loader: async ({ request }) => {
            if (new URL(request.url).searchParams.has('chat')) {
              await loading.promise;
            }
            return null;
          },
        },
      ],
      { initialEntries: ['/w/ws/b'] },
    );
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => {
      expect(sinks).toHaveLength(1);
    });

    /* The person opens chat 2 from a link; the editor resolves the chat the route had before it. */
    act(() => {
      void router.navigate('/w/ws/b?chat=chat-2');
    });
    act(() => {
      sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-1' });
    });
    await act(async () => {
      loading.resolve();
      await loading.promise;
    });

    await vi.waitFor(() => {
      expect(router.state.navigation.state).toBe('idle');
    });
    expect(router.state.location.search).toBe('?chat=chat-2');
  });

  it('should apply a correction held across its own replace (the last chat wins, as on main)', async () => {
    const loading = deferred();
    const router = createMemoryRouter(
      [
        {
          path: '/w/:workspace/:project',
          element: <Probe />,
          loader: async ({ request }) => {
            if (new URL(request.url).searchParams.has('chat')) {
              await loading.promise;
            }
            return null;
          },
        },
      ],
      { initialEntries: ['/w/ws/b'] },
    );
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => {
      expect(sinks).toHaveLength(1);
    });

    act(() => {
      sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-1' });
    });
    expect(router.state.navigation.state).toBe('loading');
    /* The person starts a new chat while the sink's own replace is loading. */
    act(() => {
      sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-3' });
    });
    await act(async () => {
      loading.resolve();
      await loading.promise;
    });

    await vi.waitFor(() => {
      expect(router.state.location.search).toBe('?chat=chat-3');
    });
    expect(router.state.navigation.state).toBe('idle');
  });

  it('should hold a correction while the router is at rest ahead of the commit React shows', async () => {
    const router = createMemoryRouter([{ path: '/w/:workspace/:project', element: <Probe /> }], {
      initialEntries: ['/w/ws/b'],
    });
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => {
      expect(sinks).toHaveLength(1);
    });

    /* Outside `act`, React applies the router's state in a transition it has not committed yet. */
    void router.navigate('/w/ws/b?chat=chat-2');
    for (let turn = 0; turn < 20 && router.state.location.search !== '?chat=chat-2'; turn += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Each turn lets the router settle one step.
      await Promise.resolve();
    }
    expect(router.state.navigation.state).toBe('idle');
    sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-1' });
    await act(async () => {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 20);
      });
    });

    expect(router.state.location.search).toBe('?chat=chat-2');
  });

  it('should keep a held correction across a move from an empty chat parameter to none', async () => {
    const loading = deferred();
    const router = createMemoryRouter(
      [
        {
          path: '/w/:workspace/:project',
          element: <Probe />,
          loader: async ({ request }) => {
            if (!new URL(request.url).searchParams.has('chat')) {
              await loading.promise;
            }
            return null;
          },
        },
      ],
      { initialEntries: ['/w/ws/b?chat='] },
    );
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => {
      expect(sinks).toHaveLength(1);
    });

    act(() => {
      void router.navigate('/w/ws/b');
    });
    act(() => {
      sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-1' });
    });
    await act(async () => {
      loading.resolve();
      await loading.promise;
    });

    await vi.waitFor(() => {
      expect(router.state.location.search).toBe('?chat=chat-1');
    });
  });

  it('should replay a held correction when the move ends back on the same URL as a new history entry', async () => {
    const router = createMemoryRouter([{ path: '/w/:workspace/:project', element: <Probe /> }], {
      initialEntries: ['/w/ws/b'],
    });
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => {
      expect(sinks).toHaveLength(1);
    });
    const settle = async (search: string): Promise<void> => {
      for (let turn = 0; turn < 20 && router.state.location.search !== search; turn += 1) {
        // oxlint-disable-next-line no-await-in-loop -- Each turn lets the router settle one step.
        await Promise.resolve();
      }
    };

    /* Two moves React commits as one: away to `?x=1` and back to the same URL, a new entry with a new key. */
    void router.navigate('/w/ws/b?x=1');
    await settle('?x=1');
    sinks[0]?.({ type: 'chatShown', projectId: 'b', chatId: 'chat-1' });
    void router.navigate('/w/ws/b');
    await settle('');
    await act(async () => {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 20);
      });
    });

    await vi.waitFor(() => {
      expect(router.state.location.search).toBe('?chat=chat-1');
    });
  });
});
