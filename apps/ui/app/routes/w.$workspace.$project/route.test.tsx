import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { UIMatch } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { projectToManifest } from '@taucad/types';
import type { ProjectListItem } from '#types/project.types.js';
import type { Workspace } from '#filesystem/handle-store.js';

const cubeId = 'proj_aaaaaaaaaaaaaaaaaaaaa';
const gearId = 'proj_bbbbbbbbbbbbbbbbbbbbb';

const listItem = (id: string, relativeDirectory: string, workspaceId?: string): ProjectListItem => ({
  ...projectToManifest({
    id,
    name: id,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
  lastActivityAt: 0,
  locator:
    workspaceId === undefined
      ? { backend: 'opfs', storageRootKey: 'opfs:origin', relativeDirectory }
      : { backend: 'webaccess', storageRootKey: `webaccess:${workspaceId}`, relativeDirectory, workspaceId },
  slugs: {
    workspaceSlug: workspaceId === undefined ? 'home' : 'tau-workspace',
    projectSlug: relativeDirectory.slice(1),
  },
});

const workspaces: Workspace[] = [
  { workspaceId: 'wsp_live', name: 'Tau Workspace', lastConnectedAt: 1, slug: 'tau-workspace' },
];
let projects: ProjectListItem[] = [];
let isLoading = false;
const focusedChatResolvedCallbacks = vi.hoisted(() => [] as Array<((chatId: string) => void) | undefined>);

vi.mock('#hooks/use-projects.js', () => ({
  useProjects: () => ({ projects, isLoading }),
}));
vi.mock('#filesystem/handle-store.js', () => ({
  legacyWorkspaceSlugTombstones: ['opfs', 'indexeddb'],
  listWorkspaces: async () => workspaces,
}));
vi.mock('#routes/w.$workspace.$project/project-route.js', () => ({
  ProjectRouteProviders: ({
    children,
    onFocusedChatResolved,
    projectId,
    requestedChatId,
  }: React.PropsWithChildren<{
    onFocusedChatResolved?: (chatId: string) => void;
    projectId: string;
    requestedChatId?: string;
  }>) => {
    focusedChatResolvedCallbacks.push(onFocusedChatResolved);
    return (
      <div data-testid='project-route' data-project-id={projectId} data-requested-chat-id={requestedChatId}>
        {children}
        <button type='button' onClick={() => onFocusedChatResolved?.('chat_resolved')}>
          Resolve chat
        </button>
      </div>
    );
  },
  projectRouteHandle: {},
  ProjectChatRoute: () => <div>chat</div>,
}));
vi.mock('#routes/w.$workspace.$project/project-not-found.js', () => ({
  ProjectNotFound: () => <div>Project Not Found</div>,
}));

const workspaceRoute = await import('./route.js');
const testMatch = {
  id: 'test',
  pathname: '/',
  params: {},
  data: undefined,
  loaderData: {},
  handle: undefined,
} satisfies UIMatch;

function LocationProbe(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <div data-testid='location'>{`${location.pathname}${location.search}`}</div>
      <Link to={`${location.pathname}?chat=chat_two`}>Open chat two</Link>
      <button
        type='button'
        onClick={() => {
          void navigate(-1);
        }}
      >
        Back
      </button>
    </div>
  );
}

const renderAt = (path: string): void => {
  const Provider = workspaceRoute.handle.providers!(testMatch);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <Routes>
          <Route
            path='/w/:workspace/:project'
            element={
              <Provider>
                <div>project content</div>
              </Provider>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.restoreAllMocks();
  focusedChatResolvedCallbacks.length = 0;
  globalThis.history.replaceState(null, '', '/');
  isLoading = false;
  projects = [
    listItem(cubeId, '/cube-design', 'wsp_live'),
    listItem(gearId, '/Gear Box (v2)', 'wsp_live'),
    listItem('proj_ccccccccccccccccccccc', '/scratch-part'),
  ];
});

describe('/w/{workspace}/{project}', () => {
  it('resolves the workspace and project slugs to the project id', async () => {
    renderAt('/w/tau-workspace/cube-design');

    expect(await screen.findByTestId('project-route')).toHaveAttribute('data-project-id', cubeId);
  });

  it('resolves percent-encoded and case-folded slugs (D11/F3)', async () => {
    renderAt('/w/TAU-Workspace/Gear%20Box%20(v2)');

    expect(await screen.findByTestId('project-route')).toHaveAttribute('data-project-id', gearId);
  });

  it('addresses the built-in roots by their reserved slugs', async () => {
    renderAt('/w/home/scratch-part');

    expect(await screen.findByTestId('project-route')).toHaveAttribute('data-project-id', 'proj_ccccccccccccccccccccc');
  });

  it('passes decoded chat query changes through without remounting the project route', async () => {
    renderAt('/w/tau-workspace/cube-design?chat=chat%2Fone');

    const route = await screen.findByTestId('project-route');
    expect(route).toHaveAttribute('data-requested-chat-id', 'chat/one');
    fireEvent.click(screen.getByRole('link', { name: 'Open chat two' }));
    await waitFor(() => {
      expect(route).toHaveAttribute('data-requested-chat-id', 'chat_two');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => {
      expect(route).toHaveAttribute('data-requested-chat-id', 'chat/one');
    });
  });

  it('keeps the focused-chat resolver stable while only the chat query changes', async () => {
    renderAt('/w/tau-workspace/cube-design?chat=chat_one');

    await screen.findByTestId('project-route');
    const resolver = focusedChatResolvedCallbacks.at(-1);
    fireEvent.click(screen.getByRole('link', { name: 'Open chat two' }));
    await waitFor(() => {
      expect(screen.getByTestId('project-route')).toHaveAttribute('data-requested-chat-id', 'chat_two');
    });

    expect(focusedChatResolvedCallbacks.at(-1)).toBe(resolver);
  });

  it('canonicalises an absent or invalid query to the resolved chat by replacement', async () => {
    renderAt('/w/tau-workspace/cube-design?chat=missing');
    await screen.findByTestId('project-route');

    fireEvent.click(screen.getByRole('button', { name: 'Resolve chat' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/w/tau-workspace/cube-design?chat=chat_resolved');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/w/tau-workspace/cube-design?chat=chat_resolved');
  });

  it('preserves Share and OAuth return intent while resolving the focused chat', async () => {
    renderAt(
      '/w/tau-workspace/cube-design?chat=missing&workbench=share&shareAuth=github-gist&shareProvider=github-gist',
    );
    await screen.findByTestId('project-route');

    fireEvent.click(screen.getByRole('button', { name: 'Resolve chat' }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/w/tau-workspace/cube-design?chat=chat_resolved&workbench=share&shareAuth=github-gist&shareProvider=github-gist',
      );
    });
  });

  it.each([
    ['/w/wsp_live/proj_aaaaaaaaaaaaaaaaaaaaa', '/w/tau-workspace/cube-design'],
    ['/w/tau-workspace/proj_aaaaaaaaaaaaaaaaaaaaa', '/w/tau-workspace/cube-design'],
    ['/w/wsp_live/cube-design', '/w/tau-workspace/cube-design'],
  ])('canonicalises id-shaped segments in %s', async (path, canonical) => {
    const replaceState = vi.spyOn(globalThis.history, 'replaceState');

    renderAt(path);

    expect(await screen.findByTestId('project-route')).toHaveAttribute('data-project-id', cubeId);
    await waitFor(() => {
      expect(replaceState).toHaveBeenCalledWith(globalThis.history.state, '', canonical);
    });
  });

  it.each(['opfs', 'indexeddb'])('renders not-found for the reserved %s tombstone', async (workspace) => {
    renderAt(`/w/${workspace}/scratch-part`);

    expect(await screen.findByText('Project Not Found')).toBeInTheDocument();
  });

  it('renders not-found for an unknown workspace slug', async () => {
    renderAt('/w/not-a-workspace/cube-design');

    expect(await screen.findByText('Project Not Found')).toBeInTheDocument();
    expect(screen.queryByTestId('project-route')).not.toBeInTheDocument();
  });

  it('does not flash not-found while the listing is still loading', () => {
    isLoading = true;
    renderAt('/w/tau-workspace/cube-design');

    expect(screen.getByRole('status', { name: 'Opening project' })).toBeInTheDocument();
    expect(screen.queryByText('Project Not Found')).not.toBeInTheDocument();
  });
});
